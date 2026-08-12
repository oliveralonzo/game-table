"""Game-owned settings boundary used by the multiplayer API."""

from typing import Any, Protocol


class GameSettingsProvider(Protocol):
    def default_settings(self) -> Any:
        """Return the game's default domain settings."""

    def parse_settings(self, data: dict) -> Any:
        """Validate API data and return the game's domain settings."""

    def serialize_settings(self, settings: Any) -> dict:
        """Convert the game's domain settings to an API payload."""
