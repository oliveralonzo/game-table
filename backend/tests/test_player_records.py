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


def test_percentage_sort_uses_leaderboard_nr_threshold():
    query = _query_for("opponents", "win_percentage")
    assert "(games_played >= 10) DESC" in query
    assert "CASE WHEN games_played >= 10" in query


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
