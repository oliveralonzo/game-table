/**
 * SessionGate.tsx
 * Author: Oliver Alonzo
 * Supported by ChatGPT (GPT-5)
 * Date: 2025-08-11
 * Version: 1.3
 */

import type { FC } from "react";
type ScreenComp = FC;

type SessionRouteState = {
    status: "idle" | "joining" | "joined";
    role: "player" | "viewer";
    gameStarted: boolean;
};

function useSessionRouteState(): SessionRouteState {
    return {
        status: "idle",
        role: "viewer",
        gameStarted: false,
    };
}

export type SessionGateProps = {
    PendingScreen?: ScreenComp;
    ViewerWaitingScreen?: ScreenComp;
    LobbyScreen?: ScreenComp;
    GamePlayerScreen?: ScreenComp;
    GameViewerScreen?: ScreenComp;
};

function FallbackPending() {
    return <div className="p-4 text-center">Waiting for host to assign you…</div>;
}
function FallbackLobby() {
    return (
        <div className="p-4 text-center">
            Lobby (player): claim a spot, edit team name, toggle Ready…
        </div>
    );
}
function FallbackGamePlayer() {
    return <div className="p-4 text-center">GameScreen (player)</div>;
}
function FallbackGameViewer() {
    return <div className="p-4 text-center">GameScreen (viewer)</div>;
}

function SessionGate({
    PendingScreen = FallbackPending,
    LobbyScreen = FallbackLobby,
    GamePlayerScreen = FallbackGamePlayer,
    GameViewerScreen = FallbackGameViewer,
}: SessionGateProps) {
    const { status, role, gameStarted } = useSessionRouteState();

    // Not attempting to join anything
    if (status === "idle") return <PendingScreen />;

    // Attempting join but not yet accepted
    if (status === "joining")
        return <PendingScreen />;

    // Accepted by server
    if (status === "joined") {
        if (gameStarted) {
            return role === "viewer"
                ? <GameViewerScreen />
                : <GamePlayerScreen />;
        }

        return <LobbyScreen />;
    }

    return <PendingScreen />;
}

export default SessionGate;

/* Route key helper (useful for tests) */
export function useSessionRouteKey():
    | "pending"
    | "viewer-wait"
    | "lobby"
    | "game-player"
    | "game-viewer" {
    const { status, role, gameStarted } = useSessionRouteState();

    if (status === "idle") return "pending";
    if (status === "joining") return "viewer-wait";
    if (!gameStarted) return "lobby";

    return role === "viewer" ? "game-viewer" : "game-player";
}
