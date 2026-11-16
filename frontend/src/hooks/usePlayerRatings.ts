import type { RatingProfile } from "game-table/components/RatingDetailsCard";
import { useEffect, useState } from "react";
import { useTableSocket } from "game-table/context/TableSocket";

// Keep the last successful response available when a roster unmounts.
const cachedRatings = new Map<string, RatingProfile | null>();

export function usePlayerRatings(usernames: string[], showRatings: boolean) {
    const { emit } = useTableSocket();
    const [refreshed, setRefreshed] = useState<Record<string, RatingProfile | null>>({});
    const usernameKey = JSON.stringify([...new Set(usernames)].sort());
    useEffect(() => {
        if (!showRatings) return;
        const usernames: string[] = JSON.parse(usernameKey);
        let current = true;
        setRefreshed({});
        for (let offset = 0; offset < usernames.length; offset += 100) {
            const batch = usernames.slice(offset, offset + 100);
            emit("domino:rating_profiles", { usernames: batch },
                (result: { profiles?: Record<string, RatingProfile> }) => {
                    if (!result?.profiles) return;
                    const received = Object.fromEntries(batch.map(username => {
                        const profile = result.profiles?.[username] ?? null;
                        cachedRatings.set(username, profile);
                        return [username, profile];
                    }));
                    if (current) setRefreshed(previous => ({ ...previous, ...received }));
                });
        }
        return () => { current = false; };
    }, [emit, usernameKey, showRatings]);

    if (!showRatings) return {};
    return Object.fromEntries(usernames.flatMap(username => {
        const fresh = Object.hasOwn(refreshed, username);
        const profile = fresh ? refreshed[username] : cachedRatings.get(username) ?? null;
        return profile ? [[username, { ...profile, refreshing: !fresh }] as const] : [];
    }));
}
