const TABLE_SLOTS_BY_PLAYER_COUNT: Record<number, number[]> = {
    1: [0],
    2: [0, 2],
    3: [0, 1, 2],
    4: [0, 1, 2, 3],
};

export type RelativeSeatOffset = 0 | 1 | 2 | 3;

export function getRelativeSeatOffset(
    playerCount: number,
    perspectiveSeat: number,
    targetSeat: number
): RelativeSeatOffset | null {
    const tableSlots = TABLE_SLOTS_BY_PLAYER_COUNT[playerCount];
    const perspectiveSlot = tableSlots?.[perspectiveSeat];
    const targetSlot = tableSlots?.[targetSeat];

    if (perspectiveSlot === undefined || targetSlot === undefined) return null;

    return ((targetSlot - perspectiveSlot + 4) % 4) as RelativeSeatOffset;
}

export function getSeatAtRelativeOffset(
    playerCount: number,
    perspectiveSeat: number,
    offset: RelativeSeatOffset
): number | null {
    for (let seat = 0; seat < playerCount; seat += 1) {
        if (getRelativeSeatOffset(playerCount, perspectiveSeat, seat) === offset) {
            return seat;
        }
    }

    return null;
}
