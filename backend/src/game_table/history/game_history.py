"""
GameHistory domain.

Represents immutable facts for one completed game.
"""


class GameHistory:
    MIN_TEAMS = 2

    def __init__(
        self,
        history_id: str,
        completed_at: int,
        table_code: str,
        rounds_played: int,
        team_scores: list[int],
        team_player_counts: list[int],
        winning_team_index: int,
    ):
        if not history_id or not history_id.strip():
            raise ValueError("Game history ID is required.")

        if not table_code or not table_code.strip():
            raise ValueError("Table code is required.")

        if completed_at <= 0:
            raise ValueError("Completed time is required.")

        if rounds_played <= 0:
            raise ValueError("Rounds played must be positive.")

        if len(team_scores) < self.MIN_TEAMS:
            raise ValueError("At least two team scores are required.")

        if len(team_player_counts) != len(team_scores):
            raise ValueError("Team player counts must match team scores.")

        if any(score < 0 for score in team_scores):
            raise ValueError("Team scores cannot be negative.")

        if any(count <= 0 for count in team_player_counts):
            raise ValueError("Team player counts must be positive.")

        if winning_team_index < 0 or winning_team_index >= len(team_scores):
            raise ValueError("Winning team index is invalid.")

        self._id = history_id.strip()
        self._completed_at = completed_at
        self._table_code = table_code.strip()
        self._rounds_played = rounds_played
        self._team_scores = list(team_scores)
        self._team_player_counts = list(team_player_counts)
        self._winning_team_index = winning_team_index

    @property
    def id(self) -> str:
        return self._id

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
    def team_player_counts(self) -> list[int]:
        return list(self._team_player_counts)

    @property
    def winning_team_index(self) -> int:
        return self._winning_team_index

    def score_for_team(self, team_index: int) -> int:
        if team_index < 0 or team_index >= len(self._team_scores):
            raise ValueError("Team index is invalid.")

        return self._team_scores[team_index]

    def points_against_team(self, team_index: int) -> int:
        if team_index < 0 or team_index >= len(self._team_scores):
            raise ValueError("Team index is invalid.")

        return sum(
            score
            for index, score in enumerate(self._team_scores)
            if index != team_index
        )

    def to_dict(self) -> dict:
        return {
            "id": self._id,
            "completed_at": self._completed_at,
            "table_code": self._table_code,
            "rounds_played": self._rounds_played,
            "team_scores": list(self._team_scores),
            "team_player_counts": list(self._team_player_counts),
            "winning_team_index": self._winning_team_index,
        }
