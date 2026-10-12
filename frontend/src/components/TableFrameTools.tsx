import TableIdentity from "game-table/components/TableIdentity";
import QueueAction from 'game-table/components/QueueAction';
import { type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Share } from "lucide-react";
import { Button } from "konsta/react";
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
    if (tool === "people") {
        const transition = state.tableView?.post_game_transition;
        const vote = state.tableView?.end_game_confirmation;
        const voting = vote?.status === 'pending';
        const checking = !!transition?.seating_blocked;
        const roster = [...seatedRoster, ...(queuedRoster ?? []), ...viewerRoster];
        const status = (person: RosterPerson) => {
            const check = transition?.players[person.id];
            if (voting && vote && person.id in vote.responses) {
                const response = vote.responses[person.id];
                return { ...person, statusLabel: t(response === null ? 'table.postGame.answering' : response ? 'table.endConfirmation.yes' : 'table.endConfirmation.no') };
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
            return { ...person, statusLabel: t(key) };
        };
        const pending = voting && vote ? roster.filter(person => vote.responses[person.id] === null).map(status) : checking ? roster.filter(person => {
            const decision = transition?.players[person.id]?.decision;
            return decision && !['accepted', 'left', 'timed_out'].includes(decision)
                && !(decision === 'waiting' && transition?.challengers?.includes(person.id));
        }).map(status) : [];
        const accepted = checking ? roster.filter(person => transition?.players[person.id]?.decision === 'accepted').map(status) : voting ? seatedRoster.filter(person => vote?.responses[person.id] !== null).map(status) : seatedRoster;
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
                    <Button
                        type="button"
                        clear
                        rounded
                        onClick={onInvite}
                        className="h-10 w-full px-3 font-semibold"
                    >
                        <span className="inline-flex items-center gap-2">
                            <Share size={18} strokeWidth={2.2} aria-hidden="true" />
                            {inviteCopied ? t("table.action.copied") : t("table.action.invite")}
                        </span>
                    </Button>
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
