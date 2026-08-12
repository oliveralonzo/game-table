"""
AccountGameResult domain.

Represents one signed-in account's indexed result for a completed game.
"""


class AccountGameResult:
    def __init__(
        self,
        game_history_id: str,
        account_id: str,
        seat_index: int,
        team_index: int,
        won: bool,
        points_for: int,
        points_against: int,
    ):
        if not game_history_id or not game_history_id.strip():
            raise ValueError("Game history ID is required.")

        if not account_id or not account_id.strip():
            raise ValueError("Account ID is required.")

        if seat_index < 0:
            raise ValueError("Seat index cannot be negative.")

        if team_index < 0:
            raise ValueError("Team index cannot be negative.")

        if points_for < 0:
            raise ValueError("Points for cannot be negative.")

        if points_against < 0:
            raise ValueError("Points against cannot be negative.")

        self._game_history_id = game_history_id.strip()
        self._account_id = account_id.strip()
        self._seat_index = seat_index
        self._team_index = team_index
        self._won = won
        self._points_for = points_for
        self._points_against = points_against

    @property
    def game_history_id(self) -> str:
        return self._game_history_id

    @property
    def account_id(self) -> str:
        return self._account_id

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

    def to_dict(self) -> dict:
        return {
            "game_history_id": self._game_history_id,
            "account_id": self._account_id,
            "seat_index": self._seat_index,
            "team_index": self._team_index,
            "won": self._won,
            "points_for": self._points_for,
            "points_against": self._points_against,
        }

