import pytest

from game_table.application.history_service import HistoryService
from game_table.history.leaderboard_entry import LeaderboardEntry
from game_table.infrastructure.postgres_history_repository import PostgresHistoryRepository


class FakeRepository:
    def __init__(self):
        self.calls = []

    def list_player_records(self, **kwargs):
        self.calls.append(kwargs)
        return [
            LeaderboardEntry("other-1", "Alex", 5, 3),
            LeaderboardEntry("other-2", "Sam", 4, 2),
        ]


def test_player_records_are_paged_after_database_aggregation():
    repository = FakeRepository()
    service = HistoryService(repository)

    result = service.list_player_records(
        " me ", relationship="opponents", sort="win_percentage", page=2, page_size=1
    )

    assert repository.calls == [{
        "account_id": "me", "relationship": "opponents",
        "sort": "win_percentage", "limit": 2, "offset": 1,
    }]
    assert [entry.username for entry in result["entries"]] == ["Alex"]
    assert result["has_more"] is True
    assert result["entries"][0].win_percentage == 0.6


def test_leaderboard_entry_serializes_win_streak():
    entry = LeaderboardEntry(
        "player-1",
        "Alex",
        8,
        5,
        win_streak=3,
    )

    assert entry.to_dict()["win_streak"] == 3


def test_history_overview_includes_player_record_availability():
    class HistoryRepository(FakeRepository):
        def list_history_for_account(self, _account_id, limit, offset):
            assert (limit, offset) == (11, 0)
            return []

        def get_history_overview_for_account(self, account_id):
            assert account_id == "me"
            return 12, 7, True, False

    result = HistoryService(HistoryRepository()).list_history_for_account(" me ")

    assert result["games_played"] == 12
    assert result["games_won"] == 7
    assert result["has_teammate_records"] is True
    assert result["has_opponent_records"] is False


def test_history_overview_can_be_loaded_without_history_rows():
    class HistoryRepository(FakeRepository):
        def get_history_overview_for_account(self, account_id):
            assert account_id == "me"
            return 12, 7, True, False

    result = HistoryService(HistoryRepository()).get_history_overview_for_account(" me ")

    assert result == {
        "games_played": 12,
        "games_won": 7,
        "has_teammate_records": True,
        "has_opponent_records": False,
    }


@pytest.mark.parametrize("kwargs", [
    {"account_id": ""},
    {"account_id": "me", "relationship": "strangers"},
    {"account_id": "me", "sort": "username"},
])
def test_player_records_reject_invalid_query(kwargs):
    with pytest.raises(ValueError):
        HistoryService(FakeRepository()).list_player_records(**kwargs)


def test_teammates_and_opponents_use_different_team_comparisons():
    assert "other_result.team_index = my_result.team_index" in _query_for("teammates")
    assert "other_result.team_index <> my_result.team_index" in _query_for("opponents")


def test_player_record_percentage_sort_has_no_minimum_but_leaderboard_keeps_it():
    query = _query_for("opponents", "win_percentage")
    assert "games_played >= 10" not in query
    assert "ROUND(100.0 * games_won / NULLIF(games_played, 0)) DESC" in query
    assert "games_played >= 10" in PostgresHistoryRepository._leaderboard_order_by("win_percentage")


def _query_for(relationship, sort="games_won"):
    class Cursor:
        query = ""

        def __enter__(self): return self
        def __exit__(self, *_): pass
        def execute(self, query, _params): self.query = query
        def fetchall(self): return []

    class Connection:
        def __init__(self): self.cursor_instance = Cursor()
        def __enter__(self): return self
        def __exit__(self, *_): pass
        def cursor(self, **_): return self.cursor_instance

    connection = Connection()
    PostgresHistoryRepository(lambda: connection).list_player_records(
        "me", relationship, sort, 10, 0
    )
    return connection.cursor_instance.query
