"""Interface the multiplayer platform expects from a backend game plugin."""

from dataclasses import dataclass
from typing import Protocol

from socketio import AsyncServer

from game_table.game_settings_provider import GameSettingsProvider
from game_table.api.ws.session_registry import SessionRegistry
from game_table.application.game_service_port import GameServicePort
from game_table.application.game_table_service import GameTableService
from game_table.application.table_service import TableService


class GameActivityPort(Protocol):
    def clear_game(self, game_id: str) -> None:
        """Remove activity associated with a finished game."""


@dataclass(frozen=True)
class PlatformFeatures:
    accounts: bool = False
    settings: bool = False


class GamePlugin(Protocol):
    @property
    def features(self) -> PlatformFeatures:
        """Declare which optional platform capabilities this game enables."""

    @property
    def game_service(self) -> GameServicePort:
        """Provide the game's application service."""

    @property
    def game_activity_service(self) -> GameActivityPort:
        """Provide the game's activity lifecycle service."""

    @property
    def settings_provider(self) -> GameSettingsProvider:
        """Provide game-specific settings conversion."""

    def register_events(
        self,
        sio: AsyncServer,
        table_service: TableService,
        game_table_service: GameTableService,
        session_registry: SessionRegistry,
    ) -> None:
        """Register this game's socket events on the platform server."""
