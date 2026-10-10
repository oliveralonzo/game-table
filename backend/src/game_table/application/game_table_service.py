"""
GameTableService class

Application-layer orchestrator for workflows spanning Game and Table.
"""

from time import time
from game_table.table.end_game_confirmation import EndGameConfirmation
from weakref import WeakKeyDictionary

from game_table.application.game_service_port import GameServicePort
from game_table.table.post_game_transition import PostGameTransition


class GameTableService:
    def __init__(
        self,
        game_service: GameServicePort,
        table_service,
        game_activity_service=None,
        game_history_recorder=None,
        clock_ms=None,
        post_game_response_seconds=30,
    ):
        if post_game_response_seconds <= 0:
            raise ValueError("Response window must be positive.")
        self._post_game_response_seconds = post_game_response_seconds
        self._game_service = game_service
        self._table_service = table_service
        self._game_activity_service = game_activity_service
        self._game_history_recorder = game_history_recorder
        self._clock_ms = clock_ms or (lambda: int(time() * 1000))
        # A closed table releases its context without a second persistent registry.
        self._history_contexts = WeakKeyDictionary()

    def start_game_for_table(self, member_id: str) -> str:
        table_code = self._table_service.get_table_code_for_member(member_id)
        table = self._table_service.get_table(table_code)

        if table.active_game_id is not None:
            if self._game_service.is_over(table.active_game_id):
                self.end_game_for_table(member_id)

        data = self._table_service.prepare_game_start(member_id)

        context = {
            'group_id': table.group_id,
            'started_at': self._clock_ms(),
            'participants': tuple(dict(p) for p in data.get('participants', [])),
            'played_seats': {},
        }
        if table.group_id is not None and 'participants' not in data:
            raise ValueError('Group game start requires a participant snapshot.')
        game_id = self._game_service.create_game(
            player_count=data["player_count"],
            settings=data["rules"],
        )

        try:
            self._table_service.attach_game(member_id, game_id)
        except Exception:
            self._game_service.remove_game(game_id)
            raise

        self._history_contexts[table] = dict(context, game_id=game_id)
        return game_id

    def record_game_action(self, member_id: str, game_id: str) -> None:
        """Call only after a successful player action, before publishing completion.

        Presence changes do not affect attribution. A second identity acting in
        the same seat permanently forfeits that seat's account result.
        """
        table_code = self._table_service.get_table_code_for_member(member_id)
        table = self._table_service.get_table(table_code)
        context = self._history_contexts.get(table)
        if context is None or context['game_id'] != game_id or table.active_game_id != game_id:
            raise ValueError('Game does not match its table history context.')
        if 'completed_participants' in context:
            raise ValueError('Completed game participation is frozen.')
        participant = self._table_service.get_history_participant(member_id)
        seat = participant['seat_index']
        previous = context['played_seats'].get(seat)
        if previous is None:
            # Preserve start-time group eligibility for original players.
            original = next((p for p in context['participants']
                             if p['seat_index'] == seat and p['account_id'] == participant['account_id']), None)
            if original is not None and 'group_participation' in original:
                participant['group_participation'] = original['group_participation']
            context['played_seats'][seat] = participant
        elif previous['identity'] != participant['identity']:
            previous['forfeited'] = True

    def end_game_for_table(self, member_id: str) -> None:
        table_code = self._table_service.get_table_code_for_member(member_id)
        table = self._table_service.get_table(table_code)
        game_id = table.active_game_id
        completed = game_id is not None and self._game_service.is_over(game_id)
        self._table_service.validate_game_end(member_id, completed=completed)
        self._close_game(table)

    def _close_game(self, table, *, player_checks=False):
        game_id = table.active_game_id
        transition = self._build_post_game_transition(table, game_id) if self._game_service.is_over(game_id) else (self._build_abort_transition(table) if player_checks else None)
        self.record_completed_game_for_table(table.table_code, game_id)
        table.release_game()

        if transition is not None:
            table.begin_post_game_transition(transition, clock=lambda: self._clock_ms() / 1000)
        self._apply_post_game_seats_if_ready(table)
        self._game_service.remove_game(game_id)
        self._history_contexts.pop(table, None)
        if self._game_activity_service is not None:
            self._game_activity_service.clear_game(game_id)

    def request_game_end(self, member_id):
        code = self._table_service.get_table_code_for_member(member_id)
        table = self._table_service.get_table(code)
        game_id = table.active_game_id
        completed = game_id is not None and self._game_service.is_over(game_id)
        self._table_service.validate_game_end(member_id, completed=completed)
        if completed:
            self.end_game_for_table(member_id)
            return
        confirmation = table.end_game_confirmation
        if confirmation is not None and confirmation.status == 'pending':
            return  # Repeated requests do not restart the shared deadline.
        players = [seat.member_id for seat in table.seats if seat.member_id is not None]
        table.end_game_confirmation = EndGameConfirmation(game_id, players,
            now=self._clock_ms() / 1000, response_seconds=self._post_game_response_seconds)

    def respond_game_end(self, member_id, confirmation_id, yes):
        code = self._table_service.get_table_code_for_member(member_id)
        table = self._table_service.get_table(code)
        confirmation = table.end_game_confirmation
        if confirmation is None or confirmation.id != confirmation_id:
            raise ValueError('End-game confirmation is no longer current.')
        try:
            confirmation.respond(member_id, yes, now=self._clock_ms() / 1000)
        finally:
            self.expire_game_end_for_table(code)

    def expire_game_end_for_table(self, code):
        table = self._table_service.get_table(code)
        confirmation = table.end_game_confirmation
        if confirmation is None or confirmation.game_id != table.active_game_id:
            return
        confirmation.expire(self._clock_ms() / 1000)
        if confirmation.status == 'approved':
            self._close_game(table, player_checks=True)

    def _build_abort_transition(self, table):
        seats = tuple(seat.member_id for seat in table.seats)
        get_teams = getattr(self._game_service, 'get_seat_team_indices', None)
        mapping = get_teams(table.active_game_id) if get_teams else dict(enumerate(range(len(seats))))
        return PostGameTransition(seats, tuple(str(mapping[i]) for i in range(len(seats))),
            frozenset(), now=self._clock_ms() / 1000, response_seconds=self._post_game_response_seconds,
            challengers=tuple(table.get_queue()))

    def _build_post_game_transition(self, table, game_id):
        get_result = getattr(self._game_service, 'get_result', None)
        result = get_result(game_id) if get_result is not None else None
        if result is None or 'seat_team_indices' not in result:
            return None  # A game without a decisive result has no winner priority.
        seats = tuple(seat.member_id for seat in table.seats)
        seat_teams = result['seat_team_indices']
        teams = tuple(str(seat_teams[i]) for i in range(len(seats)))
        winners = frozenset(player for i, player in enumerate(seats)
                            if player is not None and seat_teams[i] == result['winning_team_index'])
        return PostGameTransition(seats, teams, winners, now=self._clock_ms() / 1000,
                                  response_seconds=self._post_game_response_seconds, challengers=tuple(table.get_queue()))

    def set_queue_membership(self, member_id, *, queued):
        code = self._table_service.get_table_code_for_member(member_id)
        table = self._table_service.get_table(code)
        if queued:
            table.join_queue(member_id)
        else:
            table.leave_queue(member_id)
        self.expire_post_game_for_table(code)

    def respond_post_game(self, member_id, transition_id, *, keep_playing=None, team_preference=None, selected_player=None):
        code = self._table_service.get_table_code_for_member(member_id)
        table = self._table_service.get_table(code)
        view = table.get_post_game_transition_view()
        if view is None or view['id'] != transition_id:
            raise ValueError('Post-game offer is no longer current.')
        transition = table.post_game_transition
        if not transition.seating_blocked:
            raise ValueError('Post-game player checks have finished.')
        self.expire_post_game_for_table(code)
        try:
            if sum(value is not None for value in (keep_playing, team_preference, selected_player)) != 1:
                raise ValueError('Provide exactly one player response.')
            if selected_player is not None:
                transition.choose_player(member_id, selected_player, now=self._clock_ms() / 1000)
            elif team_preference is not None and keep_playing is None:
                transition.choose_team(member_id, team_preference, now=self._clock_ms() / 1000)
            elif team_preference is None and keep_playing is not None:
                transition.respond_keep_playing(member_id, keep_playing, now=self._clock_ms() / 1000)
            else:
                raise ValueError('Provide exactly one player response.')
        finally:
            table.consume_queue_offers()
            self._apply_post_game_seats_if_ready(table)

    def _apply_post_game_seats_if_ready(self, table):
        transition = table.post_game_transition
        if transition is not None and not transition.seating_blocked:
            table.apply_post_game_seats()

    def expire_post_game_for_table(self, table_code):
        table = self._table_service.get_table(table_code)
        transition = table.post_game_transition
        if transition is None or not transition.seating_blocked:
            return
        for player in transition.snapshot()['players']:
            if player not in table.members:
                transition.withdraw(player)
        transition.expire(now=self._clock_ms() / 1000)
        table.consume_queue_offers()
        self._apply_post_game_seats_if_ready(table)

    def post_game_deadline(self, table_code):
        table = self._table_service.get_table(table_code)
        view = table.get_post_game_transition_view()
        if view is None or not view['seating_blocked']:
            return None
        return min((p['deadline'] for p in view['players'].values()
                    if p['deadline'] is not None), default=self._clock_ms() / 1000)

    def post_game_wait_seconds(self, table_code):
        deadline = self.post_game_deadline(table_code)
        unseat = self._table_service.get_table(table_code).get_unseat_view()
        deadlines = [value['deadline'] for value in unseat['confirmations'].values()] + list(unseat['cooldowns'].values())
        if deadlines:
            deadline = min(deadlines) if deadline is None else min(deadline, *deadlines)
        confirmation = self._table_service.get_table(table_code).end_game_confirmation
        if confirmation is not None and confirmation.status == 'pending':
            deadline = confirmation.deadline if deadline is None else min(deadline, confirmation.deadline)
        return None if deadline is None else max(0, deadline - self._clock_ms() / 1000)

    def record_completed_game_for_table(
        self,
        table_code: str,
        game_id: str,
    ) -> None:
        table = self._table_service.get_table(table_code)
        if table.active_game_id != game_id:
            raise ValueError('Game does not match its table history context.')
        if game_id is not None and self._game_service.is_over(game_id):
            table.clear_game_seat_locks()
        if self._game_history_recorder is None:
            return

        context = self._history_contexts.get(table)
        if context is not None and context['game_id'] != game_id:
            raise ValueError('Game does not match its table history context.')
        if table.group_id is not None and context is None:
            raise ValueError('Group game history requires its start-time snapshot.')
        seat_account_participants = ([dict(p) for p in context['played_seats'].values()]
                                     if context else [])
        result = self._game_service.get_result(game_id)
        if context is not None and result is not None:
            if 'completed_participants' not in context:
                context['completed_participants'] = tuple(dict(p) for p in seat_account_participants)
            seat_account_participants = [dict(p) for p in context['completed_participants']]
        metadata = {key: context[key] for key in ('group_id', 'started_at')} if context else {}
        self._game_history_recorder.record_completed_table_game(
            table_code=table_code,
            game_id=game_id,
            result=result,
            seat_account_participants=seat_account_participants,
            **metadata,
        )
