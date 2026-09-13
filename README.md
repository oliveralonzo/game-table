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

## Immediate frontend loading page (Vite)

Import `gameTableLoadingPage` from `game-table/vite` in your Vite config and add
`gameTableLoadingPage(branding)` to `plugins`. It runs in development and production,
inserting self-contained HTML and CSS before any application JavaScript is needed.
The package's `./*` export includes this build-only entry point.

Keep branding in a small module with no browser imports, and use that same object
for `gamePlugin.branding` and the Vite integration:

```ts
// src/branding.ts
export const branding = { name: "My Game" };
```

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { gameTableLoadingPage } from "game-table/vite";
import { branding } from "./src/branding";

export default defineConfig({
  plugins: [react(), gameTableLoadingPage(branding)],
});
```

Place the marker inside the element passed to React's `createRoot`:

```html
<div id="root"><!-- game-table:initial-loader --></div>
```

React replaces the initial loader on its first commit; no timer or manual removal
is needed. The existing React loading screen handles subsequent initialization.
The initial loader follows the system light/dark preference and reduced motion.
An optional second argument `{ loadingLabel: "…" }` localizes its accessible label.
Missing or duplicate markers fail the build rather than silently leaving a blank page.

Run `npm run test:loading-page` to check HTML escaping and integration errors.
When adopting this integration, publish/push game-table first, then update each
consumer dependency and lockfile so clean installs include `game-table/vite`.
