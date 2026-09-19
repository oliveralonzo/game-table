import { useEffect, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import {
    Button,
    Segmented,
    SegmentedButton,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
} from "konsta/react";
import { useTranslation } from "react-i18next";
import { useTableSocket } from "game-table/context/TableSocket";
import PlayerStatsTableSkeleton from "game-table/components/PlayerStatsTableSkeleton";

export type LeaderboardSort = "games_won" | "games_played" | "win_percentage";

export type LeaderboardEntry = {
    account_id: string;
    username: string;
    games_played: number;
    games_won: number;
    win_percentage: number;
};

type Props = {
    onBack: () => void;
};

export const LEADERBOARD_PAGE_SIZE = 10;
const MIN_WIN_PERCENTAGE_GAMES = 10;

type CachedLeaderboardPage = {
    entries: LeaderboardEntry[];
    hasMore: boolean;
};

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

function formatWinPercentage(value: number): string {
    return `${Math.round(value * 100)}%`;
}

export default function LeaderboardScreen({ onBack }: Props) {
    const { t } = useTranslation();
    const { listLeaderboard } = useTableSocket();
    const [sort, setSort] = useState<LeaderboardSort>("games_won");
    const [page, setPage] = useState(1);
    const initialPage = getCachedLeaderboardPage("games_won", 1);
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

    const canGoBack = page > 1 && !isLoading;
    const canGoForward = hasMore && !isLoading;
    const hasUnrankedEntries = sort === "win_percentage"
        && entries.some((entry) => entry.games_played < MIN_WIN_PERCENTAGE_GAMES);

    return (
        <div className="grid min-w-0 max-w-full gap-4 p-1 sm:w-[28rem]">
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
                <Button
                    type="button"
                    clear
                    rounded
                    aria-label={t("join.action.back")}
                    title={t("join.action.back")}
                    onClick={onBack}
                    className="!h-10 !w-10"
                >
                    <ArrowLeft size={20} strokeWidth={2.2} />
                </Button>
                <h1 className="min-w-0 truncate text-[28px] font-semibold tracking-normal text-black dark:text-white">
                    {t("leaderboard.title")}
                </h1>
            </div>

            <div className="grid w-[15rem] max-w-full gap-1">
                <span className="px-1 text-xs font-semibold uppercase tracking-wide text-black/40 dark:text-white/40">
                    {t("leaderboard.sort.label")}
                </span>
                <Segmented rounded strong className="h-9 w-full">
                    <SegmentedButton
                        type="button"
                        active={sort === "games_won"}
                        onClick={() => handleSortChange("games_won")}
                        className="px-2 text-xs font-semibold"
                    >
                        {t("leaderboard.sort.won")}
                    </SegmentedButton>
                    <SegmentedButton
                        type="button"
                        active={sort === "games_played"}
                        onClick={() => handleSortChange("games_played")}
                        className="px-2 text-xs font-semibold"
                    >
                        {t("leaderboard.sort.played")}
                    </SegmentedButton>
                    <SegmentedButton
                        type="button"
                        active={sort === "win_percentage"}
                        onClick={() => handleSortChange("win_percentage")}
                        className="px-2 text-xs font-semibold"
                    >
                        {t("leaderboard.sort.winPercentage")}
                    </SegmentedButton>
                </Segmented>
            </div>

            {isLoading && entries.length === 0 ? (
                <PlayerStatsTableSkeleton
                    personColumnLabel={t("leaderboard.column.username")}
                    rows={LEADERBOARD_PAGE_SIZE}
                />
            ) : status ? (
                <div className="rounded-2xl bg-ios-light-surface-2 px-4 py-5 text-sm font-medium text-red-600 dark:bg-ios-dark-surface-2 dark:text-red-300">
                    {status}
                </div>
            ) : entries.length === 0 ? (
                <div className="rounded-2xl bg-ios-light-surface-2 px-4 py-5 text-sm font-medium text-black/55 dark:bg-ios-dark-surface-2 dark:text-white/55">
                    {t("leaderboard.empty")}
                </div>
            ) : (
                <div
                    className={`min-w-0 max-w-full overflow-x-auto overflow-y-hidden rounded-2xl bg-ios-light-surface-2 [scrollbar-width:none] dark:bg-ios-dark-surface-2 [&::-webkit-scrollbar]:hidden ${
                        isLoading ? "opacity-70" : ""
                    }`}
                >
                    <Table style={{ width: "max-content", minWidth: "100%" }}>
                        <TableHead>
                            <TableRow header>
                                <TableCell header scope="col" className="w-px whitespace-nowrap !pl-3 !pr-3">
                                    {t("leaderboard.column.rank")}
                                </TableCell>
                                <TableCell header scope="col" className="whitespace-nowrap !pl-2 !pr-4">
                                    {t("leaderboard.column.username")}
                                </TableCell>
                                <TableCell header scope="col" className="w-px whitespace-nowrap !px-2 text-right">
                                    {t("leaderboard.column.won")}
                                </TableCell>
                                <TableCell header scope="col" className="w-px whitespace-nowrap !px-2 text-right">
                                    {t("leaderboard.column.lost")}
                                </TableCell>
                                <TableCell header scope="col" className="w-px whitespace-nowrap !px-2 text-right">
                                    {t("leaderboard.column.played")}
                                </TableCell>
                                <TableCell header scope="col" className="w-px whitespace-nowrap !pl-2 !pr-3 text-right">
                                    {t("leaderboard.column.winPercentage")}
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {entries.map((entry, index) => (
                                <TableRow key={entry.account_id}>
                                    <TableCell className="w-px whitespace-nowrap !pl-3 !pr-3 text-xs font-semibold tabular-nums text-black/45 dark:text-white/45">
                                        {sort === "win_percentage"
                                            && entry.games_played < MIN_WIN_PERCENTAGE_GAMES
                                            ? t("leaderboard.rank.notRankedShort")
                                            : (page - 1) * LEADERBOARD_PAGE_SIZE + index + 1}
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap !pl-2 !pr-4">
                                        <span className="font-semibold text-black dark:text-white">
                                            @{entry.username}
                                        </span>
                                    </TableCell>
                                    <TableCell className="w-px whitespace-nowrap !px-2 text-right font-semibold tabular-nums text-black dark:text-white">
                                        {entry.games_won}
                                    </TableCell>
                                    <TableCell className="w-px whitespace-nowrap !px-2 text-right font-semibold tabular-nums text-black/70 dark:text-white/70">
                                        {entry.games_played - entry.games_won}
                                    </TableCell>
                                    <TableCell className="w-px whitespace-nowrap !px-2 text-right font-semibold tabular-nums text-black/70 dark:text-white/70">
                                        {entry.games_played}
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap !pl-2 !pr-3 text-right font-semibold tabular-nums text-black/70 dark:text-white/70">
                                        {formatWinPercentage(entry.win_percentage)}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {Array.from({ length: LEADERBOARD_PAGE_SIZE - entries.length }).map((_, index) => (
                                <TableRow key={`empty-${index}`} aria-hidden="true">
                                    <TableCell className="!pl-3 !pr-5"><span>&nbsp;</span></TableCell>
                                    <TableCell className="!pl-2 !pr-6"><span>&nbsp;</span></TableCell>
                                    <TableCell className="!px-2"><span>&nbsp;</span></TableCell>
                                    <TableCell className="!pl-2 !pr-5"><span>&nbsp;</span></TableCell>
                                    <TableCell className="!pl-2 !pr-5"><span>&nbsp;</span></TableCell>
                                    <TableCell className="!pl-2 !pr-3"><span>&nbsp;</span></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

            {hasUnrankedEntries ? (
                <p className="-mt-2 px-2 text-xs leading-5 text-black/45 dark:text-white/45">
                    {t("leaderboard.rank.notRankedExplanation", {
                        count: MIN_WIN_PERCENTAGE_GAMES,
                    })}
                </p>
            ) : null}

            <div className="flex min-w-0 max-w-full justify-end gap-2">
                <Button
                    type="button"
                    rounded
                    outline
                    aria-label={t("leaderboard.action.previous")}
                    title={t("leaderboard.action.previous")}
                    disabled={!canGoBack}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    className="!h-9 !w-9 px-0"
                >
                    <ChevronLeft size={18} strokeWidth={2.2} />
                </Button>
                <Button
                    type="button"
                    rounded
                    outline
                    aria-label={t("leaderboard.action.next")}
                    title={t("leaderboard.action.next")}
                    disabled={!canGoForward}
                    onClick={() => setPage((current) => current + 1)}
                    className="!h-9 !w-9 px-0"
                >
                    <ChevronRight size={18} strokeWidth={2.2} />
                </Button>
            </div>
        </div>
    );
}
