import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LogOut } from "lucide-react";
import { Button, Glass, List, ListItem, Popover } from "konsta/react";
import { useGroupsCache } from "game-table/context/GroupsCacheContext";
import { useTable } from "game-table/context/TableState";
import { useTableSocket } from "game-table/context/TableSocket";

export default function TableLifecycleAction() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { state } = useTable();
    const { beginTableClose, cancelTableClose } = useGroupsCache();
    const { deleteTable, endGameForTable, leaveTable } = useTableSocket();
    const [isOpen, setIsOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const table = state.tableView;
    const isHost = !!table && table.host_id === state.selfMemberId;
    const isLastGroupParticipant = !!table?.group_id && !!state.selfMemberId
        && Object.keys(table.members).length === 1 && !!table.members[state.selfMemberId];
    const canClose = isHost || isLastGroupParticipant;
    const returnUrl = table?.group_id
        ? (state.selfMemberId && table.group_member_ids?.includes(state.selfMemberId) && table.group_public_id
            ? `/g/${encodeURIComponent(table.group_public_id!)}` : "/")
        : "/";
    const hasActiveGame = !!table?.active_game_id;

    const leave = () => {
        if (!confirm(t("table.dialog.leaveConfirm"))) return;
        setIsOpen(false);
        leaveTable((message) => alert(message), () => navigate(returnUrl, { replace: true, state: { homeTab: "tables" } }));
    };

    const close = () => {
        if (!table || !confirm(t("table.dialog.closeConfirm"))) return;
        setIsOpen(false);
        if (table.group_id) {
            beginTableClose({
                instance_id: table.instance_id!, table_code: table.table_code, group_id: table.group_id, state: table.state,
                seat_count: table.seat_count, seats: table.seats,
                members: Object.entries(table.members).map(([member_id, member]) => ({
                    member_id, name: member.name, account_username: member.account_username ?? null,
                })),
            });
        }
        deleteTable(table.table_code, (message) => {
            cancelTableClose(table.table_code);
            alert(message);
        }, () => navigate(returnUrl, { replace: true, state: { homeTab: "tables" } }));
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
                aria-label={canClose ? t("table.action.tableActions") : t("table.action.leaveTable")}
                title={canClose ? t("table.action.tableActions") : t("table.action.leaveTable")}
                onClick={() => canClose ? setIsOpen((open) => !open) : leave()}
                className="h-full aspect-square px-0 text-black/65 transition-opacity hover:opacity-70 active:opacity-55 dark:text-white/70 [--color-ios-hover-highlight:transparent]"
            >
                <LogOut size={20} strokeWidth={2} />
            </Button>
        </Glass>
        {canClose ? <Popover
            opened={isOpen}
            target={buttonRef.current}
            onBackdropClick={() => setIsOpen(false)}
            className="[--color-ios-hover-highlight:transparent]"
        >
            <List nested>
                <ListItem title={t("table.action.leaveTable")} link chevron={false} onClick={leave} strongTitle={false} />
                <ListItem title={t("table.action.closeTable")} link chevron={false} onClick={close} strongTitle={false} colors={{ primaryTextIos: "text-red-600 dark:text-red-400" }} />
                {hasActiveGame && isHost ? <ListItem title={t("table.action.endGame")} link chevron={false} onClick={endGame} strongTitle={false} colors={{ primaryTextIos: "text-red-600 dark:text-red-400" }} /> : null}
            </List>
        </Popover> : null}
    </>;
}
