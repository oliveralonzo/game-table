# api/ws/manager.py
"""
WebSocket manager
Author: Oliver Alonzo
Supported by ChatGPT (GPT-5 Thinking)

Tracks active WebSocket connections per game and broadcasts updated game
state payloads to all connected clients of that game.
"""

from typing import Dict, List, Tuple, Callable, Any
from fastapi import WebSocket
import json


class WSManager:
    rooms: Dict[str, List[Tuple[WebSocket, str]]] = {}

    async def connect(self, game_id: str, player: str, ws: WebSocket) -> None:
        await ws.accept()
        self.rooms.setdefault(game_id, []).append((ws, player))

    def disconnect(self, game_id: str, ws: WebSocket) -> None:
        conns = self.rooms.get(game_id, [])
        self.rooms[game_id] = [(w, p) for (w, p) in conns if w is not ws]
        if not self.rooms[game_id]:
            self.rooms.pop(game_id, None)

    async def broadcast_game(
        self,
        game_id: str,
        serialize_for_player: Callable[[str], Dict[str, Any]],
    ) -> None:
        conns = self.rooms.get(game_id, [])
        for ws, player in list(conns):
            try:
                payload = serialize_for_player(player)
                await ws.send_text(json.dumps(payload))
            except Exception:
                self.disconnect(game_id, ws)


ws_manager = WSManager()
