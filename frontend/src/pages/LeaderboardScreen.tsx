import { useEffect, useState } from "react";
import { useTableSocket } from "game-table/context/TableSocket";
import LeaderboardContent, { LEADERBOARD_PAGE_SIZE, type LeaderboardEntry, type LeaderboardSort } from "game-table/components/LeaderboardContent";
export { LEADERBOARD_PAGE_SIZE, type LeaderboardEntry, type LeaderboardSort } from "game-table/components/LeaderboardContent";

type CachedLeaderboardPage = { entries: LeaderboardEntry[]; hasMore: boolean };
const leaderboardCache = new Map<string, CachedLeaderboardPage>();

function cacheKey(sort: LeaderboardSort, page: number) {
    return `${sort}:${page}`;
}

export function getCachedLeaderboardPage(sort: LeaderboardSort, page: number) {
    return leaderboardCache.get(cacheKey(sort, page));
}

export function cacheLeaderboardPage(
    sort: LeaderboardSort,
    page: number,
    entries: LeaderboardEntry[],
    hasMore: boolean,
) {
    leaderboardCache.set(cacheKey(sort, page), { entries, hasMore });
}

export default function LeaderboardScreen({ onBack }: { onBack: () => void }) {
    const { listLeaderboard } = useTableSocket();
    const [sort, setSort] = useState<LeaderboardSort>("win_percentage");
    const [page, setPage] = useState(1);
    const initialPage = getCachedLeaderboardPage("win_percentage", 1);
    const [entries, setEntries] = useState<LeaderboardEntry[]>(
        () => initialPage?.entries ?? []
    );
    const [hasMore, setHasMore] = useState(() => initialPage?.hasMore ?? false);
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<string | null>(null);

    useEffect(() => {
        let isCurrent = true;
        const cached = getCachedLeaderboardPage(sort, page);
        if (cached) {
            setEntries(cached.entries);
            setHasMore(cached.hasMore);
        }
        setIsLoading(true);
        setStatus(null);

        listLeaderboard(sort, page, LEADERBOARD_PAGE_SIZE, (response) => {
            if (!isCurrent) return;

            setIsLoading(false);
            if ("error" in response) {
                setStatus(response.message);
                return;
            }

            setEntries(response.leaderboard);
            setHasMore(response.has_more);
            cacheLeaderboardPage(sort, page, response.leaderboard, response.has_more);
        });

        return () => {
            isCurrent = false;
        };
    }, [listLeaderboard, page, sort]);

    function handleSortChange(nextSort: LeaderboardSort) {
        setSort(nextSort);
        setPage(1);
    }

    return <LeaderboardContent entries={entries} sort={sort} page={page} hasMore={hasMore}
        isLoading={isLoading} status={status} onBack={onBack} onSortChange={handleSortChange}
        onPrevious={() => setPage(current => Math.max(1, current - 1))}
        onNext={() => setPage(current => current + 1)} />;
}
