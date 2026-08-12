import { type Dispatch, type ReactNode, type SetStateAction, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChartNoAxesColumn } from "lucide-react";
import { Button, Dialog, DialogButton } from "konsta/react";

import Chat from "game-table/components/Chat";
import PeoplePanel from "game-table/components/PeoplePanel";
import type { RosterAction, RosterPerson } from "game-table/components/LobbyRoster";
import type { TableTool, TableToolRenderContext } from "game-table/components/TableFrame";
import type { ChatMessage } from "game-table/types/activity";

type Props = {
    tool: TableTool;
    context?: TableToolRenderContext;
    seatedRoster: RosterPerson[];
    viewerRoster: RosterPerson[];
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
    const fallbackInviteTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const fallbackInviteText = fallbackInviteUrl
        ? `${t("table.dialog.inviteShareText")}\n${fallbackInviteUrl}`
        : "";
    const [editableFallbackInviteText, setEditableFallbackInviteText] = useState(fallbackInviteText);

    useEffect(() => {
        setEditableFallbackInviteText(fallbackInviteText);
    }, [fallbackInviteText]);
    const closeFallbackInviteDialog = () => {
        fallbackInviteTextareaRef.current?.blur();
        onCloseInviteFallback?.();
    };

    if (tool === "people") {
        return (
            <section className="flex max-h-[min(32rem,calc(100svh-7rem))] flex-col">
                <PeoplePanel
                    seatedRoster={seatedRoster}
                    viewerRoster={viewerRoster}
                    seatCount={seatCount}
                    showSeatLocation={showSeatLocation}
                    showHandViewStatus={showHandViewStatus}
                    getActions={getRosterActions}
                    middleAction={middleAction}
                />
                <div className="grid shrink-0 gap-2 px-safe-4 pt-1">
                    <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0">
                            <span className="block text-[11px] font-medium uppercase tracking-normal text-black/35 dark:text-white/35">
                                {t("table.label.code")}
                            </span>
                            <span className="block truncate font-mono text-sm font-medium tracking-normal text-black/55 dark:text-white/55">
                                {tableCode}
                            </span>
                        </span>
                        {context?.openLeaderboard ? <Button
                            type="button"
                            inline
                            clear
                            rounded
                            aria-label={t("leaderboard.tool")}
                            title={t("leaderboard.tool")}
                            onClick={context?.openLeaderboard}
                            className="h-9 aspect-square px-0"
                        >
                            <ChartNoAxesColumn size={18} strokeWidth={2.2} />
                        </Button> : null}
                    </div>
                    <Button
                        type="button"
                        clear
                        rounded
                        onClick={onInvite}
                        className="h-10 w-full px-3 font-semibold"
                    >
                        {inviteCopied ? t("table.action.copied") : t("table.action.invite")}
                    </Button>
                </div>
                <Dialog
                    opened={!!fallbackInviteUrl}
                    title={t("table.dialog.inviteLink")}
                    content={(
                        <div className="space-y-3 text-left">
                            <p className="text-sm text-black/70 dark:text-white/70">
                                {t("table.dialog.inviteCopyInstruction")}
                            </p>
                            <textarea
                                ref={fallbackInviteTextareaRef}
                                rows={3}
                                value={editableFallbackInviteText}
                                onChange={(event) => setEditableFallbackInviteText(event.target.value)}
                                onFocus={(event) => event.currentTarget.select()}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                        event.preventDefault();
                                        event.currentTarget.select();
                                    }
                                }}
                                className="w-full resize-none rounded-xl bg-ios-light-surface-2 px-3 py-2 text-[16px] leading-snug text-black outline-none ring-1 ring-black/10 dark:bg-ios-dark-surface-2 dark:text-white dark:ring-white/15"
                            />
                        </div>
                    )}
                    buttons={(
                        <DialogButton strong onClick={closeFallbackInviteDialog}>
                            {t("table.action.done")}
                        </DialogButton>
                    )}
                    onBackdropClick={closeFallbackInviteDialog}
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
