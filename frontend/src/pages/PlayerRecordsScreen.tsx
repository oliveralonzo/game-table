import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

type Relationship = "teammates" | "opponents";
type Sort = "games_won" | "games_played" | "win_percentage";
type RecordEntry = {
    account_id: string;
    username: string;
    games_won: number;
    games_played: number;
    win_percentage: number;
};

const PAGE_SIZE = 10;
const MIN_WIN_PERCENTAGE_GAMES = 10;

type Availability = { teammates: boolean; opponents: boolean };

export default function PlayerRecordsScreen({ availability }: { availability: Availability }) {
    const { t } = useTranslation();
    const { getToken } = useAuth();
    const { listPlayerRecords } = useTableSocket();
    const [relationship, setRelationship] = useState<Relationship>(
        availability.teammates ? "teammates" : "opponents"
    );
    const [sort, setSort] = useState<Sort>("games_won");
    const [page, setPage] = useState(1);
    const [records, setRecords] = useState<RecordEntry[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let current = true;
        setLoading(true);
        setError(null);
        setRecords([]);
        setHasMore(false);
        getToken().then((token) => {
            if (!current) return;
            if (!token) {
                setLoading(false);
                setError(t("account.status.signInAgain"));
                return;
            }
            listPlayerRecords(token, relationship, sort, page, PAGE_SIZE, (response) => {
                if (!current) return;
                setLoading(false);
                if ("error" in response) {
                    setError(response.message);
                    return;
                }
                setRecords(response.records);
                setHasMore(response.has_more);
            });
        });
        return () => { current = false; };
    }, [getToken, listPlayerRecords, page, relationship, sort, t]);

    function changeRelationship(next: Relationship) {
        setRelationship(next);
        setPage(1);
    }

    function changeSort(next: Sort) {
        setSort(next);
        setPage(1);
    }

    const hasUnrankedEntries = sort === "win_percentage"
        && records.some((entry) => entry.games_played < MIN_WIN_PERCENTAGE_GAMES);

    return (
        <div className="grid min-w-0 max-w-full gap-4">
            <Segmented strong rounded className="w-full" aria-label={t("account.playerRecords.relationshipLabel")}>
                <SegmentedButton type="button" active={relationship === "teammates"} disabled={!availability.teammates} onClick={() => changeRelationship("teammates")}>
                    {t("account.playerRecords.teammates")}
                </SegmentedButton>
                <SegmentedButton type="button" active={relationship === "opponents"} disabled={!availability.opponents} onClick={() => changeRelationship("opponents")}>
                    {t("account.playerRecords.opponents")}
                </SegmentedButton>
            </Segmented>

            <div className="grid w-[15rem] max-w-full gap-1">
                <span className="px-1 text-xs font-semibold uppercase tracking-wide text-black/40 dark:text-white/40">
                    {t("leaderboard.sort.label")}
                </span>
                <Segmented rounded strong className="h-9 w-full">
                    <SegmentedButton type="button" active={sort === "games_won"} onClick={() => changeSort("games_won")} className="px-2 text-xs font-semibold">
                        {t("leaderboard.sort.won")}
                    </SegmentedButton>
                    <SegmentedButton type="button" active={sort === "games_played"} onClick={() => changeSort("games_played")} className="px-2 text-xs font-semibold">
                        {t("leaderboard.sort.played")}
                    </SegmentedButton>
                    <SegmentedButton type="button" active={sort === "win_percentage"} onClick={() => changeSort("win_percentage")} className="px-2 text-xs font-semibold">
                        {t("leaderboard.sort.winPercentage")}
                    </SegmentedButton>
                </Segmented>
            </div>

            {error ? (
                <div role="alert" className="rounded-2xl bg-ios-light-surface-2 px-4 py-5 text-sm font-medium text-red-600 dark:bg-ios-dark-surface-2 dark:text-red-300">{error}</div>
            ) : loading && records.length === 0 ? (
                <div className="rounded-2xl bg-ios-light-surface-2 px-4 py-5 text-sm text-black/55 dark:bg-ios-dark-surface-2 dark:text-white/55" aria-live="polite">{t("account.playerRecords.loading")}</div>
            ) : (
                <div className={`min-w-0 max-w-full overflow-x-auto rounded-2xl bg-ios-light-surface-2 dark:bg-ios-dark-surface-2 ${loading ? "opacity-70" : ""}`}>
                    <Table style={{ width: "max-content", minWidth: "100%" }}>
                        <TableHead>
                            <TableRow header>
                                <TableCell header scope="col" className="whitespace-nowrap !pl-3 !pr-5">{t("leaderboard.column.rank")}</TableCell>
                                <TableCell header scope="col" className="whitespace-nowrap !pl-3 !pr-6">{t(relationship === "teammates" ? "account.playerRecords.teammate" : "account.playerRecords.opponent")}</TableCell>
                                <TableCell header scope="col" className="whitespace-nowrap !pl-2 !pr-5 text-right">{t("leaderboard.column.won")}</TableCell>
                                <TableCell header scope="col" className="whitespace-nowrap !pl-2 !pr-5 text-right">{t("leaderboard.column.played")}</TableCell>
                                <TableCell header scope="col" className="whitespace-nowrap !pl-2 !pr-3 text-right">{t("leaderboard.column.winPercentage")}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {records.map((entry, index) => (
                                <TableRow key={entry.account_id}>
                                    <TableCell className="whitespace-nowrap !pl-3 !pr-5 text-xs font-semibold tabular-nums text-black/45 dark:text-white/45">
                                        {sort === "win_percentage" && entry.games_played < MIN_WIN_PERCENTAGE_GAMES
                                            ? t("leaderboard.rank.notRankedShort")
                                            : (page - 1) * PAGE_SIZE + index + 1}
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap !pl-3 !pr-6 font-semibold text-black dark:text-white">@{entry.username}</TableCell>
                                    <TableCell className="whitespace-nowrap !pl-2 !pr-5 text-right font-semibold tabular-nums text-black dark:text-white">{entry.games_won}</TableCell>
                                    <TableCell className="whitespace-nowrap !pl-2 !pr-5 text-right font-semibold tabular-nums text-black/70 dark:text-white/70">{entry.games_played}</TableCell>
                                    <TableCell className="whitespace-nowrap !pl-2 !pr-3 text-right font-semibold tabular-nums text-black/70 dark:text-white/70">{Math.round(entry.win_percentage * 100)}%</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

            {hasUnrankedEntries ? (
                <p className="-mt-2 px-2 text-xs leading-5 text-black/45 dark:text-white/45">
                    {t("account.playerRecords.notRankedExplanation", { count: MIN_WIN_PERCENTAGE_GAMES })}
                </p>
            ) : null}

            {(page > 1 || hasMore) && !error ? (
                <div className="flex items-center justify-end gap-2">
                    <span className="mr-1 text-xs font-medium text-black/45 dark:text-white/45">{t("account.history.page", { page })}</span>
                    <Button type="button" rounded outline aria-label={t("account.history.previous")} title={t("account.history.previous")} disabled={page === 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} className="!h-9 !w-9 px-0"><ChevronLeft size={18} strokeWidth={2.2} /></Button>
                    <Button type="button" rounded outline aria-label={t("account.history.next")} title={t("account.history.next")} disabled={!hasMore || loading} onClick={() => setPage((value) => value + 1)} className="!h-9 !w-9 px-0"><ChevronRight size={18} strokeWidth={2.2} /></Button>
                </div>
            ) : null}
        </div>
    );
}
