import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuthSession } from "game-table/context/AuthSessionContext";
import { useTableSocket } from "game-table/context/TableSocket";
import type { GroupPresenceSnapshot, GroupSummary, GroupMember, GroupTable } from "game-table/context/TableSocket";

import { groupActivityKey, type GroupActivity } from "game-table/types/groupActivity";

type GroupLiveSummary = { has_open_tables: boolean; active_count: number | null };
type GroupsCache = {
    liveGroups: Record<string, GroupLiveSummary> | null;
    presence: GroupPresenceSnapshot | null;
    savePresence: (value: GroupPresenceSnapshot | null) => void;
    activity: Record<string, GroupActivity>;
    saveActivity: (key: string, value: GroupActivity) => void;
    clearGroupActivity: (groupId: string) => void;
    closingTables: Record<string, GroupTable>;
    beginTableClose: (table: GroupTable) => void;
    cancelTableClose: (code: string) => void;
    finishTableClose: (groupId: string, code: string) => void;
    tables: Record<string, GroupTable[]>;
    saveTables: (groupId: string, tables: GroupTable[]) => void;
    rosters: Record<string, GroupMember[]>;
    saveRoster: (groupId: string, members: GroupMember[] | null) => void; groups: GroupSummary[] | null; saveGroups: (groups: GroupSummary[]) => void };
const GroupsCacheContext = createContext<GroupsCache | undefined>(undefined);

// Survives navigation, but not account changes, sign-out, or a page reload.
export function GroupsCacheProvider({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
    const { authUserId, isSignedIn, isAuthLoaded, getAuthToken } = useAuthSession();
    const userId = isSignedIn ? authUserId : null;
    const { emit, on, off, groupConnectionVersion } = useTableSocket();
    const [live, setLive] = useState<{ userId: string; groups: Record<string, GroupLiveSummary> } | null>(null);
    useEffect(() => {
        // Keep the last known summary while reconnecting for the same account.
        setLive(previous => enabled && isAuthLoaded && previous?.userId === userId ? previous : null);
        if (!enabled || !isAuthLoaded || !userId) return;
        let current = true;
        let initialized = false;
        const pending: Record<string, Partial<GroupLiveSummary>> = {};
        const revoked = new Set<string>();
        const update = (groupId: string, value: Partial<GroupLiveSummary>) => {
            if (!current || revoked.has(groupId)) return;
            if (!initialized) pending[groupId] = { ...pending[groupId], ...value };
            setLive(previous => previous?.userId === userId && groupId in previous.groups
                ? { userId, groups: { ...previous.groups, [groupId]: { ...previous.groups[groupId], ...value } } }
                : previous);
        };
        const availability = (event: { group_id: string; has_open_tables: boolean }) =>
            update(event.group_id, { has_open_tables: event.has_open_tables });
        const active = (event: { group_id: string; active_count: number }) =>
            update(event.group_id, { active_count: event.active_count });
        const revoke = (event: { group_id: string }) => {
            revoked.add(event.group_id);
            setLive(previous => {
                if (previous?.userId !== userId) return previous;
                const groups = { ...previous.groups };
                delete groups[event.group_id];
                return { userId, groups };
            });
        };
        on("group:table_availability", availability);
        on("group:active_count", active);
        on("group:access_revoked", revoke);
        getAuthToken().then(token => {
            if (!current || !token) return;
            emit("group:watch_tables", { token }, (response: {
                groups?: Record<string, boolean>; active_counts?: Record<string, number>;
            }) => {
                if (!current) return;
                initialized = true;
                if (!response?.groups) return;
                setLive({ userId, groups: Object.fromEntries(
                    Object.entries(response.groups).filter(([id]) => !revoked.has(id)).map(([id, has_open_tables]) =>
                        [id, { has_open_tables, active_count: response.active_counts?.[id] ?? null, ...pending[id] }]),
                ) });
            });
        }).catch(() => { /* Retain the last known summary until a later reconnect. */ });
        return () => {
            current = false;
            off("group:table_availability", availability);
            off("group:active_count", active);
            off("group:access_revoked", revoke);
            emit("group:unwatch_tables", {});
        };
    }, [enabled, isAuthLoaded, userId, getAuthToken, emit, on, off, groupConnectionVersion]);

    const [cache, setCache] = useState<{ userId: string; groups: GroupSummary[] } | null>(null);
    const [tables, setTables] = useState<{ userId: string; entries: Record<string, GroupTable[]> } | null>(null);
    const [rosters, setRosters] = useState<{ userId: string; entries: Record<string, GroupMember[]> } | null>(null);
    const [closing, setClosing] = useState<{ userId: string; entries: Record<string, GroupTable> } | null>(null);
    const [activity, setActivity] = useState<{ userId: string; entries: Record<string, GroupActivity> } | null>(null);
    const [presence, setPresence] = useState<{ userId: string; value: GroupPresenceSnapshot } | null>(null);
    const savePresence = useCallback((value: GroupPresenceSnapshot | null) => {
        setPresence(userId && value ? { userId, value } : null);
    }, [userId]);
    useEffect(() => {
        setPresence(previous => previous?.userId === userId ? previous : null);
        setActivity(previous => previous?.userId === userId ? previous : null);
        setClosing(previous => previous?.userId === userId ? previous : null);
        setTables(previous => previous?.userId === userId ? previous : null);
        setRosters(previous => previous?.userId === userId ? previous : null);
        setCache(previous => previous?.userId === userId ? previous : null);
    }, [userId]);
    const saveActivity = useCallback((key: string, value: GroupActivity) => {
        if (!userId) return;
        setActivity(previous => ({ userId, entries: {
            ...(previous?.userId === userId ? previous.entries : {}), [key]: value,
            [groupActivityKey(value.group_id, value.season, value.history.page)]: value,
        } }));
    }, [userId]);
    const clearGroupActivity = useCallback((groupId: string) => {
        setActivity(previous => !previous || previous.userId !== userId ? previous : ({
            userId: previous.userId,
            entries: Object.fromEntries(Object.entries(previous.entries).filter(([, value]) => value.group_id !== groupId)),
        }));
    }, [userId]);
    const saveGroups = useCallback((groups: GroupSummary[]) => {
        if (userId) setCache({ userId, groups });
    }, [userId]);
    const saveRoster = useCallback((groupId: string, members: GroupMember[] | null) => {
        if (!userId) return;
        setRosters(previous => {
            const entries = { ...(previous?.userId === userId ? previous.entries : {}) };
            if (members) entries[groupId] = members;
            else delete entries[groupId];
            return { userId, entries };
        });
    }, [userId]);
    const saveTables = useCallback((groupId: string, tables: GroupTable[]) => {
        if (!userId) return;
        setTables(previous => ({ userId, entries: {
            ...(previous?.userId === userId ? previous.entries : {}), [groupId]: tables,
        } }));
    }, [userId]);
    const beginTableClose = useCallback((table: GroupTable) => {
        if (!userId) return;
        setClosing(previous => ({ userId, entries: {
            ...(previous?.userId === userId ? previous.entries : {}), [table.table_code]: table,
        } }));
    }, [userId]);
    const cancelTableClose = useCallback((code: string) => {
        setClosing(previous => {
            if (!previous || previous.userId !== userId) return previous;
            const entries = { ...previous.entries };
            delete entries[code];
            return { userId: previous.userId, entries };
        });
    }, [userId]);
    const finishTableClose = useCallback((groupId: string, code: string) => {
        setTables(previous => {
            if (!previous || previous.userId !== userId) return previous;
            return { ...previous, entries: { ...previous.entries,
                [groupId]: (previous.entries[groupId] ?? []).filter(table => table.table_code !== code),
            } };
        });
        cancelTableClose(code);
    }, [userId, cancelTableClose]);
    return <GroupsCacheContext.Provider value={{
        liveGroups: userId && live?.userId === userId ? live.groups : null,
        presence: userId && presence?.userId === userId ? presence.value : null, savePresence,
        activity: userId && activity?.userId === userId ? activity.entries : {},
        saveActivity, clearGroupActivity,
        closingTables: userId && closing?.userId === userId ? closing.entries : {},
        beginTableClose, cancelTableClose, finishTableClose,
        groups: userId && cache?.userId === userId ? cache.groups : null,
        saveGroups, saveRoster, saveTables,
        tables: userId && tables?.userId === userId ? tables.entries : {},
        rosters: userId && rosters?.userId === userId ? rosters.entries : {},
    }}>{children}</GroupsCacheContext.Provider>;
}

export function useGroupsCache() {
    const context = useContext(GroupsCacheContext);
    if (!context) throw new Error("GroupsCacheProvider is required.");
    return context;
}
