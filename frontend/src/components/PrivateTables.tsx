import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Dialog, DialogButton, List, ListInput } from "konsta/react";
import { useSavedTables, type SavedTable } from "game-table/context/SavedTablesContext";
import { useTableSocket } from "game-table/context/TableSocket";
import { useAuthSession } from "game-table/context/AuthSessionContext";
import { useTable } from "game-table/context/TableState";
import DismissibleNotice from "game-table/components/DismissibleNotice";
import TableCards from "game-table/components/TableCards";
import { useTableCreation } from "game-table/hooks/useTableCreation";
import { encodeTableCodePath, normalizeTableCode } from "game-table/utils/tableRoute";
import { backendErrorToJoinKey, resolveBackendErrorCode } from "game-table/i18n/backendErrors";

type PreviewAck = { table: SavedTable | null } | { error: string; message: string; code?: string };
export default function PrivateTables({ ready }: { ready: boolean }) {
    const { t } = useTranslation();
    const { getAuthToken } = useAuthSession();
    const navigate = useNavigate();
    const location = useLocation();
    const { tables, save, remove } = useSavedTables();
    const { emit, lookupTable, groupConnectionVersion } = useTableSocket();
    const { state } = useTable();
    const [entering, setEntering] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(() => location.state?.tableEntryError ? t(location.state.tableEntryError, { code: location.state.tableEntryCode }) : null);
    const [checkingCode, setCheckingCode] = useState(false);
    useEffect(() => {
        if (!location.state?.tableEntryError) return;
        setError(t(location.state.tableEntryError, { code: location.state.tableEntryCode }));
        const { tableEntryError, tableEntryCode, ...rest } = location.state;
        navigate(`${location.pathname}${location.search}`, { replace: true, state: rest });
    }, [location, navigate, t]);
    const [joining, setJoining] = useState(false);
    const codeFormRef = useRef<HTMLFormElement>(null);
    useEffect(() => {
        if (!joining) return;
        const frame = window.requestAnimationFrame(() => codeFormRef.current?.querySelector("input")?.focus());
        return () => window.cancelAnimationFrame(frame);
    }, [joining]);
    const cancelCodeLookup = useRef<(() => void) | null>(null);
    const closeCodeEntry = () => {
        cancelCodeLookup.current?.();
        cancelCodeLookup.current = null;
        setJoining(false);
        setError(null);
    };
    const [code, setCode] = useState("");
    const [closing, setClosing] = useState<string[]>([]);
    const current = useRef(tables);
    current.current = tables;
    const mounted = useRef(true);
    const pending = useRef(false);
    const ids = tables.map(table => table.instance_id).join(",");
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const dismiss = (id: string) => setClosing(previous => previous.includes(id) ? previous : [...previous, id]);
    useEffect(() => {
        let active = true;
        const refresh = () => {
            for (const table of current.current) emit("table:saved_preview", { table_code: table.table_code, instance_id: table.instance_id }, (response: PreviewAck) => {
                if (!active || !response || "error" in response || !current.current.some(saved => saved.instance_id === table.instance_id)) return;
                if (!response.table) dismiss(table.instance_id);
                else save(response.table, true);
            });
        };
        refresh();
        const interval = window.setInterval(refresh, 15000);
        window.addEventListener("focus", refresh);
        return () => { active = false; window.clearInterval(interval); window.removeEventListener("focus", refresh); };
    }, [ids, emit, save, groupConnectionVersion, state.tableList]);
    const enter = (table: SavedTable) => {
        if (pending.current || creating) return;
        pending.current = true;
        setEntering(table.instance_id);
        setError(null);
        let finished = false;
        const timer = window.setTimeout(() => {
            finished = true;
            pending.current = false;
            if (mounted.current) { setEntering(null); setError(t("privateTables.unavailable")); }
        }, 12000);
        emit("table:saved_preview", { table_code: table.table_code, instance_id: table.instance_id }, (response: PreviewAck) => {
            if (finished) return;
            finished = true;
            window.clearTimeout(timer);
            pending.current = false;
            if (!mounted.current) return;
            setEntering(null);
            if (!response || "error" in response) { setError(t("privateTables.unavailable")); return; }
            if (!response.table) { dismiss(table.instance_id); return; }
            navigate(encodeTableCodePath(table.table_code), { state: { intent: "join", instanceId: table.instance_id } });
        });
    };
    const { creating, create } = useTableCreation<SavedTable>({
        errorMessage: t("groups.tables.createError"), onError: setError,
        request: async () => {
            const auth_token = await getAuthToken();
            return new Promise((resolve, reject) => {
            emit("table:create_empty", { auth_token }, (response: PreviewAck) => {
                if (!response || "error" in response || !response.table) reject(new Error(t("groups.tables.createError")));
                else resolve(response.table);
            });
            });
        },
        onCreated: table => save(table),
    });
    return <section className="w-full max-w-md">
        <p className="mb-5 px-1 text-sm text-black/55 dark:text-white/55">
            {t("privateTables.receivedCode")} {" "}
            <button type="button" className="cursor-pointer underline underline-offset-2 hover:text-black dark:hover:text-white"
                onClick={() => { setError(null); setJoining(true); }} aria-haspopup="dialog" aria-expanded={joining} aria-controls="private-table-code">
                {t("privateTables.joinLink")}
            </button>
        </p>
        <Dialog opened={joining} title={t("privateTables.joinLink")} onBackdropClick={closeCodeEntry}
            onKeyDown={event => { if (event.key === "Escape") closeCodeEntry(); }}
            buttons={<>
                <DialogButton type="button" onClick={closeCodeEntry}>{t("account.action.cancel")}</DialogButton>
                <DialogButton strong type="submit" form="private-table-code" disabled={!code.trim() || !!entering || creating || checkingCode}>{t("join.action.join")}</DialogButton>
            </>}>
        <form ref={codeFormRef} id="private-table-code" onSubmit={event => {
            event.preventDefault();
            const normalized = normalizeTableCode(code);
            if (!normalized || pending.current || creating) return;
            pending.current = true;
            setCheckingCode(true);
            setError(null);
            let finished = false;
            const timer = window.setTimeout(() => {
                finished = true;
                pending.current = false;
                cancelCodeLookup.current = null;
                if (mounted.current) { setCheckingCode(false); setJoining(false); setError(t("privateTables.unavailable")); }
            }, 12000);
            cancelCodeLookup.current = () => {
                finished = true;
                window.clearTimeout(timer);
                pending.current = false;
                setCheckingCode(false);
            };
            lookupTable(normalized, response => {
                if (finished) return;
                finished = true;
                cancelCodeLookup.current = null;
                window.clearTimeout(timer);
                pending.current = false;
                if (!mounted.current) return;
                setCheckingCode(false);
                setJoining(false);
                if ("error" in response) {
                    setError(t(resolveBackendErrorCode(response.code, response.message) === "TABLE_NOT_FOUND"
                        ? "join.status.tableNotFoundCode" : backendErrorToJoinKey(response.code, response.message), { code: normalized }));
                } else if (!response.joinable) {
                    setError(t("join.status.tableNotFoundCode", { code: normalized }));
                } else {
                    navigate(encodeTableCodePath(normalized), { state: { intent: "join" } });
                }
            });
        }}>
            <List strong inset className="!mx-0 !my-0">
                {/* Konsta 5.2 passes a null title to ListItem; an empty title avoids its class-helper crash. */}
                <ListInput title="" inputId="private-table-code-input" label={<label htmlFor="private-table-code-input">{t("join.field.tableCode")}</label>}
                    type="text" value={code} onChange={event => setCode(event.target.value.toUpperCase().replace(/\s+/g, "-"))}
                    placeholder={t("join.placeholder.code")} autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck="false"
                    clearButton onClear={() => setCode("")} />
            </List>
        </form>
        </Dialog>
        <TableCards tables={tables} getKey={table => table.instance_id}
            isPending={table => entering === table.instance_id} isClosing={table => closing.includes(table.instance_id)}
            onClosed={table => { remove(table.instance_id); setClosing(previous => previous.filter(id => id !== table.instance_id)); }}
            onRemove={table => dismiss(table.instance_id)} onEnter={enter} creating={creating} onCreate={create}
            disabled={!ready || !!entering || checkingCode} />
        {!joining && error && <DismissibleNotice onDismiss={() => setError(null)}>{error}</DismissibleNotice>}
    </section>;
}
