import json

from socketio import ASGIApp, AsyncServer

from game_table.api.ws.session_registry import SessionRegistry
from game_table.api.ws.table_ws import leave_member_and_broadcast
from game_table.application.table_service import TableService
from game_table.game_settings_provider import GameSettingsProvider


LEAVE_PATH = "/game-table/presence/leave"


class GameTableHttpApp:
    """Minimal package-owned HTTP API for browser lifecycle requests."""

    def __init__(
        self,
        sio: AsyncServer,
        table_service: TableService,
        session_registry: SessionRegistry,
        game_settings_provider: GameSettingsProvider,
        game_name: str | None = None,
    ) -> None:
        self._sio = sio
        self._table_service = table_service
        self._session_registry = session_registry
        self._game_settings_provider = game_settings_provider
        self._game_name = game_name

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] == "lifespan":
            while True:
                message = await receive()
                if message["type"] == "lifespan.startup":
                    await send({"type": "lifespan.startup.complete"})
                elif message["type"] == "lifespan.shutdown":
                    await send({"type": "lifespan.shutdown.complete"})
                    return
        if scope["type"] == "websocket":
            await send({"type": "websocket.close", "code": 1000})
            return
        if scope["type"] != "http":
            return

        path = scope.get("path", "")
        method = scope.get("method", "GET").upper()

        if path == LEAVE_PATH and method == "POST":
            await self._leave(receive, send)
            return

        if path == "/health" and method == "GET":
            payload = {"status": "ok"}
            if self._game_name:
                payload["game"] = self._game_name
            await self._respond(send, 200, payload)
            return

        await self._respond(send, 404, {"error": "Not found."})

    async def _leave(self, receive, send) -> None:
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] != "http.request":
                continue
            body.extend(message.get("body", b""))
            if not message.get("more_body", False):
                break

        try:
            data = json.loads(body or b"{}")
            client_session_id = data["client_session_id"]
            if not isinstance(client_session_id, str) or not client_session_id:
                raise ValueError
            member_id = self._session_registry.get_member_id_for_client_session(
                client_session_id
            )
            if member_id is None:
                raise ValueError
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            await self._respond(send, 400, {"error": "Invalid session."})
            return

        try:
            await leave_member_and_broadcast(
                self._sio,
                self._table_service,
                self._session_registry,
                self._game_settings_provider,
                member_id,
            )
        except ValueError:
            await self._respond(send, 204, None)
            return

        await self._respond(send, 204, None)

    @staticmethod
    async def _respond(send, status: int, payload: dict | None) -> None:
        body = b"" if payload is None else json.dumps(payload).encode("utf-8")
        await send(
            {
                "type": "http.response.start",
                "status": status,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"access-control-allow-origin", b"*"),
                    (b"cache-control", b"no-store"),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})


def create_game_table_asgi_app(
    sio: AsyncServer,
    table_service: TableService,
    session_registry: SessionRegistry,
    game_settings_provider: GameSettingsProvider,
    *,
    game_name: str | None = None,
    socketio_path: str = "/table",
) -> ASGIApp:
    """Compose Socket.IO with GameTable's package-owned HTTP API."""

    http_app = GameTableHttpApp(
        sio,
        table_service,
        session_registry,
        game_settings_provider,
        game_name,
    )
    return ASGIApp(
        sio,
        other_asgi_app=http_app,
        socketio_path=socketio_path,
    )
