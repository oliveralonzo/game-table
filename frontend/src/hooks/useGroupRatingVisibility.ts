import { useEffect } from "react";
import { useTableSocket } from "game-table/context/TableSocket";

export function useGroupRatingVisibility(groupId?: string | null) {
    const { emit, groupRatingVisibility, rememberGroupRatingVisibility, groupConnectionVersion } = useTableSocket();
    const visible = groupId ? groupRatingVisibility[groupId] : true;
    useEffect(() => {
        if (!groupId || visible !== undefined) return;
        let current = true;
        emit("domino:group_rating_visibility", { group_id: groupId }, (value?: { show_ratings?: boolean }) => {
            if (current && typeof value?.show_ratings === "boolean") {
                rememberGroupRatingVisibility(groupId, value.show_ratings);
            }
        });
        return () => { current = false; };
    }, [groupId, visible, emit, rememberGroupRatingVisibility, groupConnectionVersion]);
    return visible === true;
}
