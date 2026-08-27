/**
 * TableScreen.tsx
 * Author: Oliver Alonzo
 * Supported by ChatGPT (GPT-5)
 * Date: 2026-02-23
 * Version: 0.4
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useTable } from "game-table/context/TableState";
import { useTableSocket } from "game-table/context/TableSocket";
import SeatsPanel from "game-table/components/SeatsPanel";
import TableFrame, {
    type TableTool,
    type TableToolRenderContext,
} from "game-table/components/TableFrame";
import TableFrameTools from "game-table/components/TableFrameTools";
import { useActivity } from "game-table/hooks/useActivity";
import { useTableChat } from "game-table/hooks/useTableChat";
import { useTableInvite } from "game-table/hooks/useTableInvite";
import { useTableRoomPeople } from "game-table/hooks/useTableRoomPeople";
import { useMemberNameCache } from "game-table/hooks/useMemberNameCache";
import { glassWithoutLightInsetShadow } from "game-table/styles/glass";
import type { FrontendGamePlugin } from "game-table/gamePlugin";
import PlatformSettingsPanel from "game-table/components/PlatformSettingsPanel";
import {
    Button,
    Glass,
} from "konsta/react";

type Props = {
    gamePlugin: FrontendGamePlugin;
    onOpenGame: () => void;
};

export default function TableScreen({ gamePlugin, onOpenGame }: Props) {
    const { t } = useTranslation();
    const { state } = useTable();
    const {
        assignSeat,
        grantHandView,
        removeMember,
        revokeHandView,
        unassignSeat,
        addSeat,
        removeSeat,
        startGameForTable,
        updateGameSettings,
        updateName,
    } = useTableSocket();
    const tableCodeForActivity = state.tableView?.table_code;
    const selfMemberIdForActivity = state.selfMemberId;
    const memberNamesById = useMemberNameCache(
        tableCodeForActivity,
        state.tableView?.members
    );
    const {
        reactions,
        emitReaction,
        removeReaction,
        messages,
        sendMessage,
    } = useActivity(
        tableCodeForActivity,
        tableCodeForActivity,
        selfMemberIdForActivity
    );
    const [activeTableTool, setActiveTableTool] = useState<TableTool | null>(null);
    const [settingsNested, setSettingsNested] = useState(false);
    const SettingsPanel = gamePlugin.SettingsPanel;

    const table = state.tableView;
    const selfId = state.selfMemberId;
    const isHost = table !== null && selfId !== null && table.host_id === selfId;
    const seatCount = table?.seat_count ?? 0;
    const isFourPlayer = seatCount === 4;
    const displayName = table && selfId ? table.members[selfId]?.name ?? "" : "";
    const lobbyConfig = gamePlugin.resolveSettings(table?.pending_rules);

    const seats = table?.seats.map((memberId: string | null) => ({
        name: memberId ? table.members[memberId]?.name ?? null : null,
        ready: false,
    })) ?? [];
    const playerIndexRaw = table && selfId
        ? table.seats.findIndex((memberId) => memberId === selfId)
        : -1;
    const playerIndex = playerIndexRaw >= 0 ? playerIndexRaw : null;
    const selfIsSeated = playerIndex !== null;
    const {
        memberInitialLabels,
        seatInitialLabels,
        seatedRoster,
        viewerRoster,
        viewerReactions,
        getRosterActions,
    } = useTableRoomPeople({
        table,
        selfId,
        isHost,
        selfIsSeated,
        t,
        reactions,
        unassignSeat,
        removeMember,
        grantHandView,
        revokeHandView,
    });
    const memberCount = seatedRoster.length + viewerRoster.length;
    const {
        inviteCopied,
        fallbackInviteUrl,
        handleInvite,
        closeInviteFallback,
    } = useTableInvite({
        tableCode: table?.table_code,
        t,
    });
    const {
        chatDraft,
        setChatDraft,
        chatUnreadCount,
        handleSendChat,
    } = useTableChat({
        tableCode: table?.table_code,
        selfId,
        messages,
        sendMessage,
        activeTool: activeTableTool,
        ignoreSelfAliasForUnread: false,
    });

    if (!table) {
        throw new Error("TableScreen requires tableView.");
    }

    if (!selfId) {
        return null;
    }

    const canStartGame =
        isHost &&
        table.state === "open" &&
        table.seats.every((seat) => seat !== null);


    const renderToolContent = (
        tool: TableTool,
        context: TableToolRenderContext
    ) => (
        <TableFrameTools
            tool={tool}
            context={context}
            seatedRoster={seatedRoster}
            viewerRoster={viewerRoster}
            seatCount={seatCount}
            showSeatLocation={false}
            showHandViewStatus={false}
            getRosterActions={getRosterActions}
            tableCode={table.table_code}
            inviteCopied={inviteCopied}
            fallbackInviteUrl={fallbackInviteUrl}
            onInvite={handleInvite}
            onCloseInviteFallback={closeInviteFallback}
            renderSettings={() => (
                <PlatformSettingsPanel
                    displayName={displayName}
                    onDisplayNameChange={updateName}
                    routed
                    gameSettingsNested={settingsNested}
                    gameSettings={gamePlugin.features.settings ? (
                        <SettingsPanel
                            value={lobbyConfig}
                            onChange={(next: unknown) => updateGameSettings(next)}
                            readOnly={!isHost || table.state !== "open"}
                            isFourPlayer={isFourPlayer}
                            seatCount={seatCount}
                            onAddSeat={addSeat}
                            onRemoveSeat={removeSeat}
                            title={t("table.label.game")}
                            showHeading={false}
                            displayInitialLabel={memberInitialLabels[selfId]?.label}
                            flush
                            collapsible={false}
                            embeddedGamePane
                            onNestedNavigationChange={setSettingsNested}
                            sections={{ profile: false, language: false }}
                        />
                    ) : undefined}
                />
            )}
            messages={messages}
            selfId={selfId}
            displayName={displayName}
            memberNamesById={memberNamesById}
            chatDraft={chatDraft}
            setChatDraft={setChatDraft}
            onSendChat={handleSendChat}
        />
    );

    return (
        <TableFrame
            memberCount={memberCount}
            chatUnreadCount={chatUnreadCount}
            onActiveToolChange={setActiveTableTool}
            renderToolContent={renderToolContent}
            reactions={viewerReactions}
            onEmitReaction={emitReaction}
            onRemoveReaction={removeReaction}
            accountsEnabled={gamePlugin.features.accounts}
        >
            <div className="mb-3 px-1">
                <h1 className="text-[34px] font-bold leading-tight tracking-normal text-black dark:text-white">
                    {t("table.label.seats")}
                </h1>
            </div>

            <div className="min-w-0">
                <Glass
                    highlight={false}
                    colors={{
                        shadowIos: glassWithoutLightInsetShadow,
                    }}
                    className="aspect-square w-full rounded-[28px] p-5 sm:p-6"
                >
                    <SeatsPanel
                        seats={seats}
                        seatCount={seatCount}
                        initialLabels={seatInitialLabels}
                        playerIndex={playerIndex}
                        isHost={isHost}
                        tableState={table.state}
                        onAssignSeat={assignSeat}
                        onUnassignSeat={unassignSeat}
                        footerAction={
                            table.active_game_id ? (
                                <Button
                                    type="button"
                                    inline
                                    rounded
                                    onClick={onOpenGame}
                                    className="h-11 px-4 font-semibold"
                                >
                                    {t("table.action.openGame")}
                                </Button>
                            ) : isHost ? (
                                <Button
                                    type="button"
                                    inline
                                    rounded
                                    disabled={!canStartGame}
                                    onClick={() => startGameForTable(alert, onOpenGame)}
                                    className="h-11 px-4 font-semibold"
                                >
                                    {t("table.action.startGame")}
                                </Button>
                            ) : (
                                <Button
                                    type="button"
                                    inline
                                    rounded
                                    disabled
                                    className="h-11 px-4 font-semibold"
                                >
                                    {t("table.action.waiting")}
                                </Button>
                            )
                        }
                    />
                </Glass>
            </div>
        </TableFrame>
    );
}
