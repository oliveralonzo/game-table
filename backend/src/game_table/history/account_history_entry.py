"""
AccountHistoryEntry read model.

Represents one completed game as shown from a single account's perspective.
"""


class AccountHistoryEntry:
    def __init__(
        self,
        game_history_id: str,
        completed_at: int,
        table_code: str,
        rounds_played: int,
        team_scores: list[int],
        team_player_count: int | None,
        winning_team_index: int,
        seat_index: int,
        team_index: int,
        won: bool,
        points_for: int,
        points_against: int,
        teammates: list[dict] | None = None,
        opponents: list[dict] | None = None,
    ):
        self._game_history_id = game_history_id
        self._completed_at = completed_at
        self._table_code = table_code
        self._rounds_played = rounds_played
        self._team_scores = list(team_scores)
        self._team_player_count = team_player_count
        self._winning_team_index = winning_team_index
        self._seat_index = seat_index
        self._team_index = team_index
        self._won = won
        self._points_for = points_for
        self._points_against = points_against
        self._teammates = list(teammates or [])
        self._opponents = list(opponents or [])

    @property
    def game_history_id(self) -> str:
        return self._game_history_id

    @property
    def completed_at(self) -> int:
        return self._completed_at

    @property
    def table_code(self) -> str:
        return self._table_code

    @property
    def rounds_played(self) -> int:
        return self._rounds_played

    @property
    def team_scores(self) -> list[int]:
        return list(self._team_scores)

    @property
    def team_player_count(self) -> int | None:
        return self._team_player_count

    @property
    def winning_team_index(self) -> int:
        return self._winning_team_index

    @property
    def seat_index(self) -> int:
        return self._seat_index

    @property
    def team_index(self) -> int:
        return self._team_index

    @property
    def won(self) -> bool:
        return self._won

    @property
    def points_for(self) -> int:
        return self._points_for

    @property
    def points_against(self) -> int:
        return self._points_against

    @property
    def teammates(self) -> list[dict]:
        return list(self._teammates)

    @property
    def opponents(self) -> list[dict]:
        return list(self._opponents)

    def to_dict(self) -> dict:
        return {
            "game_history_id": self._game_history_id,
            "completed_at": self._completed_at,
            "table_code": self._table_code,
            "rounds_played": self._rounds_played,
            "team_scores": list(self._team_scores),
            "team_player_count": self._team_player_count,
            "winning_team_index": self._winning_team_index,
            "seat_index": self._seat_index,
            "team_index": self._team_index,
            "won": self._won,
            "points_for": self._points_for,
            "points_against": self._points_against,
            "teammates": list(self._teammates),
            "opponents": list(self._opponents),
        }
