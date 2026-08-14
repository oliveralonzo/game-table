# GameTable

Reusable multiplayer table infrastructure for pluggable games.

The repository contains separate backend and frontend packages.

## Backend application composition

After registering a game's Socket.IO events with shared `TableService` and
`SessionRegistry` instances, compose the server with GameTable's package-owned
HTTP API:

```python
from game_table.api import create_game_table_asgi_app

app = create_game_table_asgi_app(
    sio,
    table_service,
    session_registry,
    plugin.settings_provider,
    game_name="example",
)
```

The resulting framework-free ASGI application serves Socket.IO at `/table`, a
health check at `/health`, and the browser lifecycle endpoint at
`/game-table/presence/leave`.
