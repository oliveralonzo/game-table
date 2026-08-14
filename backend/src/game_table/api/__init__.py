"""Multiplayer platform API adapters."""

from game_table.api.presence import GameTableHttpApp, create_game_table_asgi_app

__all__ = ["GameTableHttpApp", "create_game_table_asgi_app"]
