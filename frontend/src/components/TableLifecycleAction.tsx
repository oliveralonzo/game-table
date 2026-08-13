import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LogOut } from "lucide-react";
import { Button, Glass, List, ListItem, Popover } from "konsta/react";
import { useTable } from "game-table/context/TableState";
import { useTableSocket } from "game-table/context/TableSocket";

export default function TableLifecycleAction() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { state } = useTable();
    const { deleteTable, endGameForTable, leaveTable } = useTableSocket();
    const [isOpen, setIsOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const table = state.tableView;
    const isHost = !!table && table.host_id === state.selfMemberId;
    const hasActiveGame = !!table?.active_game_id;

    const leave = () => {
        if (!confirm(t("table.dialog.leaveConfirm"))) return;
        setIsOpen(false);
        leaveTable((message) => alert(message), () => navigate("/", { replace: true }));
    };

    const close = () => {
        if (!table || !confirm(t("table.dialog.closeConfirm"))) return;
        setIsOpen(false);
        deleteTable(table.table_code, (message) => alert(message), () => navigate("/", { replace: true }));
    };

    const endGame = () => {
        if (!confirm(t("table.dialog.endGameConfirm"))) return;
        setIsOpen(false);
        endGameForTable((message) => alert(message));
    };

    return <>
        <Glass highlight={false} className="h-11 rounded-full [--color-ios-hover-highlight:transparent]">
            <Button
                ref={buttonRef}
                type="button"
                inline
                rounded
                clear
                aria-label={isHost ? t("table.action.tableActions") : t("table.action.leaveTable")}
                title={isHost ? t("table.action.tableActions") : t("table.action.leaveTable")}
                onClick={() => isHost ? setIsOpen((open) => !open) : leave()}
                className="h-full aspect-square px-0 text-black/65 transition-opacity hover:opacity-70 active:opacity-55 dark:text-white/70 [--color-ios-hover-highlight:transparent]"
            >
                <LogOut size={20} strokeWidth={2} />
            </Button>
        </Glass>
        {isHost ? <Popover
            opened={isOpen}
            target={buttonRef.current}
            onBackdropClick={() => setIsOpen(false)}
            className="[--color-ios-hover-highlight:transparent]"
        >
            <List nested>
                <ListItem title={t("table.action.leaveTable")} link chevron={false} onClick={leave} strongTitle={false} />
                <ListItem title={t("table.action.closeTable")} link chevron={false} onClick={close} strongTitle={false} colors={{ primaryTextIos: "text-red-600 dark:text-red-400" }} />
                {hasActiveGame ? <ListItem title={t("table.action.endGame")} link chevron={false} onClick={endGame} strongTitle={false} colors={{ primaryTextIos: "text-red-600 dark:text-red-400" }} /> : null}
            </List>
        </Popover> : null}
    </>;
}
