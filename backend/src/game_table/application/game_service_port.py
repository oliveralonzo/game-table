"""Interface the multiplayer platform expects from a game service."""

from typing import Any, Protocol


class GameServicePort(Protocol):
    def create_game(self, player_count: int, settings: Any = None) -> str:
        """Create a game and return its identifier."""

    def is_over(self, game_id: str) -> bool:
        """Return whether the game has ended."""

    def get_result(self, game_id: str) -> dict | None:
        """Return plain result data when the game is complete."""

    def remove_game(self, game_id: str) -> None:
        """Remove the game from active storage."""
