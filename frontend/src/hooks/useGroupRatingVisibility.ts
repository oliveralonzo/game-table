import { useEffect, useState } from "react";
import { useTableSocket } from "game-table/context/TableSocket";

type Visibility = { group_id: string; show_ratings: boolean };

export function useGroupRatingVisibility(groupId?: string | null) {
    const { emit, on, off, groupConnectionVersion } = useTableSocket();
    const [visibility, setVisibility] = useState<Visibility | null>(null);
    useEffect(() => {
        if (!groupId) return;
        let current = true;
        let changed = false;
        const update = (value: Visibility) => {
            if (value.group_id !== groupId) return;
            changed = true;
            setVisibility(value);
        };
        on("domino:group_rating_visibility_changed", update);
        emit("domino:group_rating_visibility", { group_id: groupId }, (value?: { show_ratings?: boolean }) => {
            if (current && !changed) setVisibility({ group_id: groupId, show_ratings: value?.show_ratings === true });
        });
        return () => {
            current = false;
            off("domino:group_rating_visibility_changed", update);
        };
    }, [groupId, emit, on, off, groupConnectionVersion]);
    return !groupId || (visibility?.group_id === groupId && visibility.show_ratings);
}
