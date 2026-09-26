import type { ReactNode } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Flame } from "lucide-react";
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
import PlayerStatsTableSkeleton from "game-table/components/PlayerStatsTableSkeleton";

export type LeaderboardSort = "games_won" | "games_played" | "win_percentage";

export type LeaderboardEntry = {
    account_id: string;
    username: string;
    usernames?: string[];
    games_played: number;
    games_won: number;
    win_percentage: number;
    win_streak: number;
    head_to_head?: { ahead: number; tied: number; behind: number };
};

type Props = {
    entries: LeaderboardEntry[];
    sort: LeaderboardSort | "head_to_head";
    page: number;
    hasMore: boolean;
    totalPages?: number;
    isLoading?: boolean;
    status?: string | null;
    embedded?: boolean;
    controls?: ReactNode;
    participantColumnLabel?: string;
    showHeadToHead?: boolean;
    onHeadToHeadSort?: () => void;
    ranks?: number[];
    onBack?: () => void;
    onPlayerOpen?: (player: LeaderboardEntry) => void;
    onSortChange: (sort: LeaderboardSort) => void;
    onPrevious: () => void;
    onNext: () => void;
};
export const LEADERBOARD_PAGE_SIZE = 10;
const MIN_WIN_PERCENTAGE_GAMES = 10;
function formatWinPercentage(value: number): string {
    return `${Math.round(value * 100)}%`;
}

export default function LeaderboardContent({ entries, sort, page, hasMore, totalPages, isLoading = false, status = null, embedded = false, controls, participantColumnLabel, showHeadToHead = false, onHeadToHeadSort, ranks, onBack, onPlayerOpen, onSortChange, onPrevious, onNext }: Props) {
    const { t } = useTranslation();
    const canGoBack = page > 1 && !isLoading;
    const canGoForward = hasMore && !isLoading;
    const hasUnrankedEntries = sort === "win_percentage"
        && entries.some((entry) => entry.games_played < MIN_WIN_PERCENTAGE_GAMES);

    return (
        <div className={`grid min-w-0 max-w-full gap-4 p-1 ${embedded ? "w-full" : "sm:w-[28rem]"}`}>
            {!embedded && <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
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
            </div>}

            <div className="flex flex-wrap items-end gap-3">
            {controls}
            <div className={`grid max-w-full gap-1 ${controls ? "w-full min-w-0 basis-full sm:w-auto sm:min-w-[19rem] sm:basis-[19rem] sm:max-w-[19rem]" : "w-[15rem]"}`}>
                <span className="px-1 text-xs font-semibold uppercase tracking-wide text-black/40 dark:text-white/40">
                    {t("leaderboard.sort.label")}
                </span>
                <Segmented rounded strong className="h-9 w-full">

                    {(["win_percentage", "games_won", "games_played"] as const).map(value => <SegmentedButton
                        key={value}
                        type="button"
                        active={sort === value}
                        onClick={() => onSortChange(value)}
                        className="px-2 text-xs font-semibold"
                    >
                        {t(`leaderboard.sort.${value === "win_percentage" ? "winPercentage" : value === "games_won" ? "won" : "played"}`)}
                    </SegmentedButton>)}
                    {showHeadToHead && onHeadToHeadSort && <SegmentedButton
                        type="button"
                        active={sort === "head_to_head"}
                        onClick={onHeadToHeadSort}
                        className="px-2 text-xs font-semibold"
                    >
                        {t("leaderboard.column.headToHead")}
                    </SegmentedButton>}
                </Segmented>
            </div>

            </div>

            {isLoading && entries.length === 0 ? (
                <PlayerStatsTableSkeleton
                    personColumnLabel={participantColumnLabel ?? t("leaderboard.column.username")}
                    rows={LEADERBOARD_PAGE_SIZE}
                    showHeadToHead={showHeadToHead}
                    percentageFirst
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
                                    {participantColumnLabel ?? t("leaderboard.column.username")}
                                </TableCell>
                                
                                <TableCell header scope="col" className="w-px whitespace-nowrap !pl-2 !pr-3 text-right">
                                    {t("leaderboard.column.winPercentage")}
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
                            {showHeadToHead && <TableCell header scope="col" className="w-px whitespace-nowrap !px-3 text-right">
                                    {t("leaderboard.column.headToHead")}
                                </TableCell>}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {entries.map((entry, index) => (
                                <TableRow key={entry.account_id}
                                    onClick={onPlayerOpen ? () => onPlayerOpen(entry) : undefined}
                                    className={onPlayerOpen ? "cursor-pointer hover:bg-black/5 focus-within:bg-black/5 dark:hover:bg-white/5 dark:focus-within:bg-white/5" : ""}>
                                <TableCell className="w-px whitespace-nowrap !pl-3 !pr-3 text-xs font-semibold tabular-nums text-black/45 dark:text-white/45">
                                        {(sort === "win_percentage" || sort === "head_to_head")
                                            && entry.games_played < MIN_WIN_PERCENTAGE_GAMES
                                            ? t("leaderboard.rank.notRankedShort")
                                            : ranks?.[index] ?? (page - 1) * LEADERBOARD_PAGE_SIZE + index + 1}
                                    </TableCell>
                                <TableCell className="whitespace-nowrap !pl-2 !pr-4">
                                        <span className="inline-flex items-center gap-1.5 font-semibold text-black dark:text-white">
                                            {onPlayerOpen ? <button type="button" className="cursor-pointer text-left focus-visible:outline-none">@{entry.username}</button>
                                                : (entry.usernames ?? [entry.username]).map(username => `@${username}`).join(", ")}
                                            {entry.win_streak >= 2 ? (
                                                <span
                                                    className="inline-flex items-center gap-0.5 text-black/40 dark:text-white/45"
                                                    title={t("leaderboard.streak.label", { count: entry.win_streak })}
                                                    aria-label={t("leaderboard.streak.label", { count: entry.win_streak })}
                                                >
                                                    <Flame aria-hidden="true" size={14} strokeWidth={2.2} />
                                                    <span className="tabular-nums">{entry.win_streak}</span>
                                                </span>
                                            ) : null}
                                        </span>
                                    </TableCell>
                                
                                <TableCell className="whitespace-nowrap !pl-2 !pr-3 text-right font-normal tabular-nums text-black/70 dark:text-white/70">
                                        {formatWinPercentage(entry.win_percentage)}
                                    </TableCell>
                                <TableCell className="w-px whitespace-nowrap !px-2 text-right font-normal tabular-nums text-black/70 dark:text-white/70">
                                        {entry.games_won}
                                    </TableCell>
                                <TableCell className="w-px whitespace-nowrap !px-2 text-right font-normal tabular-nums text-black/70 dark:text-white/70">
                                        {entry.games_played - entry.games_won}
                                    </TableCell>
                                <TableCell className="w-px whitespace-nowrap !px-2 text-right font-normal tabular-nums text-black/70 dark:text-white/70">
                                        {entry.games_played}
                                    </TableCell>
                            {showHeadToHead && <TableCell className="whitespace-nowrap !px-3 text-right font-normal tabular-nums text-black/70 dark:text-white/70">
                                        {entry.head_to_head ? `${entry.head_to_head.ahead}–${entry.head_to_head.tied}–${entry.head_to_head.behind}` : "—"}
                                    </TableCell>}
                            </TableRow>
                            ))}
                            {Array.from({ length: LEADERBOARD_PAGE_SIZE - entries.length }).map((_, index) => (
                                <TableRow key={`empty-${index}`} aria-hidden="true">
                                <TableCell className="!pl-3 !pr-5"><span>&nbsp;</span></TableCell>
                                <TableCell className="!pl-2 !pr-6"><span>&nbsp;</span></TableCell>
                                
                                <TableCell className="!pl-2 !pr-3"><span>&nbsp;</span></TableCell>
                                <TableCell className="!px-2"><span>&nbsp;</span></TableCell>
                                <TableCell className="!pl-2 !pr-5"><span>&nbsp;</span></TableCell>
                                <TableCell className="!pl-2 !pr-5"><span>&nbsp;</span></TableCell>
                            {showHeadToHead && <TableCell className="!px-3"><span>&nbsp;</span></TableCell>}
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

            <div className="flex min-w-0 max-w-full items-center justify-end gap-2">
                {totalPages !== undefined && <span className="mr-auto text-xs text-black/45 dark:text-white/45">{t("groups.stats.pageOf", { page, total: totalPages })}</span>}
                <Button
                    type="button"
                    rounded
                    outline
                    aria-label={t("leaderboard.action.previous")}
                    title={t("leaderboard.action.previous")}
                    disabled={!canGoBack}
                    onClick={onPrevious}
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
                    onClick={onNext}
                    className="!h-9 !w-9 px-0"
                >
                    <ChevronRight size={18} strokeWidth={2.2} />
                </Button>
            </div>
        </div>
    );
}
