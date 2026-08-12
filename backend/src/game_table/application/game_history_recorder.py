"""
GameHistoryRecorder.

Translates completed in-memory table/game state into persistent history rows.
"""

from game_table.application.history_service import HistoryService


class GameHistoryRecorder:
    def __init__(self, history_service: HistoryService | None):
        self._history_service = history_service
        self._recorded_game_ids: set[str] = set()

    def record_completed_table_game(
        self,
        *,
        table_code: str,
        game_id: str | None = None,
        result: dict | None,
        seat_account_participants: list[dict],
    ) -> None:
        if self._history_service is None:
            return

        if game_id is not None and game_id in self._recorded_game_ids:
            return

        if result is None:
            return

        account_participants = self._account_participants_for_result(
            result,
            seat_account_participants,
        )

        if not account_participants:
            return

        self._history_service.record_completed_game(
            table_code=table_code,
            rounds_played=result["rounds_played"],
            team_scores=result["team_scores"],
            team_player_counts=result["team_player_counts"],
            winning_team_index=result["winning_team_index"],
            account_participants=account_participants,
        )
        if game_id is not None:
            self._recorded_game_ids.add(game_id)

    @staticmethod
    def _account_participants_for_result(
        result: dict,
        seat_account_participants: list[dict],
    ) -> list[dict]:
        account_participants = []
        seat_team_indices = result["seat_team_indices"]

        for participant in seat_account_participants:
            account_id = participant.get("account_id")
            if not account_id:
                continue

            seat_index = int(participant["seat_index"])
            team_index = seat_team_indices.get(seat_index)

            if team_index is None:
                continue

            account_participants.append({
                "account_id": account_id,
                "seat_index": seat_index,
                "team_index": team_index,
            })

        return account_participants
