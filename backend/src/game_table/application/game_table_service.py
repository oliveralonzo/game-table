"""
GameTableService class

Application-layer orchestrator for workflows spanning Game and Table.
"""

from game_table.application.game_service_port import GameServicePort


class GameTableService:
    def __init__(
        self,
        game_service: GameServicePort,
        table_service,
        game_activity_service=None,
        game_history_recorder=None,
    ):
        self._game_service = game_service
        self._table_service = table_service
        self._game_activity_service = game_activity_service
        self._game_history_recorder = game_history_recorder

    def start_game_for_table(self, member_id: str) -> str:
        table_code = self._table_service.get_table_code_for_member(member_id)
        table = self._table_service.get_table(table_code)

        if table.active_game_id is not None:
            if self._game_service.is_over(table.active_game_id):
                self.end_game_for_table(member_id)

        data = self._table_service.prepare_game_start(member_id)

        game_id = self._game_service.create_game(
            player_count=data["player_count"],
            settings=data["rules"],
        )

        try:
            self._table_service.attach_game(member_id, game_id)
        except Exception:
            self._game_service.remove_game(game_id)
            raise

        return game_id

    def end_game_for_table(self, member_id: str) -> None:
        table_code = self._table_service.get_table_code_for_member(member_id)
        game_id = self._table_service.detach_game(member_id)
        self.record_completed_game_for_table(table_code, game_id)

        self._game_service.remove_game(game_id)
        if self._game_activity_service is not None:
            self._game_activity_service.clear_game(game_id)

    def record_completed_game_for_table(
        self,
        table_code: str,
        game_id: str,
    ) -> None:
        if self._game_history_recorder is None:
            return

        seat_account_participants = (
            self._table_service.get_seat_account_participants(table_code)
        )
        result = self._game_service.get_result(game_id)

        self._game_history_recorder.record_completed_table_game(
            table_code=table_code,
            game_id=game_id,
            result=result,
            seat_account_participants=seat_account_participants,
        )
