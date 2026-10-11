import type { TableView } from "game-table/types/table";

export function canEndTableGame(table: TableView | null | undefined, memberId: string | null | undefined): boolean {
    if (!table?.active_game_id || !memberId) return false;
    if (table.finished_game_close) {
        return table.finished_game_close.reviewed && !table.finished_game_close.reviewing && table.seats.includes(memberId);
    }
    return table.group_id
        ? !!table.group_member_ids?.includes(memberId) && table.seats.includes(memberId)
        : table.host_id === memberId;
}
