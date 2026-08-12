import { BrowserRouter, Routes, Route, useNavigate, useParams } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { TableProvider, useTable } from "game-table/context/TableState";
import { TableSocketProvider, useTableSocket } from "game-table/context/TableSocket";
import JoinScreen from "game-table/pages/JoinScreen";
import TableScreen from "game-table/pages/TableScreen";
import AppLoadingScreen from "game-table/components/AppLoadingScreen";
import { SessionProvider } from "./context/SessionContext";
import { useSystemDarkClass } from "game-table/hooks/useSystemDarkClass";
import { useRestoreViewportAfterInputBlur } from "game-table/hooks/useRestoreViewportAfterInputBlur";
import { normalizeTableCode } from "game-table/utils/tableRoute";
import type { FrontendGamePlugin } from "game-table/gamePlugin";
import { BrandingProvider } from "game-table/context/BrandingContext";

function repairMalformedLocationPath() {
  if (typeof window === "undefined") return;

  try {
    decodeURI(window.location.pathname);
  } catch {
    window.history.replaceState(null, "", "/");
  }
}

repairMalformedLocationPath();

function AppContent({ gamePlugin }: { gamePlugin: FrontendGamePlugin }) {
  const { state } = useTable();
  const { code } = useParams();
  const navigate = useNavigate();
  const {
    isSessionReady,
    leaveTable,
    resolveTableRouteEntry,
  } = useTableSocket();
  const [view, setView] = useState<"lobby" | "game">("lobby");
  const [routeMembershipStatus, setRouteMembershipStatus] = useState<
    "idle" | "checking" | "member" | "guest"
  >("idle");
  const leavingForRouteRef = useRef<string | null>(null);
  const rootLeaveTimeoutRef = useRef<number | null>(null);
  const gameTransitionRef = useRef<{
    tableCode: string | null;
    gameId: string | null;
    initialized: boolean;
  }>({
    tableCode: null,
    gameId: null,
    initialized: false,
  });
  const socketActionsRef = useRef({
    leaveTable,
    resolveTableRouteEntry,
  });

  const gameId = state.tableView?.active_game_id ?? null;
  const tableCode = state.tableView?.table_code ?? null;
  const routeTableCode = code ? normalizeTableCode(code) : null;
  const selfMemberId = state.selfMemberId;
  const seats = state.tableView?.seats ?? [];
  const mySeatRaw = selfMemberId
    ? seats.findIndex((memberId) => memberId === selfMemberId)
    : -1;
  const mySeat = mySeatRaw >= 0 ? mySeatRaw : null;

  useEffect(() => {
    socketActionsRef.current = {
      leaveTable,
      resolveTableRouteEntry,
    };
  }, [leaveTable, resolveTableRouteEntry]);

  useEffect(() => {
    const previous = gameTransitionRef.current;

    if (!previous.initialized || previous.tableCode !== tableCode) {
      gameTransitionRef.current = {
        tableCode,
        gameId,
        initialized: true,
      };

      if (!gameId) {
        setView("lobby");
      }

      return;
    }

    if (!previous.gameId && gameId) {
      setView("game");
    } else if (!gameId) {
      setView("lobby");
    }

    gameTransitionRef.current = {
      tableCode,
      gameId,
      initialized: true,
    };
  }, [gameId, tableCode]);

  useEffect(() => {
    if (
      state.lastTableEvent &&
      routeTableCode === state.lastTableEvent.table_code
    ) {
      setRouteMembershipStatus("idle");
      navigate("/", { replace: true });
    }
  }, [navigate, routeTableCode, state.lastTableEvent]);

  useEffect(() => {
    if (!isSessionReady) return;

    if (rootLeaveTimeoutRef.current !== null) {
      window.clearTimeout(rootLeaveTimeoutRef.current);
      rootLeaveTimeoutRef.current = null;
    }

    if (!routeTableCode) {
      setRouteMembershipStatus("idle");

      if (tableCode) {
        rootLeaveTimeoutRef.current = window.setTimeout(() => {
          socketActionsRef.current.leaveTable(
            (message) => alert(message),
            () => navigate("/", { replace: true })
          );
          rootLeaveTimeoutRef.current = null;
        }, 250);
      }

      return () => {
        if (rootLeaveTimeoutRef.current !== null) {
          window.clearTimeout(rootLeaveTimeoutRef.current);
          rootLeaveTimeoutRef.current = null;
        }
      };
    }

    if (tableCode && tableCode !== routeTableCode) {
      if (leavingForRouteRef.current === routeTableCode) return;

      leavingForRouteRef.current = routeTableCode;
      socketActionsRef.current.leaveTable(
        (message) => {
          leavingForRouteRef.current = null;
          alert(message);
        },
        () => {
          leavingForRouteRef.current = null;
          setRouteMembershipStatus("checking");
          socketActionsRef.current.resolveTableRouteEntry(routeTableCode, (response) => {
            setRouteMembershipStatus(
              "status" in response && response.status === "member" ? "member" : "guest"
            );
          });
        }
      );
      return;
    }

    if (tableCode === routeTableCode && selfMemberId) {
      setRouteMembershipStatus("member");
      return;
    }

    setRouteMembershipStatus("checking");
    socketActionsRef.current.resolveTableRouteEntry(routeTableCode, (response) => {
      setRouteMembershipStatus(
        "status" in response && response.status === "member" ? "member" : "guest"
      );
    });

    return () => {
      if (rootLeaveTimeoutRef.current !== null) {
        window.clearTimeout(rootLeaveTimeoutRef.current);
        rootLeaveTimeoutRef.current = null;
      }
    };
  }, [
    isSessionReady,
    navigate,
    routeTableCode,
    selfMemberId,
    tableCode,
  ]);

  if (!isSessionReady) {
    return <AppLoadingScreen />;
  }

  if (!routeTableCode) {
    if (tableCode) {
      return <AppLoadingScreen />;
    }

    return <JoinScreen gamePlugin={gamePlugin} />;
  }

  if (
    (!state.tableView || tableCode !== routeTableCode) &&
    routeMembershipStatus !== "guest"
  ) {
    return <AppLoadingScreen />;
  }

  if (!state.tableView || tableCode !== routeTableCode || routeMembershipStatus === "guest") {
    return <JoinScreen gamePlugin={gamePlugin} urlTableCode={routeTableCode} />;
  }

  if (view === "game" && gameId) {
    const GameScreen = gamePlugin.GameScreen;

    return (
      <GameScreen
        gameId={gameId}
        mySeat={mySeat}
        onBackToLobby={() => setView("lobby")}
        features={gamePlugin.features}
      />
    );
  }

  return (
    <TableScreen
      gamePlugin={gamePlugin}
      onOpenGame={() => setView("game")}
    />
  );
}

export default function App({ gamePlugin }: { gamePlugin: FrontendGamePlugin }) {
  useSystemDarkClass();
  useRestoreViewportAfterInputBlur();

  return (
    <BrandingProvider branding={gamePlugin.branding}>
      <SessionProvider>
        <TableProvider>
          <TableSocketProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<AppContent gamePlugin={gamePlugin} />} />
                <Route path="/:code" element={<AppContent gamePlugin={gamePlugin} />} />
              </Routes>
            </BrowserRouter>
          </TableSocketProvider>
        </TableProvider>
      </SessionProvider>
    </BrandingProvider>
  );
}
