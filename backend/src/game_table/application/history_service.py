"""
HistoryService.

Application service for completed account-linked game history.
"""

from time import time
from typing import Callable
from uuid import uuid4

from game_table.history.account_game_result import AccountGameResult
from game_table.history.account_history_entry import AccountHistoryEntry
from game_table.history.game_history import GameHistory
from game_table.history.history_repository import HistoryRepository
from game_table.history.leaderboard_entry import LeaderboardEntry


LEADERBOARD_SORTS = {"games_won", "games_played", "win_percentage"}
DEFAULT_LEADERBOARD_PAGE_SIZE = 10
MAX_LEADERBOARD_PAGE_SIZE = 50
MAX_ACCOUNT_STATS_BATCH_SIZE = 20


class HistoryService:
    def __init__(
        self,
        repository: HistoryRepository,
        history_id_factory: Callable[[], str] | None = None,
        clock_ms: Callable[[], int] | None = None,
    ):
        self._repository = repository
        self._history_id_factory = history_id_factory or self._generate_history_id
        self._clock_ms = clock_ms or self._now_ms

    def record_completed_game(
        self,
        table_code: str,
        rounds_played: int,
        team_scores: list[int],
        team_player_counts: list[int],
        winning_team_index: int,
        account_participants: list[dict],
    ) -> GameHistory:
        if not account_participants:
            raise ValueError("At least one account participant is required.")

        game_history = GameHistory(
            history_id=self._history_id_factory(),
            completed_at=self._clock_ms(),
            table_code=table_code,
            rounds_played=rounds_played,
            team_scores=team_scores,
            team_player_counts=team_player_counts,
            winning_team_index=winning_team_index,
        )
        account_results = [
            self._result_for_participant(game_history, participant)
            for participant in account_participants
        ]
        account_ids = [result.account_id for result in account_results]

        if len(account_ids) != len(set(account_ids)):
            raise ValueError("Account participants must be unique.")

        self._repository.save_game_with_results(game_history, account_results)
        return game_history

    def list_results_for_account(self, account_id: str) -> list[AccountGameResult]:
        if not account_id or not account_id.strip():
            raise ValueError("Account ID is required.")

        return self._repository.list_results_for_account(account_id.strip())

    def list_history_for_account(self, account_id: str) -> list[AccountHistoryEntry]:
        if not account_id or not account_id.strip():
            raise ValueError("Account ID is required.")

        return self._repository.list_history_for_account(account_id.strip())

    def list_leaderboard(
        self,
        sort: str = "games_won",
        page: int = 1,
        page_size: int = DEFAULT_LEADERBOARD_PAGE_SIZE,
    ) -> dict:
        if sort not in LEADERBOARD_SORTS:
            raise ValueError("Invalid leaderboard sort.")

        clean_page = max(1, int(page))
        clean_page_size = min(
            MAX_LEADERBOARD_PAGE_SIZE,
            max(1, int(page_size)),
        )
        entries = self._repository.list_leaderboard(
            sort=sort,
            limit=clean_page_size + 1,
            offset=(clean_page - 1) * clean_page_size,
        )

        return {
            "entries": entries[:clean_page_size],
            "page": clean_page,
            "page_size": clean_page_size,
            "has_more": len(entries) > clean_page_size,
        }

    def list_stats_for_accounts(self, account_ids: list[str]) -> list[LeaderboardEntry]:
        if not isinstance(account_ids, list):
            raise ValueError("Account IDs must be a list.")

        clean_account_ids = list(dict.fromkeys(
            account_id.strip()
            for account_id in account_ids
            if isinstance(account_id, str) and account_id.strip()
        ))
        if len(clean_account_ids) > MAX_ACCOUNT_STATS_BATCH_SIZE:
            raise ValueError("Too many accounts requested.")

        if not clean_account_ids:
            return []

        return self._repository.list_stats_for_accounts(clean_account_ids)

    def list_results_for_game(self, game_history_id: str) -> list[AccountGameResult]:
        if not game_history_id or not game_history_id.strip():
            raise ValueError("Game history ID is required.")

        return self._repository.list_results_for_game(game_history_id.strip())

    @staticmethod
    def _result_for_participant(
        game_history: GameHistory,
        participant: dict,
    ) -> AccountGameResult:
        team_index = int(participant["team_index"])

        return AccountGameResult(
            game_history_id=game_history.id,
            account_id=participant["account_id"],
            seat_index=int(participant["seat_index"]),
            team_index=team_index,
            won=team_index == game_history.winning_team_index,
            points_for=game_history.score_for_team(team_index),
            points_against=game_history.points_against_team(team_index),
        )

    @staticmethod
    def _generate_history_id() -> str:
        return f"hist_{uuid4().hex}"

    @staticmethod
    def _now_ms() -> int:
        return int(time() * 1000)
