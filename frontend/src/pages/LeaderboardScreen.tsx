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

type LeaderboardSort = "games_won" | "games_played" | "win_percentage";

type LeaderboardEntry = {
    account_id: string;
    username: string;
    games_played: number;
    games_won: number;
    win_percentage: number;
};

type Props = {
    onBack: () => void;
};

const PAGE_SIZE = 10;

function formatWinPercentage(value: number): string {
    return `${Math.round(value * 100)}%`;
}

function LeaderboardSkeleton({ t }: { t: (key: string) => string }) {
    return (
        <div
            className="min-w-0 max-w-full overflow-hidden rounded-2xl bg-ios-light-surface-2 dark:bg-ios-dark-surface-2"
            aria-hidden="true"
        >
            <Table className="table-fixed" style={{ tableLayout: "fixed" }}>
                <colgroup>
                    <col className="w-10" />
                    <col className="w-auto" />
                    <col className="w-14" />
                    <col className="w-14" />
                    <col className="w-12" />
                </colgroup>
                <TableHead>
                    <TableRow header>
                        <TableCell header scope="col" className="truncate !px-3">
                            {t("leaderboard.column.rank")}
                        </TableCell>
                        <TableCell header scope="col" className="truncate !px-3">
                            {t("leaderboard.column.username")}
                        </TableCell>
                        <TableCell header scope="col" className="truncate !px-3 text-right">
                            {t("leaderboard.column.won")}
                        </TableCell>
                        <TableCell header scope="col" className="truncate !px-3 text-right">
                            {t("leaderboard.column.played")}
                        </TableCell>
                        <TableCell header scope="col" className="truncate !px-3 text-right">
                            {t("leaderboard.column.winPercentage")}
                        </TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {Array.from({ length: PAGE_SIZE }).map((_, index) => (
                        <TableRow key={index}>
                            <TableCell className="!px-3">
                                <div className="h-4 w-4 rounded-full bg-black/10 dark:bg-white/10" />
                            </TableCell>
                            <TableCell className="!px-3">
                                <div className="h-4 w-full max-w-28 rounded-full bg-black/10 dark:bg-white/10" />
                            </TableCell>
                            <TableCell className="!px-3">
                                <div className="ml-auto h-4 w-7 rounded-full bg-black/10 dark:bg-white/10" />
                            </TableCell>
                            <TableCell className="!px-3">
                                <div className="ml-auto h-4 w-7 rounded-full bg-black/10 dark:bg-white/10" />
                            </TableCell>
                            <TableCell className="!px-3">
                                <div className="ml-auto h-4 w-9 rounded-full bg-black/10 dark:bg-white/10" />
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

export default function LeaderboardScreen({ onBack }: Props) {
    const { t } = useTranslation();
    const { listLeaderboard } = useTableSocket();
    const [sort, setSort] = useState<LeaderboardSort>("games_won");
    const [page, setPage] = useState(1);
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<string | null>(null);

    useEffect(() => {
        let isCurrent = true;
        setIsLoading(true);
        setStatus(null);

        listLeaderboard(sort, page, PAGE_SIZE, (response) => {
            if (!isCurrent) return;

            setIsLoading(false);
            if ("error" in response) {
                setStatus(response.message);
                return;
            }

            setEntries(response.leaderboard);
            setHasMore(response.has_more);
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
                <LeaderboardSkeleton t={t} />
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
                                <TableCell header scope="col" className="whitespace-nowrap !pl-3 !pr-5">
                                    {t("leaderboard.column.rank")}
                                </TableCell>
                                <TableCell header scope="col" className="whitespace-nowrap !pl-2 !pr-6">
                                    {t("leaderboard.column.username")}
                                </TableCell>
                                <TableCell header scope="col" className="whitespace-nowrap !pl-2 !pr-5 text-right">
                                    {t("leaderboard.column.won")}
                                </TableCell>
                                <TableCell header scope="col" className="whitespace-nowrap !pl-2 !pr-5 text-right">
                                    {t("leaderboard.column.played")}
                                </TableCell>
                                <TableCell header scope="col" className="whitespace-nowrap !pl-2 !pr-3 text-right">
                                    {t("leaderboard.column.winPercentage")}
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {entries.map((entry, index) => (
                                <TableRow key={entry.account_id}>
                                    <TableCell className="whitespace-nowrap !pl-3 !pr-5 text-xs font-semibold tabular-nums text-black/45 dark:text-white/45">
                                        {(page - 1) * PAGE_SIZE + index + 1}
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap !pl-2 !pr-6">
                                        <span className="font-semibold text-black dark:text-white">
                                            @{entry.username}
                                        </span>
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap !pl-2 !pr-5 text-right font-semibold tabular-nums text-black dark:text-white">
                                        {entry.games_won}
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap !pl-2 !pr-5 text-right font-semibold tabular-nums text-black/70 dark:text-white/70">
                                        {entry.games_played}
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap !pl-2 !pr-3 text-right font-semibold tabular-nums text-black/70 dark:text-white/70">
                                        {formatWinPercentage(entry.win_percentage)}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {Array.from({ length: PAGE_SIZE - entries.length }).map((_, index) => (
                                <TableRow key={`empty-${index}`} aria-hidden="true">
                                    <TableCell className="!pl-3 !pr-5"><span>&nbsp;</span></TableCell>
                                    <TableCell className="!pl-2 !pr-6"><span>&nbsp;</span></TableCell>
                                    <TableCell className="!pl-2 !pr-5"><span>&nbsp;</span></TableCell>
                                    <TableCell className="!pl-2 !pr-5"><span>&nbsp;</span></TableCell>
                                    <TableCell className="!pl-2 !pr-3"><span>&nbsp;</span></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

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
