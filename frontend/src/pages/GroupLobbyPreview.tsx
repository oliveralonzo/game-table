import { useGroupRatingVisibility } from "game-table/hooks/useGroupRatingVisibility";
import GroupBackButton from "game-table/components/GroupBackButton";
import type { FrontendGamePlugin } from "game-table/gamePlugin";
import type { NicknameChangeHandler } from "game-table/components/NicknameSettings";
import type { GroupMember, GroupTable } from "game-table/context/TableSocket";
import { useActivity } from "game-table/hooks/useActivity";
import { useRoomChat } from "game-table/hooks/useRoomChat";
import type { TableTool } from "game-table/components/TableFrame";
import { useGroupsCache } from "game-table/context/GroupsCacheContext";
import { useGroupActivity } from "game-table/hooks/useGroupActivity";
import { useEffect, useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Glass, Segmented, SegmentedButton } from "konsta/react";
import { LogOut } from "lucide-react";
import GroupStatsPreview, { GroupStatsOverview, groupMonthLabel } from "game-table/components/GroupStatsPreview";
import GroupTournaments from "game-table/components/GroupTournaments";
import GroupSettingsPanel from "game-table/components/GroupSettingsPanel";
import TableEventNotice from "game-table/components/TableEventNotice";
import TableCards from "game-table/components/TableCards";
import TableFrame from "game-table/components/TableFrame";
import { buildInitialLabelsById } from "game-table/utils/playerInitialLabels";
import LobbyRoster, { type RosterPerson } from "game-table/components/LobbyRoster";
import { useAuthSession } from "game-table/context/AuthSessionContext";
import { useTableSocket } from "game-table/context/TableSocket";
import Chat from "game-table/components/Chat";
export default function GroupLobbyPreview({ gamePlugin, displayName, onDisplayNameChange, groupId, groupName, groupMembers, tables, closingTables, closingPending, onTableClosed, onCreateTable, onEnterTable, onRemoveTable, creating, tableError }: {
    gamePlugin: FrontendGamePlugin; displayName: string; onDisplayNameChange: NicknameChangeHandler;
    groupId: string; groupName: string; groupMembers: GroupMember[]; tables: GroupTable[];
    closingTables: Record<string, GroupTable>; closingPending: string[]; onTableClosed: (code: string) => void;
    onCreateTable: () => void; onEnterTable: (code: string) => void; onRemoveTable: (table: GroupTable) => void;
    creating: boolean; tableError: string | null;
}) {
    const { groupPublicId, tournamentId } = useParams();
    const groupUrl = `/g/${encodeURIComponent(groupPublicId ?? "")}`;
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const returnToGame = typeof location.state?.returnToGame === "string"
        && /^\/[^/]+$/.test(location.state.returnToGame)
        ? location.state.returnToGame : null;
    const [playMode, setPlayMode] = useState<"league" | "tournaments">(location.state?.groupPlayMode === "tournaments" || tournamentId ? "tournaments" : "league");
    const [openedTournaments, setOpenedTournaments] = useState(false);
    const isTournamentContext = !!tournamentId && tournamentId !== "new";
    const [tournamentSettings, setTournamentSettings] = useState<{ id: string; rules: unknown } | null>(null);
    const [groupSettings, setGroupSettings] = useState<{ id: string; rules: unknown } | null>(null);
    const { getAuthToken } = useAuthSession();
    const { emit, groupConnectionVersion } = useTableSocket();
    useEffect(() => {
        if (isTournamentContext || !gamePlugin.features.settings || !gamePlugin.settingsIndicator) return;
        let current = true;
        getAuthToken().then(token => {
            if (!current || !token) return;
            emit("group:settings", { token, group_id: groupId }, (response?: { rules?: unknown; error?: string }) => {
                if (current && response && !response.error) setGroupSettings({ id: groupId, rules: response.rules });
            });
        }).catch(() => {});
        return () => { current = false; };
    }, [emit, getAuthToken, groupConnectionVersion, groupId, gamePlugin, isTournamentContext]);
    const scopedSettings = isTournamentContext
        ? tournamentSettings?.id === tournamentId ? tournamentSettings : null
        : groupSettings?.id === groupId ? groupSettings : null;
    const SettingsPanel = gamePlugin.SettingsPanel;
    const showingStats = location.pathname.endsWith("/activity");
    const activity = useGroupActivity(groupId, "current", 1, !showingStats);
    const self = groupMembers.find(member => member.is_self);
    useGroupRatingVisibility(groupId);
    const room = `group:${groupId}:${self?.account_id ?? ""}`;
    const [activeTool, setActiveTool] = useState<TableTool | null>(null);
    const { messages, sendMessage } = useActivity(undefined, undefined, self?.account_id, groupId);
    const { chatDraft, setChatDraft, chatUnreadCount, handleSendChat } = useRoomChat({
        roomKey: room, selfId: self?.account_id, messages, sendMessage, activeTool,
        ignoreSelfAliasForUnread: false,
    });
    const { presence } = useGroupsCache();
    const activeMembers = presence?.group_id === groupId ? presence.active_members : [];
    const activeById = new Map(activeMembers.map(member => [member.account_id, member]));
    const groupBadges = buildInitialLabelsById(groupMembers.map(member => ({ id: member.account_id, name: member.name, badge_label: member.badge_label })));
    const groupRoster: RosterPerson[] = groupMembers.map(member => {
        const active = activeById.get(member.account_id);
        return {
            id: member.account_id, name: member.name, initialLabel: groupBadges[member.account_id]?.label, accountUsername: member.username,
            isSelf: member.is_self, isHost: false, hasSeat: false,
            presence: active ? { active: true, label: active.table_code
                ? t("groups.preview.table", { number: active.table_code })
                : t("groups.preview.active") } : undefined,
        };
    });
    const byNickname = new Intl.Collator(i18n.language, { sensitivity: "base", numeric: true });
    const sortedRoster = groupRoster.sort((a, b) => byNickname.compare(a.name, b.name)
        || byNickname.compare(a.accountUsername ?? "", b.accountUsername ?? "") || a.id.localeCompare(b.id));
    const activeRoster = sortedRoster.filter(member => member.presence?.active);
    const offlineRoster = sortedRoster.filter(member => !member.presence?.active);
    const memberCount = activeRoster.length;
    // Keep a snapshot through the exit animation even if the server list has already removed it.
    const visibleTables = [...tables];
    for (const table of Object.values(closingTables)) {
        if (table.group_id === groupId && !visibleTables.some(item => item.table_code === table.table_code)) {
            visibleTables.push(table);
        }
    }
    return <TableFrame fixedChrome key={isTournamentContext ? `${room}:tournament:${tournamentId}` : room} memberCount={memberCount}
        settingsIndicator={scopedSettings && gamePlugin.features.settings ? gamePlugin.settingsIndicator?.(scopedSettings.rules, i18n.language) : undefined}
        chatUnreadCount={chatUnreadCount} onActiveToolChange={setActiveTool} reactions={[]} onEmitReaction={() => {}}
        onRemoveReaction={() => {}} showReactions={false} mainClassName="w-full max-w-md pb-24"
        lifecycleAction={<Glass highlight={false} className="h-11 rounded-full">
            <Button clear rounded inline className="h-11 w-11 !px-0 !text-black/65 dark:!text-white/70"
                aria-label={t("groups.preview.exit")}
                onClick={() => navigate("/", { state: { homeTab: "groups" } })}><LogOut size={20} /></Button>
        </Glass>}
        renderToolContent={(tool) => tool === "people" ? <section className="min-h-0 overflow-y-auto pb-3">
            <p className="mb-3 px-safe-4 text-sm text-black/55 dark:text-white/55">{t("groups.members", { count: groupMembers.length })}</p>
            {activeRoster.length > 0 && <LobbyRoster groupId={groupId} people={activeRoster} title={t("groups.roster.active")} flush showSeatLocation={false} />}
            {offlineRoster.length > 0 && <LobbyRoster groupId={groupId} people={offlineRoster} title={t("groups.roster.offline")} flush
                className={activeRoster.length ? "mt-3" : ""} showSeatLocation={false} />}
        </section> : tool === "chat" ? <Chat messages={messages} selfId={self?.account_id ?? ""}
            displayName={self?.name ?? displayName}
            memberNamesById={Object.fromEntries(groupMembers.map(member => [member.account_id, member.name]))}
            chatDraft={chatDraft} setChatDraft={setChatDraft} onSendChat={handleSendChat} /> : isTournamentContext ? (
                tournamentSettings && tournamentSettings.id === tournamentId && <SettingsPanel
                    value={gamePlugin.resolveSettings(tournamentSettings.rules)} readOnly isFourPlayer seatCount={4}
                    gameOnly collapsible={false} flush title={t("groups.tournaments.games")}
                    sections={{ profile: false, display: false, language: false }} />
            ) : <GroupSettingsPanel onRulesChange={rules => setGroupSettings({ id: groupId, rules })} groupId={groupId} gamePlugin={gamePlugin} displayName={displayName} onDisplayNameChange={onDisplayNameChange} />}
    >
        {showingStats ? <GroupStatsPreview backToTable={!!returnToGame} groupId={groupId} groupName={groupName} onBack={() => navigate(returnToGame ?? groupUrl)} /> : <>
        {isTournamentContext && <GroupBackButton onClick={() => navigate(groupUrl, { state: { groupPlayMode: "tournaments" } })}>
            {groupName}
        </GroupBackButton>}
        {!isTournamentContext && <h1 className="mb-1 px-1 text-[34px] font-bold leading-tight">{groupName}</h1>}
        {(!tournamentId || tournamentId === "new") && <Segmented strong rounded className="my-5 w-full" aria-label={t("groups.playMode.label")}>
            <SegmentedButton type="button" active={playMode === "league"} aria-pressed={playMode === "league"} onClick={() => setPlayMode("league")}>{t("groups.playMode.league")}</SegmentedButton>
            <SegmentedButton type="button" active={playMode === "tournaments"} aria-pressed={playMode === "tournaments"} onClick={() => { setOpenedTournaments(true); setPlayMode("tournaments"); }}>{t("groups.playMode.tournaments")}</SegmentedButton>
        </Segmented>}
        {!tournamentId && playMode === "league" ? <>
        <p className="mb-5 px-1 text-black/55 dark:text-white/55">{groupMonthLabel(i18n.language, activity.data?.current_season)}</p>
            <GroupStatsOverview compact data={activity.data} onOpen={() => navigate(`${groupUrl}/activity`)} />
            {activity.error && <p role="alert" className="mb-3 px-1 text-sm text-black/55 dark:text-white/55">{activity.error} <Button inline clear onClick={activity.retry}>{t("groups.list.retry")}</Button></p>}
            <h2 className="mb-3 px-1 text-[22px] font-bold">{t("navigation.tables")}</h2>
            {tableError && <p role="alert" className="mb-3 px-1 text-sm text-black/55 dark:text-white/55">{tableError}</p>}
            <TableCards createLabel={t("groupTables.create")} tables={visibleTables.map(table => ({ ...table, group_id: groupId, group_name: groupName }))} getKey={table => table.table_code}
                isPending={table => closingPending.includes(table.table_code)}
                isClosing={table => !!closingTables[table.table_code] && !closingPending.includes(table.table_code)} onClosed={table => onTableClosed(table.table_code)}
                onEnter={table => onEnterTable(table.table_code)} onRemove={onRemoveTable} canRemove={table => table.members.length === 0}
                removeLabel={t("table.action.closeTable")} creating={creating} onCreate={onCreateTable}
                className="sm:grid-cols-2 sm:gap-4" />
            <div className="flex justify-center"><TableEventNotice groupId={groupId} /></div>
        </> : null}
        {(tournamentId || playMode === "tournaments" || openedTournaments) && <div hidden={!tournamentId && playMode !== "tournaments"}>
            <GroupTournaments groupMembers={groupMembers} groupName={groupName} groupId={groupId} groupUrl={groupUrl} gamePlugin={gamePlugin} onTournamentRules={setTournamentSettings} />
        </div>}
        </>}
    </TableFrame>;
}
