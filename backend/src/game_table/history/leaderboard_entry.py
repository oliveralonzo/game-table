"""
LeaderboardEntry read model.

Represents one account's aggregate completed-game record.
"""


class LeaderboardEntry:
    def __init__(
        self,
        account_id: str,
        username: str,
        games_played: int,
        games_won: int,
    ):
        self._account_id = account_id
        self._username = username
        self._games_played = games_played
        self._games_won = games_won

    @property
    def account_id(self) -> str:
        return self._account_id

    @property
    def username(self) -> str:
        return self._username

    @property
    def games_played(self) -> int:
        return self._games_played

    @property
    def games_won(self) -> int:
        return self._games_won

    @property
    def win_percentage(self) -> float:
        if self._games_played == 0:
            return 0

        return self._games_won / self._games_played

    def to_dict(self) -> dict:
        return {
            "account_id": self._account_id,
            "username": self._username,
            "games_played": self._games_played,
            "games_won": self._games_won,
            "win_percentage": self.win_percentage,
        }
