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
    unassignSeat: (seatIndex: number) => void;
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
    const { listAccountStats } = useTableSocket();
    const [winPercentagesByAccountId, setWinPercentagesByAccountId] =
        useState<Record<string, number>>({});
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
        if (!accountIdsKey) {
            setWinPercentagesByAccountId({});
            return;
        }

        let isCurrent = true;
        setWinPercentagesByAccountId({});
        listAccountStats(accountIdsKey.split("\u0000"), (response) => {
            if (!isCurrent || "error" in response) return;
            setWinPercentagesByAccountId(Object.fromEntries(
                response.stats.map((entry) => [entry.account_id, entry.win_percentage])
            ));
        });

        return () => {
            isCurrent = false;
        };
    }, [accountIdsKey, listAccountStats]);
    const memberInitialLabels = buildInitialLabelsById(Object.entries(members).map(([id, member]) => ({
        id,
        name: member.name,
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

        return { handViewerCount, viewingHandNames };
    };

    const roster = Object.entries(members)
        .map(([id, member]) => {
            const seatIndex = seats.indexOf(id);

            return {
                id,
                name: member.name,
                accountUsername: member.account_username,
                winPercentage: member.account_id
                    ? winPercentagesByAccountId[member.account_id]
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
    const viewerRoster = roster.filter((person) => !person.hasSeat);
    const viewerReactions = buildViewerReactions(table ?? null, reactions, {
        includeSeated: true,
        initialLabelsById: memberInitialLabels,
    });
    const handGrantsForSelf = selfId ? handViewGrants[selfId] ?? [] : [];

    const getRosterActions = (person: RosterPerson): RosterAction[] => {
        const actions: RosterAction[] = [];

        if (isHost && person.hasSeat && typeof person.seatIndex === "number") {
            actions.push({
                id: "unseat",
                label: t("table.action.unseat"),
                onClick: () => unassignSeat(person.seatIndex!),
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
        viewerReactions,
        getRosterActions,
    };
}
