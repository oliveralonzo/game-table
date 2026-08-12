"""
HistoryRepository protocol.

Storage boundary for completed game history.
"""

from typing import Protocol

from game_table.history.account_game_result import AccountGameResult
from game_table.history.account_history_entry import AccountHistoryEntry
from game_table.history.game_history import GameHistory
from game_table.history.leaderboard_entry import LeaderboardEntry


class HistoryRepository(Protocol):
    def save_game_with_results(
        self,
        game_history: GameHistory,
        account_results: list[AccountGameResult],
    ) -> None:
        ...

    def list_results_for_account(self, account_id: str) -> list[AccountGameResult]:
        ...

    def list_history_for_account(self, account_id: str) -> list[AccountHistoryEntry]:
        ...

    def list_leaderboard(
        self,
        sort: str,
        limit: int,
        offset: int,
    ) -> list[LeaderboardEntry]:
        ...

    def list_stats_for_accounts(
        self,
        account_ids: list[str],
    ) -> list[LeaderboardEntry]:
        ...

    def list_results_for_game(self, game_history_id: str) -> list[AccountGameResult]:
        ...
