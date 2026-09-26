import type { FrontendGamePlugin } from "game-table/gamePlugin";
import type { NicknameChangeHandler } from "game-table/components/NicknameSettings";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuthSession } from "game-table/context/AuthSessionContext";
import { encodeTableCodePath } from "game-table/utils/tableRoute";
import { useTableSocket } from "game-table/context/TableSocket";
import { useGroupsCache } from "game-table/context/GroupsCacheContext";
import { useTableCreation } from "game-table/hooks/useTableCreation";
import AppLoadingScreen from "game-table/components/AppLoadingScreen";
import GroupLobbyPreview from "game-table/pages/GroupLobbyPreview";

export default function GroupLobby({ groupId, groupName, gamePlugin, displayName, onDisplayNameChange }: { groupId: string; groupName: string; gamePlugin: FrontendGamePlugin; displayName: string; onDisplayNameChange: NicknameChangeHandler }) {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { getAuthToken, authUserId } = useAuthSession();
    const { emit, joinTable, listGroupMembers, listGroupTables, createGroupTable, groupConnectionVersion, groupTablesVersion } = useTableSocket();
    const { rosters, saveRoster, tables: tableCache, saveTables, closingTables, finishTableClose, beginTableClose, cancelTableClose } = useGroupsCache();
    const tables = tableCache[groupId];
    const [refresh, setRefresh] = useState(0);
    const [entering, setEntering] = useState(false);
    const enterPending = useRef(false);
    const [closingPending, setClosingPending] = useState<string[]>([]);
    const closePendingRef = useRef(new Set<string>());
    const [tableError, setTableError] = useState<string | null>(null);
    const mounted = useRef(true);
    const listVersion = useRef(0);
    const handleTableClosed = useCallback((code: string) => {
        // Discard an in-flight list response that predates the local close.
        ++listVersion.current;
        finishTableClose(groupId, code);
        setRefresh(value => value + 1);
    }, [finishTableClose, groupId]);
    const tablesRef = useRef(tables);
    tablesRef.current = tables;
    useEffect(() => {
        mounted.current = true;
        const refreshTables = () => setRefresh(value => value + 1);
        window.addEventListener("focus", refreshTables);
        return () => { mounted.current = false; window.removeEventListener("focus", refreshTables); };
    }, []);
    useEffect(() => {
        let current = true;
        const version = ++listVersion.current;
        const fail = () => {
            if (!current || version !== listVersion.current) return;
            if (!tablesRef.current) navigate("/", { replace: true, state: { homeTab: "groups", groupOpenFailed: true, authUserId } });
            else setTableError(t("groups.tables.loadError"));
        };
        const timer = window.setTimeout(() => { fail(); current = false; }, 15000);
        getAuthToken().then(token => {
            if (!current) return;
            if (!token) { window.clearTimeout(timer); fail(); return; }
            listGroupTables(token, groupId, response => {
                window.clearTimeout(timer);
                if (!current || version !== listVersion.current) return;
                if ("error" in response) {
                    if (response.code === "GROUP_ACCESS_DENIED") {
                        navigate("/", { replace: true, state: { homeTab: "groups", groupOpenFailed: true, authUserId } });
                    } else fail();
                } else {
                    saveTables(groupId, response.tables);
                    setTableError(null);
                }
            });
        }).catch(() => { window.clearTimeout(timer); fail(); });
        return () => { current = false; window.clearTimeout(timer); };
    }, [getAuthToken, listGroupTables, groupId, groupConnectionVersion, groupTablesVersion, refresh, saveTables, navigate, authUserId, t]);
    const { creating, create: handleCreateTable } = useTableCreation({
        errorMessage: t("groups.tables.createError"), onError: setTableError,
        request: async () => {
            const token = await getAuthToken();
            if (!token) throw new Error(t("groups.tables.createError"));
            return new Promise<import("game-table/context/TableSocket").GroupTable>((resolve, reject) => {
                createGroupTable(token, groupId, response => {
                    if ("error" in response) reject(new Error(t("groups.tables.createError")));
                    else resolve(response.table);
                });
            });
        },
        onCreated: table => {
            ++listVersion.current;
            saveTables(groupId, [...(tablesRef.current ?? []).filter(previous => previous.table_code !== table.table_code), table]);
        },
    });
    const members = rosters[groupId];
    useEffect(() => {
        let current = true;
        const fail = () => {
            if (!current) return;
            current = false;
            navigate("/", { replace: true, state: { homeTab: "groups", groupOpenFailed: true, authUserId } });
        };
        const timer = window.setTimeout(() => { fail(); current = false; }, 15000);
        getAuthToken().then(token => {
            if (!current) return;
            if (!token) { window.clearTimeout(timer); fail(); return; }
            listGroupMembers(token, groupId, response => {
                window.clearTimeout(timer);
                if (!current) return;
                if ("error" in response) {
                    if (response.code === "GROUP_ACCESS_DENIED") {
                        saveRoster(groupId, null);
                        fail();
                    } else fail();
                } else if (response.group_id === groupId) {
                    saveRoster(groupId, response.members);
                } else fail();
            });
        }).catch(() => { window.clearTimeout(timer); fail(); });
        return () => { current = false; window.clearTimeout(timer); };
    }, [getAuthToken, authUserId, listGroupMembers, groupConnectionVersion, groupId, saveRoster, navigate, refresh]);

    const handleEnterTable = (code: string) => {
        if (enterPending.current) return;
        const self = members?.find(member => member.is_self);
        if (!self) return;
        enterPending.current = true;
        setEntering(true);
        joinTable(code, self.name, () => {
            enterPending.current = false;
            if (!mounted.current) return;
            setEntering(false);
            setTableError(t("groups.tables.enterError"));
            setRefresh(value => value + 1);
        }, tableCode => navigate(encodeTableCodePath(tableCode)));
    };
    const handleRemoveTable = async (table: import("game-table/context/TableSocket").GroupTable) => {
        if (table.members.length || closingTables[table.table_code] || closePendingRef.current.has(table.table_code)) return;
        closePendingRef.current.add(table.table_code);
        setClosingPending(previous => [...previous, table.table_code]);
        beginTableClose(table);
        let finished = false;
        const fail = () => {
            if (finished) return;
            finished = true;
            cancelTableClose(table.table_code);
            closePendingRef.current.delete(table.table_code);
            if (mounted.current) setClosingPending(previous => previous.filter(code => code !== table.table_code));
            if (mounted.current) { setTableError(t("groups.tables.closeError")); setRefresh(value => value + 1); }
        };
        const timer = window.setTimeout(fail, 12000);
        try {
            const token = await getAuthToken();
            if (finished) return;
            if (!token) { fail(); window.clearTimeout(timer); return; }
            emit("group:close_empty_table", { token, group_id: groupId, table_code: table.table_code, instance_id: table.instance_id },
                (response: { closed?: boolean }) => {
                    window.clearTimeout(timer);
                    if (finished) return;
                    if (!response?.closed) { fail(); return; }
                    finished = true;
                    closePendingRef.current.delete(table.table_code);
                    if (mounted.current) setClosingPending(previous => previous.filter(code => code !== table.table_code));
                    ++listVersion.current;
                    if (mounted.current) setRefresh(value => value + 1);
                });
        } catch { window.clearTimeout(timer); fail(); }
    };
    if (entering || !members || !tables) return <AppLoadingScreen />;
    return <GroupLobbyPreview gamePlugin={gamePlugin} displayName={displayName} onDisplayNameChange={(name, success, error) => onDisplayNameChange(name, () => { setRefresh(value => value + 1); success?.(); }, error)} groupId={groupId} groupName={groupName} groupMembers={members} tables={tables} closingTables={closingTables} closingPending={closingPending} onTableClosed={handleTableClosed} onEnterTable={handleEnterTable} onRemoveTable={handleRemoveTable} onCreateTable={handleCreateTable} creating={creating} tableError={tableError} />;
}
