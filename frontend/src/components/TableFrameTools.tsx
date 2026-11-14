import { useEffect, useState } from "react";
import InviteButton from "game-table/components/InviteButton";
import TableIdentity from "game-table/components/TableIdentity";
import QueueAction from 'game-table/components/QueueAction';
import { type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import TableSponsor from "game-table/components/TableSponsor";
import TableInviteDialog from "game-table/components/TableInviteDialog";

import Chat from "game-table/components/Chat";
import { useTable } from "game-table/context/TableState";
import PeoplePanel from "game-table/components/PeoplePanel";
import type { RosterAction, RosterPerson } from "game-table/components/LobbyRoster";
import type { TableTool, TableToolRenderContext } from "game-table/components/TableFrame";
import type { ChatMessage } from "game-table/types/activity";

type Props = {
    tool: TableTool;
    context?: TableToolRenderContext;
    seatedRoster: RosterPerson[];
    viewerRoster: RosterPerson[];
    queuedRoster?: RosterPerson[];
    seatCount: number;
    showSeatLocation?: boolean;
    showHandViewStatus?: boolean;
    getRosterActions: (person: RosterPerson) => RosterAction[];
    middleAction?: ReactNode;
    tableCode?: string | null;
    inviteCopied: boolean;
    fallbackInviteUrl?: string | null;
    onInvite: () => void | Promise<void>;
    onCloseInviteFallback?: () => void;
    renderSettings: (context?: TableToolRenderContext) => ReactNode;
    messages: ChatMessage[];
    selfId?: string | null;
    displayName: string;
    memberNamesById: Record<string, string>;
    chatDraft: string;
    setChatDraft: Dispatch<SetStateAction<string>>;
    onSendChat: (draft?: string) => void;
};

export default function TableFrameTools({
    tool,
    context,
    seatedRoster,
    viewerRoster,
    queuedRoster,
    seatCount,
    showSeatLocation = true,
    showHandViewStatus = false,
    getRosterActions,
    middleAction,
    tableCode,
    inviteCopied,
    fallbackInviteUrl,
    onInvite,
    onCloseInviteFallback,
    renderSettings,
    messages,
    selfId,
    displayName,
    memberNamesById,
    chatDraft,
    setChatDraft,
    onSendChat,
}: Props) {
    const { t } = useTranslation();
    const { state } = useTable();
    const start = state.tableView?.start_game_confirmation;
    const end = state.tableView?.end_game_confirmation;
    const transitionDeadline = state.tableView?.post_game_transition?.seating_blocked;
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        if (!transitionDeadline && start?.status !== "pending" && end?.status !== "pending") return;
        setNow(Date.now());
        const timer = window.setInterval(() => setNow(Date.now()), 250);
        return () => window.clearInterval(timer);
    }, [transitionDeadline, start?.status, end?.status]);
    const waiting = (deadline: number | null) => {
        if (deadline == null) return t("table.startConfirmation.waiting");
        const seconds = Math.max(0, Math.ceil(deadline - now / 1000));
        return `${t("table.startConfirmation.waiting")} · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    };
    if (tool === "people") {
        const transition = state.tableView?.post_game_transition;
        const vote = start?.status === "pending" ? start : end;
        const voting = vote?.status === 'pending';
        const checking = !!transition?.seating_blocked;
        const roster = [...seatedRoster, ...(queuedRoster ?? []), ...viewerRoster];
        const status = (person: RosterPerson) => {
            const check = transition?.players[person.id];
            if (voting && vote && person.id in vote.responses) {
                const response = vote.responses[person.id];
                return { ...person, statusLabel: response === null ? waiting(vote.deadline) : t(start?.status === "pending"
                    ? response ? "table.queue.readyStatus" : "table.startConfirmation.no"
                    : response ? "table.endConfirmation.yes" : "table.endConfirmation.no") };
            }
            if (start?.status === "cancelled" && person.id in start.responses) {
                const response = start.responses[person.id];
                return { ...person, statusLabel: t(response === true ? "table.queue.readyStatus"
                    : response === null && !Object.values(start.responses).includes(false) ? "table.postGame.expired" : "table.startConfirmation.no") };
            }
            if (!check) return person;
            const key = check.decision === 'accepted'
                ? transition?.challengers?.includes(person.id) ? 'table.queue.readyStatus'
                    : check.team_preference === 'mix_it_up' ? 'table.postGame.changePartner'
                    : check.team_preference === 'same_team' ? 'table.postGame.samePartner' : 'table.postGame.playing'
                : check.decision === 'left' ? 'table.postGame.leave'
                : check.decision === 'timed_out' ? 'table.postGame.expired'
                : check.decision === 'waiting' ? 'table.postGame.awaitingSpot'
                : check.decision === 'team_choice' ? 'table.postGame.choosingPartner'
                : check.decision === 'partner_choice' ? 'table.postGame.choosingPlayer'
                : 'table.postGame.answering';
            return { ...person, statusLabel: check.deadline != null && !["accepted", "left", "timed_out"].includes(check.decision) ? waiting(check.deadline) : t(key) };
        };
        const pending = voting && vote ? roster.filter(person => vote.responses[person.id] === null).map(status) : checking ? roster.filter(person => {
            const decision = transition?.players[person.id]?.decision;
            return decision && !['accepted', 'left', 'timed_out'].includes(decision)
                && !(decision === 'waiting' && transition?.challengers?.includes(person.id));
        }).map(status) : [];
        const accepted = checking ? roster.filter(person => transition?.players[person.id]?.decision === 'accepted').map(status) : voting ? seatedRoster.filter(person => vote?.responses[person.id] !== null).map(status) : start?.status === "cancelled" ? seatedRoster.map(status) : seatedRoster;
        const queued = checking ? (queuedRoster ?? []).filter(person => transition?.players[person.id]?.decision === 'waiting').map(status) : queuedRoster;
        const displayed = new Set([...pending, ...accepted, ...(queued ?? [])].map(person => person.id));
        const viewers = checking ? roster.filter(person => !displayed.has(person.id)).map(status) : viewerRoster;
        return (
            <section className="flex min-h-0 flex-1 max-h-[min(32rem,calc(100svh-7rem))] flex-col overflow-hidden">
                <PeoplePanel
                    seatedRoster={accepted}
                    viewerRoster={viewers}
                    queuedRoster={queued}
                    pendingRoster={pending}
                    seatCount={seatCount}
                    showSeatLocation={checking ? false : showSeatLocation}
                    showHandViewStatus={checking ? false : showHandViewStatus}
                    getActions={getRosterActions}
                    middleAction={checking ? null : middleAction ?? <QueueAction />}
                />
                <div className="grid shrink-0 gap-2 px-safe-4 pt-1">
                    <TableIdentity linkGroup />
                    {tableCode && <TableSponsor className="text-center" />}
                    <InviteButton onInvite={onInvite} inviteCopied={inviteCopied} fullWidth />
                </div>
                <TableInviteDialog
                    fallbackInviteUrl={fallbackInviteUrl}
                    onCloseInviteFallback={onCloseInviteFallback}
                />
            </section>
        );
    }

    if (tool === "settings") {
        return <>{renderSettings(context)}</>;
    }

    return (
        <Chat
            messages={messages}
            selfId={selfId}
            displayName={displayName}
            memberNamesById={memberNamesById}
            chatDraft={chatDraft}
            setChatDraft={setChatDraft}
            onSendChat={onSendChat}
        />
    );
}
