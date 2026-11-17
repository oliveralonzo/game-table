"""Authenticated scheduling API. Account IDs always come from verified tokens."""
from asyncio import Lock, create_task, sleep, to_thread
from collections import Counter
from copy import deepcopy
from random import Random
from time import monotonic
from uuid import uuid4

from game_table.tournament.competition import Competition, Result
from dataclasses import asdict
from game_table.api.ws.errors import error_response


def register_tournament_events(sio, accounts, tournaments, auth, tables=None):
    async def request(data, operation):
        try:
            if accounts is None or tournaments is None or auth is None:
                raise RuntimeError('Tournaments are not configured.')
            payload = data or {}
            def run():
                identity = auth.verify_token(payload.get('token'))
                account = accounts.find_by_auth_identity(identity.provider, identity.subject)
                if account is None:
                    raise PermissionError('Account does not exist.')
                return operation(account.id, payload)
            return await to_thread(run)
        except Exception as exc:
            return error_response(exc)

    scheduling_lock = Lock()
    competitions = {}
    viewers = {}
    attempts = {}
    timers = set()
    round_tables = {}
    assignment_deadlines = {}

    def stored_summary(tournament_id):
        load = getattr(tournaments.repository, 'competition_summary', None)
        return load(tournament_id) if load else None

    def view(tournament, account):
        event = competitions.get(tournament['id'])
        if event:
            tournament.update(stage=event.stage, readiness_deadline=event.deadline,
                              readiness_id=attempts.get(tournament['id']),
                              round=event.round,
                              can_enter_late=event.stage == 'qualification' and event.round == 1
                              and not event.queue.complete and account not in event.players,
                              awaiting_response=account in event.invited and account not in event.responded)
        assigned = round_tables.get(tournament['id'], {})
        tournament['tables'] = [tables.table_preview(table) for table in assigned.values()] if tables else []
        if event and event.stage in ('qualification', 'knockout'):
            tournament['assignment'] = next((
                {'id': game.id, 'table_code': assigned[game.id].table_code,
                 'deadline': assignment_deadlines[tournament['id'], game.id]}
                for game in event.queue.assignments.values()
                if account in game.seats and game.id in assigned and game.id not in event.queue.results), None)
        if event and event.stage == 'draft':
            slot = event.next_pick(tournaments.clock())
            pending = next((key for key, player in event.draft_picks.items()
                            if player == account and key not in event.draft_confirmed), None)
            if pending is not None:
                tournament['draft_prompt'] = {'slot': pending, 'decision': 'ready',
                                               'deadline': event.draft_deadlines[pending]}
            elif slot and event.seeds[slot - 1] == account:
                tournament['draft_prompt'] = {'slot': slot, 'decision': 'partner_choice',
                                               'deadline': event.draft_deadlines[slot],
                                               'candidates': event.draft_candidates()}
        if event and event.players:
            tournament['standings'] = event.standings()
        if event and event.teams:
            tournament['bracket'] = [
                {**row, 'table_code': table.table_code if table else None,
                 'live_score': getattr(table, 'tournament_live_score', None)}
                for row in event.bracket()
                for table in (assigned.get(row['assignment_id']),)
            ]
        if event and event.champions:
            tournament['champions'] = event.champions
        return tournament

    async def publish(tournament):
        await sio.emit('tournament:updated', {
            'group_id': tournament['group_id'], 'tournament_id': tournament['id'],
        }, room=f"group-tables:{tournament['group_id']}")

    def provision(tournament, games):
        if not tables:
            return
        tid = tournament['id']
        round_tables[tid] = {}
        for game in games:
            offer(tournament, game)

    def offer(tournament, game):
        tid = tournament['id']
        table = tables.create_tournament_table(tournament, game)
        table.tournament_stage = competitions[tid].stage
        if table.tournament_stage == 'knockout':
            match = competitions[tid].match_assignments[game.id]
            table.tournament_keep_seats = sum(competitions[tid].series[match]) > 0
        round_tables[tid][game.id] = table
        schedule_offer(tournament, game.id, table)

    def schedule_offer(tournament, assignment_id, table):
        tid = tournament['id']
        deadline = tournaments.clock() + 30_000
        assignment_deadlines[tid, assignment_id] = deadline
        task = create_task(expire_assignment(tournament, assignment_id, table, deadline))
        timers.add(task)
        task.add_done_callback(timers.discard)

    async def expire_assignment(tournament, assignment_id, table, deadline):
        await sleep(max(0, deadline - tournaments.clock()) / 1000)
        tid = tournament['id']
        event = competitions[tid]
        if event.stage != 'qualification' or round_tables[tid].get(assignment_id) is not table:
            return
        if assignment_id in event.queue.results or getattr(table, 'tournament_game_started', False):
            return
        present = {table.members[seat.member_id].account_id for seat in table.seats
                   if seat.member_id in table.members}
        if len(present) == 4:
            return
        candidates = sorted({account for target, account, seen in viewers.values()
                             if target == tid and seen >= monotonic() - 25})
        replacement = event.resolve_missing_assignment(assignment_id, present, candidates)
        if replacement:
            table.tournament_seats = replacement.seats
            schedule_offer(tournament, assignment_id, table)
        else:
            table.tournament_assignment_closed = True
            round_tables[tid].pop(assignment_id, None)
        await advance(tournament, event)

    async def advance(tournament, event):
        if event.queue.complete:
            if event.stage == 'knockout':
                provision(tournament, event.assign_knockouts())
            elif event.stage == 'qualification':
                if event.round == 6:
                    event.open_draft(Random())
                    round_tables[tournament['id']] = {}
                    if event.stage == 'draft':
                        task = create_task(run_draft(tournament, event))
                        timers.add(task)
                        task.add_done_callback(timers.discard)
                else:
                    provision(tournament, event.assign_round(event.players, Random()))
        await publish(tournament)

    async def run_draft(tournament, event):
        while event.stage == 'draft':
            now = tournaments.clock()
            changed = False
            for slot, deadline in tuple(event.draft_deadlines.items()):
                if deadline <= now and slot in event.draft_picks:
                    event.answer_partner(slot, False, now)
                    changed = True
            slot = event.next_pick(now)
            if slot and not event.draft_candidates():
                event.stage = 'completed'
                changed = True
            elif slot and event.draft_deadlines[slot] <= now:
                event.pick_partner(slot, Random().choice(event.draft_candidates()), now)
                changed = True
            if changed:
                await publish(tournament)
            await sleep(0.5)

    @sio.on('tournament:late_join')
    async def late_join(sid, data=None):
        response = await request(data, lambda account, p: {
            'account': account, 'tournament': tournaments.details(account, p.get('tournament_id'))})
        if 'error' in response:
            return response
        tournament = response['tournament']
        event = competitions.get(tournament['id'])
        try:
            if not event:
                raise ValueError('Late entry is closed.')
            event.late_join(response['account'])
        except ValueError as error:
            return error_response(error)
        await publish(tournament)
        return {'tournament': view(tournament, response['account'])}

    @sio.on('tournament:draft')
    async def draft(sid, data=None):
        response = await request(data, lambda account, p: {
            'account': account, 'tournament': tournaments.details(account, p.get('tournament_id'))})
        if 'error' in response:
            return response
        account, tournament = response['account'], response['tournament']
        event = competitions.get(tournament['id'])
        payload = data or {}
        slot = payload.get('slot')
        now = tournaments.clock()
        try:
            if not event or event.stage != 'draft' or type(slot) is not int or now >= event.draft_deadlines.get(slot, 0):
                raise ValueError('The draft offer has expired.')
            if slot in event.draft_picks:
                if event.draft_picks[slot] != account:
                    raise PermissionError('This offer is for another player.')
                event.answer_partner(slot, payload.get('accepted') is True, now)
                if len(event.draft_confirmed) == event.captain_count:
                    event.lock_pairs({key: (event.seeds[key - 1], player) for key, player in event.draft_picks.items()})
                    provision(tournament_contexts[tournament['id']], event.assign_knockouts())
            else:
                if event.seeds[slot - 1] != account:
                    raise PermissionError('Only the captain may choose.')
                player = payload.get('player')
                if player == '__random__' and event.draft_candidates():
                    player = Random().choice(event.draft_candidates())
                event.pick_partner(slot, player, now)
        except (ValueError, PermissionError) as error:
            return error_response(error)
        await publish(tournament)
        return {'tournament': view(tournament, account)}

    def history(tournament_id):
        load = getattr(tournaments.repository, 'game_history', None)
        return load(tournament_id) if load else []

    def history_entry(game):
        winner = game['winning_team_index']
        scores = game['team_scores']
        winning_side = winner if winner in (0, 1) else 0
        sides = [[p for p in game['participant_snapshots'] if p['team_index'] == side]
                 for side in range(2)]
        stage = game['stage']
        if stage == 'knockout':
            matchup = game['matchup']
            stage = 'semifinal' if matchup in ('1-4', '2-3', 'semifinal-1', 'semifinal-2') else 'final'
        return dict(id=game['id'], date=game['completed_at'], stage=stage,
                    qualification_round=game['qualification_round'], winners=sides[winning_side],
                    others=sides[1 - winning_side],
                    draw=winner not in (0, 1),
                    score='–'.join(str(scores[side]) for side in (winning_side, 1 - winning_side)))

    async def completed(table, points, hands, winner, rounds_played):
        tid = table.tournament_id
        event = competitions.get(tid)
        if not event or event.stage not in ('qualification', 'knockout'):
            return
        assignment_id = next((key for key, value in round_tables.get(tid, {}).items()
                              if value is table), None)
        if assignment_id is None:
            return
        if assignment_id in event.queue.results:
            return
        stage = event.stage
        assignment = event.queue.assignments[assignment_id]
        match = event.match_assignments.get(assignment_id)
        save = getattr(tournaments.repository, 'save_game', None)
        if save:
            event = deepcopy(event)
        result = Result(points, hands, winner)
        if event.stage == 'knockout':
            if assignment_id in event.match_assignments and all(seat.member_id in table.members for seat in table.seats):
                match = event.match_assignments[assignment_id]
                players = tuple(table.members[seat.member_id].account_id for seat in table.seats)
                for seed, pair in zip(match, (players[::2], players[1::2])):
                    if set(pair) == set(event.teams[seed]):
                        event.teams[seed] = pair
            event.record_knockout(assignment_id, result)
        else:
            event.record_qualification(assignment_id, result)
        if save:
            players = getattr(table, 'tournament_game_players', None)
            if players is None:
                names = {member.account_id: member.name for member in table.members.values()}
                players = [(account, names.get(account)) for account in assignment.seats]
            participants = [
                dict(account_id=account, display_name=name, seat_index=index,
                     team_index=index % 2, is_guest=False, username=None)
                for index, (account, name) in enumerate(players)
            ]
            summary = dict(
                stage='completed' if event.champions else 'interrupted',
                standings=event.standings(),
                bracket=[dict(row, table_code=None) for row in event.bracket()] if event.teams else [],
                champions=event.champions or [],
            )
            save(tid, assignment_id, stage, event.round if match is None else None,
                 '-'.join(map(str, match)) if match else None, table.active_game_id,
                 table.table_code, tournaments.clock(), points, winner, rounds_played, participants, summary)
            competitions[tid] = event
        await advance(tournament_contexts[tid], event)

    async def update_live_score(table, points):
        tournament = tournament_contexts.get(table.tournament_id)
        if tournament is None or getattr(table, 'tournament_live_score', None) == points:
            return
        table.tournament_live_score = points
        await publish(tournament)

    sio.tournament_live_score = update_live_score
    sio.tournament_game_completed = completed
    tournament_contexts = {}

    async def finish(tournament, event, attempt):
        while attempts.get(tournament['id']) == attempt and event.deadline is not None:
            remaining = event.deadline - tournaments.clock()
            if remaining <= 0:
                if event.close_readiness(tournaments.clock()):
                    games = event.assign_round(event.players, Random())
                    provision(tournament, games)
                await publish(tournament)
                return
            await sleep(remaining / 1000)

    @sio.on('tournament:leave_view')
    async def leave_view(sid, data=None):
        if viewers.get(sid, (None,))[0] == (data or {}).get('tournament_id'):
            viewers.pop(sid, None)

    @sio.on('tournament:delete')
    async def delete(sid, data=None):
        def remove(account, payload):
            tournament = tournaments.get(account, payload.get('tournament_id'))
            event = competitions.get(tournament.id)
            if event and (event.stage != 'scheduled' or event.deadline is not None):
                raise ValueError('Cannot delete a tournament after readiness opens.')
            tournaments.delete(account, tournament.id)
            return {'group_id': tournament.group_id, 'id': tournament.id}

        async with scheduling_lock:
            response = await request(data, remove)
            if 'error' in response:
                return response
            tid = response['id']
            competitions.pop(tid, None)
            attempts.pop(tid, None)
            tournament_contexts.pop(tid, None)
            for session, (target, _, _) in tuple(viewers.items()):
                if target == tid:
                    viewers.pop(session, None)
        await publish(response)
        return {'deleted': True}

    @sio.on('tournament:start')
    async def start(sid, data=None):
        async with scheduling_lock:
            return await start_tournament(data)

    async def start_tournament(data):
        def authorize(account, payload):
            tournament = tournaments.details(account, payload.get('tournament_id'))
            if stored_summary(tournament['id']) is not None:
                raise ValueError('This tournament already has recorded games.')
            group = tournaments.groups.get_group(account, tournament['group_id'])
            if group.membership_for(account).role.value not in ('owner', 'admin'):
                raise PermissionError('Only group admins may start tournaments.')
            tournament.update(group_name=group.name, group_public_id=group.public_id)
            return {'tournament': tournament, 'account': account,
                    'members': {member.account_id for member in group.memberships if member.left_at is None}}
        response = await request(data, authorize)
        if 'error' in response:
            return response
        tournament = response['tournament']
        tid = tournament['id']
        event = competitions.setdefault(tid, Competition(tournament['scheduled_at']))
        cutoff = monotonic() - 25
        for session, (_, _, seen) in tuple(viewers.items()):
            if seen < cutoff:
                viewers.pop(session, None)
        connected = {account for target, account, _ in viewers.values()
                     if target == tid and account in response['members']}
        try:
            event.offer_start(tournaments.clock(), connected)
        except ValueError as error:
            return error_response(error)
        tournament_contexts[tid] = tournament
        attempt = attempts[tid] = str(uuid4())
        task = create_task(finish(tournament, event, attempt))
        timers.add(task)
        task.add_done_callback(timers.discard)
        await publish(tournament)
        return {'tournament': view(tournament, response['account'])}

    @sio.on('tournament:ready')
    async def ready(sid, data=None):
        response = await request(data, lambda account, p: {
            'tournament': tournaments.details(account, p.get('tournament_id')), 'account': account})
        if 'error' in response:
            return response
        tournament = response['tournament']
        tid = tournament['id']
        try:
            event = competitions.get(tid)
            if event is None or attempts.get(tid) != (data or {}).get('attempt'):
                raise ValueError('No active readiness offer.')
            event.confirm(response['account'], tournaments.clock(), accepted=(data or {}).get('accepted') is True)
        except ValueError as error:
            return error_response(error)
        return {'tournament': view(tournament, response['account'])}

    @sio.on('tournament:create')
    async def create(sid, data=None):
        return await request(data, lambda account, p: {'tournament': asdict(tournaments.create(
            account, p.get('group_id'), p.get('scheduled_at'), p.get('rules')))})

    @sio.on('tournament:list')
    async def list_tournaments(sid, data=None):
        def load(account, payload):
            items = tournaments.list_details(account, payload.get('group_id'))
            for item in items:
                event = competitions.get(item['id'])
                saved = stored_summary(item['id']) if event is None else None
                champions = event.champions if event else (saved or {}).get('champions')
                if champions:
                    item.update(stage='completed', champions=champions)
            return {'tournaments': items}

        return await request(data, load)

    @sio.on('tournament:get')
    async def get(sid, data=None):
        def load(account, payload):
            tournament = tournaments.details(account, payload.get('tournament_id'))
            if tournament['id'] not in competitions:
                summary = stored_summary(tournament['id'])
                if summary is not None:
                    tournament.update(summary, stage=summary.get('stage', 'interrupted'))
                    standings = summary.get('standings', [])
                    if any('points_per_game' not in player for player in standings):
                        points, played = Counter(), Counter()
                        for game in history(tournament['id']):
                            if game['stage'] != 'qualification':
                                continue
                            for participant in game['participant_snapshots']:
                                player = participant.get('account_id')
                                if player is not None:
                                    played[player] += 1
                                    points[player] += game['team_scores'][participant['team_index']]
                        tournament['standings'] = [
                            dict(player, points_per_game=points[player['account_id']] / played[player['account_id']]
                                 if played[player['account_id']] else None)
                            for player in standings
                        ]
            return {'tournament': tournament, 'account': account}

        response = await request(data, load)
        if 'error' in response:
            return response
        tournament, account = response['tournament'], response['account']
        viewers[sid] = (tournament['id'], account, monotonic())
        return {'tournament': view(tournament, account)}

    @sio.on('tournament:history')
    async def tournament_history(sid, data=None):
        def load(account, payload):
            tournament = tournaments.get(account, payload.get('tournament_id'))
            page = payload.get('page', 1)
            if type(page) is not int or page < 1:
                raise ValueError('Invalid history page.')
            games = history(tournament.id)
            page_size = 10
            total_pages = max(1, (len(games) + page_size - 1) // page_size)
            page = min(page, total_pages)
            offset = (page - 1) * page_size
            return {'history': dict(entries=[history_entry(game) for game in games[offset:offset + page_size]],
                                    page=page, total_pages=total_pages, total_games=len(games))}
        return await request(data, load)

    @sio.on('tournament:set_attendance_intent')
    async def set_attendance_intent(sid, data=None):
        response = await request(data, lambda account, p: {'tournament': tournaments.set_attendance_intent(
            account, p.get('tournament_id'), p.get('response', p.get('attending')))})
        if 'tournament' in response:
            tournament = response['tournament']
            await sio.emit('tournament:updated', {
                'group_id': tournament['group_id'], 'tournament_id': tournament['id'],
            }, room=f"group-tables:{tournament['group_id']}")
        return response
