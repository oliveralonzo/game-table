// src/utils/activityViewUtils.ts

import type { ReactionEvent, ViewerReactionView } from "game-table/types/activity";
import type { TableView } from "game-table/types/table";

export function attachSeatReactions<T extends { memberId?: string | null }>(
    seats: T[],
    reactionsBySender: Record<string, ReactionEvent>
): Array<T & { reaction?: ReactionEvent }> {
    return seats.map(seat => ({
        ...seat,
        reaction: seat.memberId ? reactionsBySender[seat.memberId] : undefined,
    }));
}

export function buildViewerReactions(
    tableView: TableView | null,
    reactions: ReactionEvent[],
    options: {
        includeSeated?: boolean;
        initialLabelsById?: Record<string, { label: string }>;
    } = {}
): ViewerReactionView[] {
    const seatedMemberIds = new Set(
        tableView?.seats.filter(Boolean) ?? []
    );

    return reactions
        .filter(reaction => options.includeSeated || !seatedMemberIds.has(reaction.sender_id))
        .map(reaction => ({
            id: reaction.id,
            sender_id: reaction.sender_id,
            name: tableView?.members[reaction.sender_id]?.name ?? "Viewer",
            initialLabel: options.initialLabelsById?.[reaction.sender_id]?.label,
            value: reaction.value,
            ts: reaction.ts,
            duration_ms: reaction.duration_ms,
            expired: reaction.expired,
        }));
}
