"""Group-only standings, highlights and paged history from recorded results."""
import json
import re
from datetime import datetime, timezone
from time import time

from game_table.group.group_activity import GroupActivityRepository

PAGE_SIZE = 10
MIN_PERCENTAGE_GAMES = 10


def month_key(timestamp):
    return datetime.fromtimestamp(timestamp / 1000, timezone.utc).strftime('%Y-%m')


def month_bounds(season):
    if not isinstance(season, str) or not re.fullmatch(r'[0-9]{4}-(0[1-9]|1[0-2])', season):
        raise ValueError('Invalid season.')
    year, month = map(int, season.split('-'))
    if not 1 <= year < 9999:
        raise ValueError('Invalid season.')
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    end = datetime(year + (month == 12), month % 12 + 1, 1, tzinfo=timezone.utc)
    return int(start.timestamp() * 1000), int(end.timestamp() * 1000)


def new_entry(account_id, username, usernames=None):
    return dict(account_id=account_id, username=username, games_played=0, games_won=0,
                win_percentage=0, win_streak=0, best_win_streak=0,
                **({'usernames': usernames} if usernames is not None else {}))


def record(entry, won):
    entry['games_played'] += 1
    entry['games_won'] += int(won)
    entry['win_percentage'] = entry['games_won'] / entry['games_played']
    entry['win_streak'] = entry['win_streak'] + 1 if won else 0
    entry['best_win_streak'] = max(entry['best_win_streak'], entry['win_streak'])


class GroupActivityService:
    def __init__(self, groups, repository: GroupActivityRepository, clock_ms=None, *, session_authorized=False):
        self._session_authorized = session_authorized
        self._groups = groups
        self._repository = repository
        self._clock = clock_ms or (lambda: int(time() * 1000))

    def _snapshot(self, account_id, group_id, season):
        self._groups.get_group(account_id, group_id)
        current = month_key(self._clock())
        season = current if season == 'current' else season
        start, end = (None, None) if season == 'all' else month_bounds(season)
        snapshot = self._repository.read(group_id, account_id, start, end,
                                         **({"authorized": True} if self._session_authorized else {}))
        if snapshot is None:
            raise PermissionError('Only current members may access the group.')
        first = month_key(min(snapshot.created_at, snapshot.first_played_at or snapshot.created_at))
        seasons = []
        cursor = current
        while cursor >= first:
            seasons.append(cursor)
            year, month = map(int, cursor.split('-'))
            cursor = f'{year - (month == 1):04d}-{(month - 2) % 12 + 1:02d}'
        if season != 'all' and season not in seasons:
            raise ValueError('Season is outside the group history.')
        return snapshot, season, current, seasons

    def player_records(self, account_id, group_id, player_id, season='current',
                       relationship='teammates', sort='games_won', page=1):
        if not isinstance(player_id, str) or not player_id.strip():
            raise ValueError('Player ID is required.')
        if relationship not in {'teammates', 'opponents'}:
            raise ValueError('Invalid player relationship.')
        if sort not in {'games_won', 'games_played', 'win_percentage'}:
            raise ValueError('Invalid player record sort.')
        if isinstance(page, bool) or not isinstance(page, int) or page < 1:
            raise ValueError('Invalid player record page.')
        snapshot, season, _, _ = self._snapshot(account_id, group_id, season)
        known = any(member['account_id'] == player_id for member in snapshot.members)
        entries = {}
        for game in snapshot.games:
            player = next((p for p in game['participants'] if p['account_id'] == player_id
                           and p['group_participation'] == 'member'), None)
            if player is None:
                continue
            known = True
            for other in game['participants']:
                if other['account_id'] == player_id or other['group_participation'] != 'member':
                    continue
                same_team = other['team_index'] == player['team_index']
                if same_team != (relationship == 'teammates'):
                    continue
                entry = entries.setdefault(other['account_id'], new_entry(other['account_id'], other['username']))
                record(entry, player['team_index'] == game['winning_team_index'])
        if not known:
            raise ValueError('Player is not in this group history.')
        def order(entry):
            played, won = entry['games_played'], entry['games_won']
            if sort == 'win_percentage':
                return (-((200 * won + played) // (2 * played)),
                        -won, -played, entry['username'])
            return (-entry[sort], -played if sort == 'games_won' else -won, entry['username'])
        records = sorted(entries.values(), key=order)
        total_pages = max(1, (len(records) + PAGE_SIZE - 1) // PAGE_SIZE)
        page = min(page, total_pages)
        return dict(records=records[(page-1)*PAGE_SIZE:page*PAGE_SIZE],
                    page=page, has_more=page < total_pages, total_pages=total_pages)

    def read(self, account_id, group_id, season='current', page=1):
        if isinstance(page, bool) or not isinstance(page, int) or page < 1:
            raise ValueError('Invalid history page.')
        snapshot, season, current, seasons = self._snapshot(account_id, group_id, season)
        players = {m['account_id']: new_entry(m['account_id'], m['username']) for m in snapshot.members}
        matchups = {}
        teams = {}
        history = []
        for game in sorted(snapshot.games, key=lambda game: (game['completed_at'], game['id'])):
            winner = game['winning_team_index']
            participants = game['participants']
            for person in participants:
                # Eligibility is captured for this game, never inferred from today's membership.
                if person['group_participation'] != 'member':
                    continue
                entry = players.setdefault(person['account_id'], new_entry(person['account_id'], person['username']))
                record(entry, person['team_index'] == winner)
                opponents = matchups.setdefault(person['account_id'], {})
                for opponent in participants:
                    if opponent['group_participation'] != 'member' or opponent['team_index'] == person['team_index']:
                        continue
                    opponent_id = opponent['account_id']
                    margin = int(person['team_index'] == winner) - int(opponent['team_index'] == winner)
                    opponents[opponent_id] = opponents.get(opponent_id, 0) + margin
            sides = []
            for index, count in enumerate(game['team_player_counts']):
                team = sorted((p for p in participants if p['team_index'] == index), key=lambda p: p['account_id'])
                side = [dict(username=p['username'], is_guest=p['group_participation'] != 'member') for p in team]
                side.extend(dict(username=None, is_guest=True) for _ in range(max(0, count - len(team))))
                sides.append(side)
                # An incomplete or guest-containing side has history, but no member-team ranking.
                if count < 2 or len(team) != count or any(p['group_participation'] != 'member' for p in team):
                    continue
                key = json.dumps([p['account_id'] for p in team], separators=(',', ':'))
                names = sorted(p['username'] for p in team)
                entry = teams.setdefault(key, new_entry(key, ', '.join(names), names))
                record(entry, index == winner)
            scores = game['team_scores']
            history.append(dict(id=game['id'], date=game['completed_at'],
                winners=sides[winner], others=[p for index, side in enumerate(sides) if index != winner for p in side],
                score='–'.join(str(scores[index]) for index in [winner] + [i for i in range(len(scores)) if i != winner])))
        for account_id, entry in players.items():
            margins = list(matchups.get(account_id, {}).values())
            entry['head_to_head'] = dict(ahead=sum(value > 0 for value in margins),
                                         tied=sum(value == 0 for value in margins),
                                         behind=sum(value < 0 for value in margins))
        player_entries = sorted(players.values(), key=lambda p: p['username'])
        highlight_entries = sorted(player_entries, key=lambda p: (
            p['games_played'] < MIN_PERCENTAGE_GAMES,
            -p['head_to_head']['ahead'], p['head_to_head']['behind'], p['username']))
        def highlight(field, minimum=1):
            eligible = [p for p in highlight_entries if p['games_played'] >= minimum]
            def displayed_value(player):
                if field == 'win_percentage':
                    # Round halves up, matching the whole percentages displayed by the UI.
                    played = player['games_played']
                    return ((200 * player['games_won'] + played) // (2 * played)) / 100
                return player[field]
            value = max((displayed_value(p) for p in eligible), default=0)
            return dict(value=value if eligible else None,
                        usernames=[p['username'] for p in eligible
                                   if displayed_value(p) == value and (value > 0 or field == 'win_percentage')])
        eligible_hth = [p for p in player_entries if p['games_played'] >= MIN_PERCENTAGE_GAMES]
        def hth_score(player):
            record = player['head_to_head']
            return record['ahead'], -record['behind']
        best_hth = max((hth_score(p) for p in eligible_hth), default=None)
        hth_leaders = [p for p in eligible_hth if hth_score(p) == best_hth]
        hth_highlight = dict(value=None, usernames=[p['username'] for p in hth_leaders],
                            records=[dict(username=p['username'], **p['head_to_head']) for p in hth_leaders])
        total_pages = max(1, (len(history) + PAGE_SIZE - 1) // PAGE_SIZE)
        page = min(page, total_pages)
        history.reverse()
        return dict(group_id=group_id, season=season, current_season=current, seasons=seasons,
            players=player_entries, teams=sorted(teams.values(), key=lambda p: p['username']),
            highlights=dict(best_percentage=highlight('win_percentage', MIN_PERCENTAGE_GAMES),
                head_to_head=hth_highlight, most_wins=highlight('games_won'),
                win_streak=highlight('best_win_streak')),
            history=dict(entries=history[(page-1)*PAGE_SIZE:page*PAGE_SIZE], page=page,
                         total_pages=total_pages, total_games=len(history)))
