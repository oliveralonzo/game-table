import { useEffect, useMemo, useState } from "react";

import { type RosterAction, type RosterPerson } from "game-table/components/LobbyRoster";
import { buildViewerReactions } from "game-table/utils/activityViewUtils";
import { buildInitialLabelsById } from "game-table/utils/playerInitialLabels";
import type { ReactionEvent } from "game-table/types/activity";
import type { TableView } from "game-table/types/table";
import { useTableSocket } from "game-table/context/TableSocket";

type UseTableRoomPeopleArgs = {
    table?: TableView | null;
    selfId?: string | null;
    isHost: boolean;
    selfIsSeated: boolean;
    t: (key: string, options?: Record<string, unknown>) => string;
    reactions: ReactionEvent[];
    unassignSeat: (seatIndex: number, onError?: (message: string, code?: string) => void) => void;
    removeMember: (memberId: string) => void;
    grantHandView: (viewerId: string) => void;
    revokeHandView: (viewerId: string) => void;
};

const EMPTY_HAND_VIEW_GRANTS: Record<string, string[]> = {};

export function useTableRoomPeople({
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
}: UseTableRoomPeopleArgs) {
    const [unseatNow, setUnseatNow] = useState(Date.now() / 1000);
    useEffect(() => {
        if (!table?.unseat || (!Object.keys(table.unseat.cooldowns).length && !Object.keys(table.unseat.confirmations).length)) return;
        const timer = window.setInterval(() => setUnseatNow(Date.now() / 1000), 250);
        return () => window.clearInterval(timer);
    }, [table?.unseat]);
    const { listAccountStats, on, off } = useTableSocket();
    const [statsRevision, setStatsRevision] = useState<string | null>(null);
    const [statsByAccountId, setStatsByAccountId] = useState<Record<string, {
        winPercentage: number;
        winStreak: number;
    }>>({});
    const [pendingHandViewActions, setPendingHandViewActions] =
        useState<Record<string, "share" | "stop">>({});

    const handViewGrants = table?.hand_view_grants ?? EMPTY_HAND_VIEW_GRANTS;

    useEffect(() => {
        if (!selfId) return;

        setPendingHandViewActions((current) => {
            const next = { ...current };
            const sharedViewers = handViewGrants[selfId] ?? [];

            Object.entries(current).forEach(([viewerId, pendingAction]) => {
                const isShared = sharedViewers.includes(viewerId);
                if (
                    (pendingAction === "share" && isShared) ||
                    (pendingAction === "stop" && !isShared)
                ) {
                    delete next[viewerId];
                }
            });

            return next;
        });
    }, [handViewGrants, selfId]);

    const members = table?.members ?? {};
    const seats = table?.seats ?? [];
    const seatCount = table?.seat_count ?? seats.length;
    const accountIds = useMemo(() => Array.from(new Set(
        Object.values(table?.members ?? {})
            .map((member) => member.account_id)
            .filter((accountId): accountId is string => Boolean(accountId))
    )).sort(), [table?.members]);
    const accountIdsKey = accountIds.join("\u0000");

    useEffect(() => {
        const refreshStats = (event: { table_code: string; game_id: string }) => {
            if (event.table_code !== table?.table_code) return;
            // Sync can announce the same completed game again; refresh only once.
            setStatsRevision(`${event.table_code}:${event.game_id}`);
        };
        on("table:stats_updated", refreshStats);
        return () => off("table:stats_updated", refreshStats);
    }, [on, off, table?.table_code]);

    useEffect(() => {
        if (!accountIdsKey) {
            setStatsByAccountId({});
            return;
        }

        let isCurrent = true;
        listAccountStats(accountIdsKey.split("\u0000"), (response) => {
            if (!isCurrent || "error" in response) return;
            setStatsByAccountId(Object.fromEntries(
                response.stats.map((entry) => [entry.account_id, {
                    winPercentage: entry.win_percentage,
                    winStreak: entry.win_streak,
                }])
            ));
        });

        return () => {
            isCurrent = false;
        };
    }, [accountIdsKey, listAccountStats, statsRevision]);
    const memberInitialLabels = buildInitialLabelsById(Object.entries(members).map(([id, member]) => ({
        id,
        name: member.name,
        badge_label: member.badge_label,
    })));
    const seatInitialLabels = seats.slice(0, seatCount).map((memberId) => (
        memberId ? memberInitialLabels[memberId]?.label ?? null : null
    ));

    const rosterHandViewDetails = (personId: string) => {
        const handViewerCount = handViewGrants[personId]?.length ?? 0;
        const viewingHandNames = Object.entries(handViewGrants)
            .filter(([, viewerIds]) => viewerIds.includes(personId))
            .map(([playerId]) => members[playerId]?.name)
            .filter((name): name is string => Boolean(name));

        const viewingHandPlayers = Object.entries(handViewGrants)
            .filter(([playerId, viewerIds]) => !!members[playerId] && viewerIds.includes(personId))
            .map(([playerId]) => ({
                id: playerId,
                name: members[playerId].name,
                initialLabel: memberInitialLabels[playerId]?.label,
                isHost: playerId === table?.host_id,
                hasSeat: seats.includes(playerId),
                isSelf: playerId === selfId,
            }));
        return { handViewerCount, viewingHandNames, viewingHandPlayers };
    };

    const roster = Object.entries(members)
        .map(([id, member]) => {
            const seatIndex = seats.indexOf(id);

            return {
                id,
                name: member.name,
        badge_label: member.badge_label,
                accountUsername: member.account_username,
                winPercentage: member.account_id
                    ? statsByAccountId[member.account_id]?.winPercentage
                    : undefined,
                winStreak: member.account_id
                    ? statsByAccountId[member.account_id]?.winStreak
                    : undefined,
                isHost: id === table?.host_id,
                hasSeat: seatIndex >= 0,
                seatIndex: seatIndex >= 0 ? seatIndex : undefined,
                initialLabel: memberInitialLabels[id]?.label,
                isSelf: id === selfId,
                ...rosterHandViewDetails(id),
            };
        });
    const seatedRoster = roster.filter((person) => person.hasSeat);
    const queue = table?.queue ?? [];
    const queuedRoster = queue.flatMap((id, index) => {
        const person = roster.find((person) => person.id === id && !person.hasSeat);
        return person ? [{ ...person, queuePosition: index + 1 }] : [];
    });
    const viewerRoster = roster.filter((person) => !person.hasSeat && !queue.includes(person.id));
    const viewerReactions = buildViewerReactions(table ?? null, reactions, {
        includeSeated: true,
        initialLabelsById: memberInitialLabels,
    });
    const handGrantsForSelf = selfId ? handViewGrants[selfId] ?? [] : [];

    const getRosterActions = (person: RosterPerson): RosterAction[] => {
        const actions: RosterAction[] = [];

        if (selfIsSeated && (isHost || (!!selfId && table?.group_member_ids?.includes(selfId))) && person.hasSeat && typeof person.seatIndex === "number") {
            const deadline = !person.isSelf && table?.group_id
                ? table.unseat?.confirmations[person.id]?.deadline ?? table.unseat?.cooldowns[person.id] ?? 0
                : 0;
            const remaining = Math.max(0, Math.ceil(deadline - unseatNow));
            const confirming = !person.isSelf && !!table?.group_id && !!table.unseat?.confirmations[person.id];
            actions.push({
                id: "unseat",
                disabled: confirming || remaining > 0,
                label: remaining > 0
                    ? t("table.unseatConfirmation.disabledAction", { action: t("table.action.unseat"), count: remaining })
                    : t("table.action.unseat"),
                onClick: () => unassignSeat(person.seatIndex!, (message, code) => {
                    if (code !== "UNSEAT_COOLDOWN") alert(message);
                }),
            });
        }

        if (isHost && !person.isSelf) {
            actions.push({
                id: "remove",
                label: t("table.action.removeFromTable"),
                destructive: true,
                onClick: () => removeMember(person.id),
            });
        }

        if (selfIsSeated && table?.has_game && !person.hasSeat && !person.isSelf) {
            const isShared = handGrantsForSelf.includes(person.id);
            const pendingAction = pendingHandViewActions[person.id];
            const label = isShared
                ? t("table.action.stopSharingHand")
                : t("table.action.shareHand");

            actions.push({
                id: "hand-view",
                label,
                disabled: !!pendingAction,
                keepOpen: true,
                pending: !!pendingAction,
                onClick: () => {
                    if (isShared) {
                        setPendingHandViewActions((current) => ({
                            ...current,
                            [person.id]: "stop",
                        }));
                        revokeHandView(person.id);
                        return;
                    }

                    setPendingHandViewActions((current) => ({
                        ...current,
                        [person.id]: "share",
                    }));
                    grantHandView(person.id);
                },
            });
        }

        return actions;
    };

    return {
        memberInitialLabels,
        seatInitialLabels,
        seatedRoster,
        viewerRoster,
        queuedRoster,
        viewerReactions,
        getRosterActions,
    };
}
