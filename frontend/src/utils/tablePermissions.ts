import type { TableView } from "game-table/types/table";

export function canEndTableGame(table: TableView | null | undefined, memberId: string | null | undefined): boolean {
    if (!table?.active_game_id || !memberId) return false;
    return table.group_id
        ? !!table.group_member_ids?.includes(memberId) && table.seats.includes(memberId)
        : table.host_id === memberId;
}
