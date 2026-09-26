import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuthSession } from "game-table/context/AuthSessionContext";
import { useTable } from "game-table/context/TableState";
import type { TableState } from "game-table/types/table";

export type SavedTable = {
    table_code: string; instance_id: string; host_id: string | null; state: TableState;
    seats: (string | null)[]; seat_count: number;
    members: { member_id: string; name: string; account_username?: string | null }[];
};
function readSaved(key: string): SavedTable[] {
    try {
        const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
        return Array.isArray(value) ? value.filter(table => table && typeof table.table_code === "string"
            && typeof table.instance_id === "string" && Array.isArray(table.seats) && Array.isArray(table.members)) : [];
    } catch { return []; }
}
type API = { tables: SavedTable[]; save: (table: SavedTable, existingOnly?: boolean) => void; remove: (id: string) => void };
const Context = createContext<API>({ tables: [], save: () => {}, remove: () => {} });
export const useSavedTables = () => useContext(Context);

export function SavedTablesProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
    const { authUserId, isAuthLoaded, isSignedIn } = useAuthSession();
    const { state } = useTable();
    const key = `game-table:saved-tables:${authUserId ?? "guest"}`;
    const [stored, setStored] = useState(() => ({ key, tables: readSaved(key) }));
    const current = useRef(stored);
    if (current.current.key !== key) current.current = { key, tables: readSaved(key) };
    const tables = stored.key === key ? stored.tables : current.current.tables;
    const update = useCallback((change: (tables: SavedTable[]) => SavedTable[]) => {
        if (!enabled || !isAuthLoaded || current.current.key !== key) return;
        const next = { key, tables: change(current.current.tables) };
        current.current = next;
        setStored(next);
        try { localStorage.setItem(key, JSON.stringify(next.tables)); } catch { /* Keep the current session usable if storage is unavailable. */ }
    }, [enabled, isAuthLoaded, key]);
    const save = useCallback((table: SavedTable, existingOnly = false) => update(tables => {
        const index = tables.findIndex(saved => saved.instance_id === table.instance_id);
        if (index < 0) return existingOnly ? tables : [...tables, table];
        if (JSON.stringify(tables[index]) === JSON.stringify(table)) return tables;
        return tables.map((saved, i) => i === index ? table : saved);
    }), [update]);
    const remove = useCallback((id: string) => update(tables => tables.filter(table => table.instance_id !== id)), [update]);
    useEffect(() => {
        const sync = (event: StorageEvent) => {
            if (event.key !== key) return;
            current.current = { key, tables: readSaved(key) };
            setStored(current.current);
        };
        window.addEventListener("storage", sync);
        return () => window.removeEventListener("storage", sync);
    }, [key]);
    useEffect(() => {
        const view = state.tableView;
        const self = state.selfMemberId && view?.members[state.selfMemberId];
        if (!enabled || !view?.instance_id || view.group_id || !self || !isAuthLoaded) return;
        if (isSignedIn !== !!self.account_id) return;
        save({ table_code: view.table_code, instance_id: view.instance_id, host_id: view.host_id,
            state: view.state, seats: view.seats, seat_count: view.seat_count,
            members: Object.entries(view.members).map(([member_id, member]) => ({
                member_id, name: member.name, account_username: member.account_username,
            })),
        });
    }, [enabled, isAuthLoaded, isSignedIn, save, state.tableView, state.selfMemberId]);
    return <Context.Provider value={{ tables, save, remove }}>{children}</Context.Provider>;
}
