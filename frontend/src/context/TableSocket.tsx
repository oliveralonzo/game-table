/**
 * TableSocket.tsx
 * Author: Oliver Alonzo
 * Supported by ChatGPT (GPT-5)
 * Date: 2026-02-23
 * Version: 0.1
 *
 * Socket infrastructure provider for table domain.
 *
 * Responsibilities:
 * - Create and own a single Socket.IO connection.
 * - Register backend event listeners.
 * - Dispatch server events into TableState reducer.
 * - Expose emit API mirroring backend contract.
 *
 * Does NOT:
 * - Derive UI state.
 * - Store table state.
 * - Contain presentation logic.
 */

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import io from "socket.io-client";
import { useTable } from "game-table/context/TableState";
import type { TableView, TableList } from "game-table/types/table";
import { useSession } from "game-table/context/SessionContext";
import { useAuthSession } from "game-table/context/AuthSessionContext";

type BackendErrorAck = { error: string; code?: string; message: string };

type CreateJoinAck =
    | { table_code: string; member_id: string }
    | BackendErrorAck;

type StartGameAck =
    | { started: true; game_id: string }
    | BackendErrorAck;

type EndGameAck =
    | { ended: true }
    | BackendErrorAck;

type DeleteTableAck =
    | { table_code: string; deleted: true }
    | BackendErrorAck;

type TableLookupAck =
    | {
        table_code: string;
        exists: boolean;
        joinable: boolean;
        account_member_name?: string | null;
    }
    | BackendErrorAck;

type TableMembershipAck =
    | {
        table_code: string;
        member: true;
        member_id: string;
        table: TableView;
    }
    | { table_code: string; member: false }
    | BackendErrorAck;

type TableRouteEntryAck =
    | { status: "member"; table_code: string }
    | { status: "guest"; table_code: string }
    | { status: "missing"; table_code: string }
    | BackendErrorAck;

type AccountView = {
    id: string;
    auth_provider: string;
    auth_subject: string;
    username: string;
    table_nickname: string | null;
    rating: number | null;
    created_at: number;
    updated_at: number;
};

type AccountAck =
    | { account: AccountView | null }
    | BackendErrorAck;

type UsernameAvailabilityAck =
    | {
        username: string;
        username_key: string;
        available: boolean;
    }
    | BackendErrorAck;

type DeleteAccountAck =
    | { deleted: true }
    | BackendErrorAck;

type AccountHistoryEntry = {
    game_history_id: string;
    completed_at: number;
    table_code: string;
    rounds_played: number;
    team_scores: number[];
    team_player_count: number | null;
    winning_team_index: number;
    seat_index: number;
    team_index: number;
    won: boolean;
    points_for: number;
    points_against: number;
    teammates: AccountHistoryParticipant[];
    opponents: AccountHistoryParticipant[];
};

type AccountHistoryParticipant = {
    account_id: string;
    username: string;
    seat_index: number;
    team_index: number;
};

type AccountHistoryAck =
    | { history: AccountHistoryEntry[] }
    | BackendErrorAck;

type LeaderboardEntry = {
    account_id: string;
    username: string;
    games_played: number;
    games_won: number;
    win_percentage: number;
};

type LeaderboardSort = "games_won" | "games_played" | "win_percentage";

type LeaderboardAck =
    | {
        leaderboard: LeaderboardEntry[];
        page: number;
        page_size: number;
        has_more: boolean;
    }
    | BackendErrorAck;

type AccountStatsAck =
    | { stats: LeaderboardEntry[] }
    | BackendErrorAck;

type SocketErrorHandler = (message: string, code?: string) => void;

type TableSocketAPI = {
    isSessionReady: boolean;
    emit: (
        event: string,
        payload?: unknown,
        ack?: (response: any) => void
    ) => void;
    on: (event: string, handler: (...args: any[]) => void) => void;
    off: (event: string, handler: (...args: any[]) => void) => void;
    createTable: (
        table_code: string,
        name: string,
        onError?: SocketErrorHandler,
        onSuccess?: (table_code: string) => void
    ) => void;
    deleteTable: (
        table_code: string,
        onError?: SocketErrorHandler,
        onSuccess?: () => void
    ) => void;
    joinTable: (
        table_code: string,
        name: string,
        onError?: SocketErrorHandler,
        onSuccess?: (table_code: string) => void
    ) => void;
    lookupTable: (
        table_code: string,
        onResult: (response: TableLookupAck) => void
    ) => void;
    resolveTableRouteEntry: (
        table_code: string,
        onResult: (response: TableRouteEntryAck) => void
    ) => void;
    checkTableMembership: (
        table_code: string,
        onResult?: (response: TableMembershipAck) => void
    ) => void;
    updateName: (
        name: string,
        onSuccess?: () => void,
        onError?: SocketErrorHandler
    ) => void;
    leaveTable: (
        onError?: SocketErrorHandler,
        onSuccess?: () => void
    ) => void;
    removeMember: (member_id: string) => void;
    transferHost: (member_id: string) => void;
    addSeat: () => void;
    removeSeat: () => void;
    assignSeat: (seat_index: number) => void;
    unassignSeat: (seat_index: number) => void;
    updateGameSettings: (settings: unknown) => void;
    startGameForTable: (
        onError?: (message: string) => void,
        onSuccess?: (gameId: string) => void
    ) => void;
    endGameForTable: (onError?: (message: string) => void) => void;
    blockGame: () => void;
    resumeGame: () => void;
    markPersistent: () => void;
    unmarkPersistent: () => void;
    enableHandVisibility: () => void;
    disableHandVisibility: () => void;
    grantHandView: (viewer_id: string) => void;
    revokeHandView: (viewer_id: string) => void;
    canViewHand: (
        table_code: string,
        player_id: string,
        viewer_id: string
    ) => void;
    getAccount: (
        token: string,
        onResult: (response: AccountAck) => void
    ) => void;
    checkUsernameAvailability: (
        username: string,
        onResult: (response: UsernameAvailabilityAck) => void
    ) => void;
    createAccount: (
        token: string,
        username: string,
        onResult: (response: AccountAck) => void
    ) => void;
    renameUsername: (
        token: string,
        username: string,
        onResult: (response: AccountAck) => void
    ) => void;
    updateAccountTableNickname: (
        token: string,
        tableNickname: string,
        onResult: (response: AccountAck) => void
    ) => void;
    deleteAccount: (
        token: string,
        onResult: (response: DeleteAccountAck) => void
    ) => void;
    listAccountHistory: (
        token: string,
        onResult: (response: AccountHistoryAck) => void
    ) => void;
    listLeaderboard: (
        sort: LeaderboardSort,
        page: number,
        pageSize: number,
        onResult: (response: LeaderboardAck) => void
    ) => void;
    listAccountStats: (
        accountIds: string[],
        onResult: (response: AccountStatsAck) => void
    ) => void;
    listTables: () => void;
};

const TableSocketContext = createContext<TableSocketAPI | undefined>(
    undefined
);

export function TableSocketProvider({ children }: { children: ReactNode }) {
    const { state, dispatch } = useTable();
    const socketRef = useRef<ReturnType<typeof io> | null>(null);
    const selfMemberIdRef = useRef<string | null>(null);
    const leavingForPageUnloadRef = useRef(false);
    const [isSessionReady, setIsSessionReady] = useState(false);

    const { clientSessionId } = useSession();
    const { getAuthToken } = useAuthSession();

    useEffect(() => {
        selfMemberIdRef.current = state.selfMemberId;
    }, [state.selfMemberId]);

    useEffect(() => {
        const leaveForPageUnload = (event?: PageTransitionEvent) => {
            // A page kept in the back-forward cache has not actually been closed.
            if (event?.persisted) return;
            if (leavingForPageUnloadRef.current) return;
            if (!selfMemberIdRef.current) return;

            const socket = socketRef.current;
            if (!socket?.connected) return;

            leavingForPageUnloadRef.current = true;
            // No acknowledgement is useful while the document is unloading.
            // The server briefly defers this leave so a refresh can reconnect
            // without losing the tab-scoped persistent session.
            socket.emit("table:unload");
        };

        const onBeforeUnload = () => leaveForPageUnload();
        const onPageHide = (event: PageTransitionEvent) => {
            leaveForPageUnload(event);
        };

        window.addEventListener("beforeunload", onBeforeUnload);
        window.addEventListener("pagehide", onPageHide);

        return () => {
            window.removeEventListener("beforeunload", onBeforeUnload);
            window.removeEventListener("pagehide", onPageHide);
        };
    }, []);

    useEffect(() => {
        setIsSessionReady(false);

        const socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
            path: "/table",
            auth: { client_session_id: clientSessionId },
        });

        socketRef.current = socket;

        socket.on("connect", () => {
            socket.emit("table:list");
            setIsSessionReady(true);
        });

        socket.on("table:list_updated", (data: { tables: TableList[] }) => {
            dispatch({
                type: "SET_TABLE_LIST",
                payload: data.tables,
            });
        });

        socket.on("table:updated", (tableView: TableView) => {
            dispatch({
                type: "SET_TABLE_VIEW",
                payload: tableView,
            });
        });

        socket.on("table:restored", (data: { member_id: string; table: TableView }) => {
            dispatch({ type: "SET_SELF_MEMBER_ID", payload: data.member_id });
            dispatch({ type: "SET_TABLE_VIEW", payload: data.table });
        });

        socket.on("table:deleted", (data: { table_code: string }) => {
            clearChatStorage(data.table_code);

            dispatch({
                type: "SET_LAST_TABLE_EVENT",
                payload: { type: "deleted", table_code: data.table_code },
            });

            dispatch({ type: "CLEAR_TABLE_VIEW" });
            dispatch({ type: "SET_SELF_MEMBER_ID", payload: null });
        });

        socket.on("table:removed", (data: { table_code: string }) => {
            clearChatStorage(data.table_code);

            dispatch({
                type: "SET_LAST_TABLE_EVENT",
                payload: { type: "removed", table_code: data.table_code },
            });

            dispatch({ type: "CLEAR_TABLE_VIEW" });
            dispatch({ type: "SET_SELF_MEMBER_ID", payload: null });
        });

        socket.on("table:replaced", (data: { table_code: string; member_id: string }) => {
            if (selfMemberIdRef.current !== data.member_id) return;

            clearChatStorage(data.table_code);

            dispatch({
                type: "SET_LAST_TABLE_EVENT",
                payload: { type: "replaced", table_code: data.table_code },
            });

            dispatch({ type: "CLEAR_TABLE_VIEW" });
            dispatch({ type: "SET_SELF_MEMBER_ID", payload: null });
        });

        return () => {
            socket.disconnect();
            socketRef.current = null;
            setIsSessionReady(false);
        };
    }, [dispatch, clientSessionId]);

    const emit = useCallback((
        event: string,
        payload?: unknown,
        ack?: (response: any) => void
    ) => {
        const socket = socketRef.current;
        if (!socket) return;

        console.log("socket emit", event, payload);

        if (ack) {
            socket.emit(event, payload, ack);
        } else {
            socket.emit(event, payload);
        }
    }, []);

    function on(
        event: string,
        handler: (...args: any[]) => void
    ) {
        socketRef.current?.on(event, handler);
    }

    function off(
        event: string,
        handler: (...args: any[]) => void
    ) {
        socketRef.current?.off(event, handler);
    }

    function clearChatStorage(table_code?: string | null) {
        if (!table_code) return;
        sessionStorage.removeItem(`chat:${table_code}`);
        sessionStorage.removeItem(`memberNames:${table_code}`);
    }

    // --- API (identical surface to previous hook) ---

    function createTable(
        table_code: string,
        name: string,
        onError?: SocketErrorHandler,
        onSuccess?: (table_code: string) => void
    ) {
        getAuthToken()
            .catch(() => null)
            .then((authToken) => {
                emit(
                    "table:create",
                    {
                        table_code,
                        name,
                        ...(authToken ? { auth_token: authToken } : {}),
                    },
                    (response: CreateJoinAck) => {
                        if ("member_id" in response) {
                            dispatch({
                                type: "SET_SELF_MEMBER_ID",
                                payload: response.member_id,
                            });

                            dispatch({
                                type: "SET_LAST_TABLE_EVENT",
                                payload: null,
                            });

                            onSuccess?.(response.table_code);
                        } else if ("error" in response && onError) {
                            onError(response.message, response.code);
                        }
                    }
                );
            });
    }

    function deleteTable(
        table_code: string,
        onError?: SocketErrorHandler,
        onSuccess?: () => void
    ) {
        clearChatStorage(table_code);
        emit(
            "table:delete",
            { table_code },
            (response: DeleteTableAck) => {
                if (
                    "deleted" in response ||
                    ("error" in response && response.code === "TABLE_NOT_FOUND")
                ) {
                    dispatch({ type: "CLEAR_TABLE_VIEW" });
                    dispatch({ type: "SET_SELF_MEMBER_ID", payload: null });
                    onSuccess?.();
                } else if ("error" in response && onError) {
                    onError(response.message, response.code);
                }
            }
        );
    }

    function joinTable(
        table_code: string,
        name: string,
        onError?: SocketErrorHandler,
        onSuccess?: (table_code: string) => void
    ) {
        getAuthToken()
            .catch(() => null)
            .then((authToken) => {
                emit(
                    "table:join",
                    {
                        table_code,
                        name,
                        ...(authToken ? { auth_token: authToken } : {}),
                    },
                    (response: CreateJoinAck) => {
                        if ("member_id" in response) {
                            dispatch({
                                type: "SET_SELF_MEMBER_ID",
                                payload: response.member_id,
                            });

                            dispatch({
                                type: "SET_LAST_TABLE_EVENT",
                                payload: null,
                            });

                            onSuccess?.(response.table_code);
                        } else if ("error" in response && onError) {
                            onError(response.message, response.code);
                        }
                    }
                );
            });
    }

    const lookupTable = useCallback((
        table_code: string,
        onResult: (response: TableLookupAck) => void
    ) => {
        getAuthToken()
            .catch(() => null)
            .then((authToken) => {
                emit(
                    "table:lookup",
                    {
                        table_code,
                        ...(authToken ? { auth_token: authToken } : {}),
                    },
                    onResult
                );
            });
    }, [emit, getAuthToken]);

    function resolveTableRouteEntry(
        table_code: string,
        onResult: (response: TableRouteEntryAck) => void
    ) {
        checkTableMembership(table_code, (membershipResponse) => {
            if ("error" in membershipResponse) {
                onResult(membershipResponse);
                return;
            }

            if (membershipResponse.member) {
                onResult({ status: "member", table_code });
                return;
            }

            lookupTable(table_code, (lookupResponse) => {
                if ("error" in lookupResponse) {
                    onResult(lookupResponse);
                    return;
                }

                if (!lookupResponse.joinable) {
                    onResult({ status: "missing", table_code });
                    return;
                }

                onResult({ status: "guest", table_code });
            });
        });
    }

    function checkTableMembership(
        table_code: string,
        onResult?: (response: TableMembershipAck) => void
    ) {
        emit(
            "table:membership",
            { table_code },
            (response: TableMembershipAck) => {
                if ("member" in response && response.member) {
                    dispatch({ type: "SET_SELF_MEMBER_ID", payload: response.member_id });
                    dispatch({ type: "SET_TABLE_VIEW", payload: response.table });
                    dispatch({ type: "SET_LAST_TABLE_EVENT", payload: null });
                }

                onResult?.(response);
            }
        );
    }

    function updateName(
        name: string,
        onSuccess?: () => void,
        onError?: SocketErrorHandler
    ) {
        getAuthToken().then((authToken) => {
            emit(
                "table:update_name",
                { name, auth_token: authToken },
                (response: any) => {
                    if (response?.updated) {
                        onSuccess?.();
                    } else if (response?.error && onError) {
                        onError(response.message, response.code);
                    }
                }
            );
        });
    }

    function leaveTable(
        onError?: SocketErrorHandler,
        onSuccess?: () => void
    ) {
        emit("table:leave", {}, (response: any) => {
            if (response?.left) {
                clearChatStorage(response.table_code);

                dispatch({ type: "CLEAR_TABLE_VIEW" });
                dispatch({ type: "SET_SELF_MEMBER_ID", payload: null });
                onSuccess?.();
            } else if (response?.error && onError) {
                onError(response.message, response.code);
            }
        });
    }

    function removeMember(member_id: string) {
        emit("table:remove_member", { member_id });
    }

    function transferHost(member_id: string) {
        emit("table:transfer_host", { member_id });
    }

    function addSeat() {
        emit("table:add_seat");
    }

    function removeSeat() {
        emit("table:remove_seat");
    }

    function assignSeat(seat_index: number) {
        emit("table:assign_seat", { seat_index });
    }

    function unassignSeat(seat_index: number) {
        emit("table:unassign_seat", { seat_index });
    }

    function updateGameSettings(settings: unknown) {
        emit("table:update_rules", { rules: settings });
    }

    function startGameForTable(
        onError?: (message: string) => void,
        onSuccess?: (gameId: string) => void
    ) {
        emit(
            "table:start_game",
            {},
            (response: StartGameAck) => {
                console.log("game:start ack", response);
                if ("error" in response && onError) {
                    onError(response.message);
                    return;
                }

                if ("started" in response) {
                    onSuccess?.(response.game_id);
                }
            }
        );
    }

    function endGameForTable(onError?: (message: string) => void) {
        emit(
            "table:end_game",
            {},
            (response: EndGameAck) => {
                if ("error" in response && onError) {
                    onError(response.message);
                }
            }
        );
    }

    function blockGame() {
        emit("table:block_game");
    }

    function resumeGame() {
        emit("table:resume_game");
    }

    function markPersistent() {
        emit("table:mark_persistent");
    }

    function unmarkPersistent() {
        emit("table:unmark_persistent");
    }

    function enableHandVisibility() {
        emit("table:enable_hand_visibility");
    }

    function disableHandVisibility() {
        emit("table:disable_hand_visibility");
    }

    function grantHandView(viewer_id: string) {
        emit("table:grant_hand_view", { viewer_id });
    }

    function revokeHandView(viewer_id: string) {
        emit("table:revoke_hand_view", { viewer_id });
    }

    function canViewHand(
        table_code: string,
        player_id: string,
        viewer_id: string
    ) {
        emit("table:can_view_hand", {
            table_code,
            player_id,
            viewer_id,
        });
    }

    const getAccount = useCallback((
        token: string,
        onResult: (response: AccountAck) => void
    ) => {
        emit("account:me", { token }, onResult);
    }, [emit]);

    function checkUsernameAvailability(
        username: string,
        onResult: (response: UsernameAvailabilityAck) => void
    ) {
        emit("account:username_available", { username }, onResult);
    }

    function createAccount(
        token: string,
        username: string,
        onResult: (response: AccountAck) => void
    ) {
        emit("account:create", { token, username }, onResult);
    }

    function renameUsername(
        token: string,
        username: string,
        onResult: (response: AccountAck) => void
    ) {
        emit("account:rename_username", { token, username }, onResult);
    }

    function updateAccountTableNickname(
        token: string,
        tableNickname: string,
        onResult: (response: AccountAck) => void
    ) {
        emit(
            "account:update_table_nickname",
            { token, table_nickname: tableNickname },
            onResult
        );
    }

    function deleteAccount(
        token: string,
        onResult: (response: DeleteAccountAck) => void
    ) {
        emit("account:delete", { token }, onResult);
    }

    const listAccountHistory = useCallback((
        token: string,
        onResult: (response: AccountHistoryAck) => void
    ) => {
        emit("account:history", { token }, onResult);
    }, [emit]);

    const listLeaderboard = useCallback((
        sort: LeaderboardSort,
        page: number,
        pageSize: number,
        onResult: (response: LeaderboardAck) => void
    ) => {
        emit(
            "account:leaderboard",
            { sort, page, page_size: pageSize },
            onResult
        );
    }, [emit]);

    const listAccountStats = useCallback((
        accountIds: string[],
        onResult: (response: AccountStatsAck) => void
    ) => {
        emit("account:stats", { account_ids: accountIds }, onResult);
    }, [emit]);

    function listTables() {
        emit("table:list");
    }

    const api: TableSocketAPI = {
        isSessionReady,
        emit,
        on,
        off,
        createTable,
        deleteTable,
        joinTable,
        lookupTable,
        resolveTableRouteEntry,
        checkTableMembership,
        updateName,
        leaveTable,
        removeMember,
        transferHost,
        addSeat,
        removeSeat,
        assignSeat,
        unassignSeat,
        updateGameSettings,
        startGameForTable,
        endGameForTable,
        blockGame,
        resumeGame,
        markPersistent,
        unmarkPersistent,
        enableHandVisibility,
        disableHandVisibility,
        grantHandView,
        revokeHandView,
        canViewHand,
        getAccount,
        checkUsernameAvailability,
        createAccount,
        renameUsername,
        updateAccountTableNickname,
        deleteAccount,
        listAccountHistory,
        listLeaderboard,
        listAccountStats,
        listTables,
    };

    return (
        <TableSocketContext.Provider value={api}>
            {children}
        </TableSocketContext.Provider>
    );
}

export function useTableSocket() {
    const ctx = useContext(TableSocketContext);
    if (!ctx) {
        throw new Error("useTableSocket must be used within TableSocketProvider");
    }
    return ctx;
}
