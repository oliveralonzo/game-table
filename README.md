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


### Live group authorization

Applications using groups should share one `GroupSessionService` between group
endpoints, `GroupTableService`, and activity, and one `GroupSocketSessions` adapter
between socket handlers (see Doble6's `create_application`). Membership is resolved
at admission; a group's list response can seed the authenticated connection's
admission without a second database read. React state never grants access.

A group room is `group:<id>`. Lobby presence and table participation hold separate
leases on the admitted account/role, including guest status. The browser session
tracks group presence alongside its table membership. Group members in a group
table retain both; guests and private-table participants have only table presence.
Leaving a table keeps group presence; explicitly leaving the group also leaves
its table. The existing table disconnect/page-exit grace period expires both
together, and reconnect restores both. Presence polling only reads this in-memory
state; it has no independent expiry clock. The last lease releases authorization.
A new admission then reads current membership. Database changes alone do not alter a live role.

After a membership-removal operation commits, call
`await group_socket_sessions.revoke(account_id, group_id)` to revoke live grants,
remove room subscriptions, and notify the affected clients. Do not rely on a later
permission check to discover removal. There is no new membership-management UI in
this change.

Routine seat/rule actions, table snapshots, and presence use memory only. Roster,
history, and settings persistence still use storage, with authorization supplied
by the live session. Repository `authorized=True` is an internal service option,
never a value accepted from a client. Deploy this in the same single-process model
as live tables; multiple workers would require shared session/room coordination.

Group and table chat share `activity:chat_message`, `ActivityService`, the existing
socket connection, and the same chat UI/delivery hooks. A group message carries a
`group_id`; the server resolves its sender from the admitted socket session and
broadcasts only to that group room. Table messages remain scoped to table members.
Clients filter by scope so group messages cannot appear in table chat. Chat remains
transient, with browser-session history, matching table chat rather than adding a
new persistent message store.
