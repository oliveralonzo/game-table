"""
Postgres-backed history repository.
"""

from typing import Any, Callable

from psycopg import Connection
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from game_table.history.account_game_result import AccountGameResult
from game_table.history.account_history_entry import AccountHistoryEntry
from game_table.history.game_history import GameHistory
from game_table.history.leaderboard_entry import LeaderboardEntry


MIN_WIN_PERCENTAGE_GAMES = 10


class PostgresHistoryRepository:
    def __init__(self, connection_factory: Callable[[], Connection]):
        self._connection_factory = connection_factory

    def save_game_with_results(
        self,
        game_history: GameHistory,
        account_results: list[AccountGameResult],
    ) -> None:
        with self._connection_factory() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO game_history (
                        id,
                        completed_at,
                        table_code,
                        rounds_played,
                        team_scores,
                        team_player_counts,
                        winning_team_index
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    (
                        game_history.id,
                        game_history.completed_at,
                        game_history.table_code,
                        game_history.rounds_played,
                        Jsonb(game_history.team_scores),
                        Jsonb(game_history.team_player_counts),
                        game_history.winning_team_index,
                    ),
                )

                for result in account_results:
                    cursor.execute(
                        """
                        INSERT INTO account_game_results (
                            game_history_id,
                            account_id,
                            seat_index,
                            team_index,
                            won,
                            points_for,
                            points_against
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (game_history_id, account_id) DO NOTHING
                        """,
                        (
                            result.game_history_id,
                            result.account_id,
                            result.seat_index,
                            result.team_index,
                            result.won,
                            result.points_for,
                            result.points_against,
                        ),
                    )

    def list_results_for_account(self, account_id: str) -> list[AccountGameResult]:
        return self._fetch_results(
            """
            SELECT *
            FROM account_game_results
            WHERE account_id = %s
            """,
            (account_id,),
        )

    def list_history_for_account(self, account_id: str) -> list[AccountHistoryEntry]:
        with self._connection_factory() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT
                        game_history.id AS game_history_id,
                        game_history.completed_at,
                        game_history.table_code,
                        game_history.rounds_played,
                        game_history.team_scores,
                        game_history.team_player_counts,
                        game_history.winning_team_index,
                        account_game_results.seat_index,
                        account_game_results.team_index,
                        account_game_results.won,
                        account_game_results.points_for,
                        account_game_results.points_against,
                        COALESCE(
                            jsonb_agg(
                                jsonb_build_object(
                                    'account_id', participant_results.account_id,
                                    'username', participant_accounts.username,
                                    'seat_index', participant_results.seat_index,
                                    'team_index', participant_results.team_index
                                )
                                ORDER BY participant_results.seat_index
                            ) FILTER (
                                WHERE participant_results.account_id IS NOT NULL
                                  AND participant_results.account_id != account_game_results.account_id
                            ),
                            '[]'::jsonb
                        ) AS participants
                    FROM account_game_results
                    JOIN game_history
                      ON game_history.id = account_game_results.game_history_id
                    LEFT JOIN account_game_results AS participant_results
                      ON participant_results.game_history_id = game_history.id
                    LEFT JOIN accounts AS participant_accounts
                      ON participant_accounts.id = participant_results.account_id
                    WHERE account_game_results.account_id = %s
                    GROUP BY
                        game_history.id,
                        game_history.completed_at,
                        game_history.table_code,
                        game_history.rounds_played,
                        game_history.team_scores,
                        game_history.team_player_counts,
                        game_history.winning_team_index,
                        account_game_results.seat_index,
                        account_game_results.team_index,
                        account_game_results.won,
                        account_game_results.points_for,
                        account_game_results.points_against,
                        account_game_results.account_id
                    ORDER BY game_history.completed_at DESC
                    LIMIT 50
                    """,
                    (account_id,),
                )
                rows = cursor.fetchall()

        return [self._history_entry_from_row(row) for row in rows]

    def list_leaderboard(
        self,
        sort: str,
        limit: int,
        offset: int,
    ) -> list[LeaderboardEntry]:
        order_by = self._leaderboard_order_by(sort)
        with self._connection_factory() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    f"""
                    WITH leaderboard AS (
                        SELECT
                            accounts.id AS account_id,
                            accounts.username,
                            COUNT(account_game_results.game_history_id)::int AS games_played,
                            COALESCE(
                                SUM(
                                    CASE
                                        WHEN account_game_results.won THEN 1
                                        ELSE 0
                                    END
                                ),
                                0
                            )::int AS games_won
                        FROM account_game_results
                        JOIN accounts
                          ON accounts.id = account_game_results.account_id
                        GROUP BY accounts.id, accounts.username
                    )
                    SELECT *
                    FROM leaderboard
                    ORDER BY {order_by}
                    LIMIT %s OFFSET %s
                    """,
                    (limit, offset),
                )
                rows = cursor.fetchall()

        return [self._leaderboard_entry_from_row(row) for row in rows]

    def list_stats_for_accounts(
        self,
        account_ids: list[str],
    ) -> list[LeaderboardEntry]:
        with self._connection_factory() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT
                        accounts.id AS account_id,
                        accounts.username,
                        COUNT(account_game_results.game_history_id)::int AS games_played,
                        COALESCE(
                            SUM(CASE WHEN account_game_results.won THEN 1 ELSE 0 END),
                            0
                        )::int AS games_won
                    FROM accounts
                    LEFT JOIN account_game_results
                      ON account_game_results.account_id = accounts.id
                    WHERE accounts.id = ANY(%s)
                    GROUP BY accounts.id, accounts.username
                    """,
                    (account_ids,),
                )
                rows = cursor.fetchall()

        return [self._leaderboard_entry_from_row(row) for row in rows]

    def list_results_for_game(self, game_history_id: str) -> list[AccountGameResult]:
        return self._fetch_results(
            """
            SELECT *
            FROM account_game_results
            WHERE game_history_id = %s
            """,
            (game_history_id,),
        )

    def _fetch_results(
        self,
        query: str,
        params: tuple[Any, ...],
    ) -> list[AccountGameResult]:
        with self._connection_factory() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(query, params)
                rows = cursor.fetchall()

        return [self._result_from_row(row) for row in rows]

    @staticmethod
    def _result_from_row(row: dict[str, Any]) -> AccountGameResult:
        return AccountGameResult(
            game_history_id=row["game_history_id"],
            account_id=row["account_id"],
            seat_index=row["seat_index"],
            team_index=row["team_index"],
            won=row["won"],
            points_for=row["points_for"],
            points_against=row["points_against"],
        )

    @staticmethod
    def _history_entry_from_row(row: dict[str, Any]) -> AccountHistoryEntry:
        participants = row.get("participants") or []
        team_index = row["team_index"]
        team_player_counts = row.get("team_player_counts") or []
        team_player_count = (
            team_player_counts[team_index]
            if team_index < len(team_player_counts)
            else None
        )
        teammates = [
            participant
            for participant in participants
            if participant["team_index"] == team_index
        ]
        opponents = [
            participant
            for participant in participants
            if participant["team_index"] != team_index
        ]

        return AccountHistoryEntry(
            game_history_id=row["game_history_id"],
            completed_at=row["completed_at"],
            table_code=row["table_code"],
            rounds_played=row["rounds_played"],
            team_scores=row["team_scores"],
            team_player_count=team_player_count,
            winning_team_index=row["winning_team_index"],
            seat_index=row["seat_index"],
            team_index=row["team_index"],
            won=row["won"],
            points_for=row["points_for"],
            points_against=row["points_against"],
            teammates=teammates,
            opponents=opponents,
        )

    @staticmethod
    def _leaderboard_entry_from_row(row: dict[str, Any]) -> LeaderboardEntry:
        return LeaderboardEntry(
            account_id=row["account_id"],
            username=row["username"],
            games_played=row["games_played"],
            games_won=row["games_won"],
        )

    @staticmethod
    def _leaderboard_order_by(sort: str) -> str:
        if sort == "games_played":
            return "games_played DESC, games_won DESC, username ASC"
        if sort == "win_percentage":
            return (
                f"(games_played >= {MIN_WIN_PERCENTAGE_GAMES}) DESC, "
                f"CASE WHEN games_played >= {MIN_WIN_PERCENTAGE_GAMES} "
                "THEN ROUND(100.0 * games_won / NULLIF(games_played, 0)) END DESC, "
                f"CASE WHEN games_played >= {MIN_WIN_PERCENTAGE_GAMES} "
                "THEN games_won END DESC, "
                "games_played DESC, games_won DESC, username ASC"
            )

        return "games_won DESC, games_played DESC, username ASC"
