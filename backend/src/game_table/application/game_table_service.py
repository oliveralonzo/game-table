"""
GameTableService class

Application-layer orchestrator for workflows spanning Game and Table.
"""

from time import time
from weakref import WeakKeyDictionary

from game_table.application.game_service_port import GameServicePort


class GameTableService:
    def __init__(
        self,
        game_service: GameServicePort,
        table_service,
        game_activity_service=None,
        game_history_recorder=None,
        clock_ms=None,
    ):
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
        self.record_completed_game_for_table(table_code, game_id)
        if table.group_id is not None:
            self._table_service.detach_game(member_id, completed=completed)
        else:
            self._table_service.detach_game(member_id)

        self._game_service.remove_game(game_id)
        self._history_contexts.pop(table, None)
        if self._game_activity_service is not None:
            self._game_activity_service.clear_game(game_id)

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
