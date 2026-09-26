import { useEffect, useState } from "react";
import { useAuthSession } from "game-table/context/AuthSessionContext";
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
import PlayerStatsTableSkeleton from "game-table/components/PlayerStatsTableSkeleton";

type Relationship = "teammates" | "opponents";
type Sort = "games_won" | "games_played" | "win_percentage";
type RecordEntry = {
    account_id: string;
    username: string;
    games_won: number;
    games_played: number;
    win_percentage: number;
};

type CachedPlayerRecordsPage = {
    records: RecordEntry[];
    hasMore: boolean;
};

const PAGE_SIZE = 10;

type Availability = { teammates: boolean; opponents: boolean };

const playerRecordsCache = new Map<string, CachedPlayerRecordsPage>();

function cacheKey(
    accountId: string,
    relationship: Relationship,
    sort: Sort,
    page: number,
): string {
    return `${accountId}:${relationship}:${sort}:${page}`;
}

export function getCachedPlayerRecordsPage(
    accountId: string,
    relationship: Relationship,
    sort: Sort,
    page: number,
): CachedPlayerRecordsPage | undefined {
    return playerRecordsCache.get(cacheKey(accountId, relationship, sort, page));
}

export function cachePlayerRecordsPage(
    accountId: string,
    relationship: Relationship,
    sort: Sort,
    page: number,
    records: RecordEntry[],
    hasMore: boolean,
): void {
    playerRecordsCache.set(
        cacheKey(accountId, relationship, sort, page),
        { records, hasMore },
    );
}

export default function PlayerRecordsScreen({
    accountId,
    availability,
    groupId,
    season = "current",
}: {
    accountId: string;
    availability: Availability;
    groupId?: string;
    season?: string;
}) {
    const { t } = useTranslation();
    const { getAuthToken: getToken, authUserId } = useAuthSession();
    const { listPlayerRecords, emit } = useTableSocket();
    const recordsScope = groupId ? JSON.stringify([authUserId, groupId, season, accountId]) : accountId;
    const [relationship, setRelationship] = useState<Relationship>(
        availability.teammates ? "teammates" : "opponents"
    );
    const [sort, setSort] = useState<Sort>("win_percentage");
    const [page, setPage] = useState(1);
    const [records, setRecords] = useState<RecordEntry[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let current = true;
        const cached = getCachedPlayerRecordsPage(recordsScope, relationship, sort, page);
        setLoading(true);
        setError(null);
        setRecords(cached?.records ?? []);
        setHasMore(cached?.hasMore ?? false);
        const fail = () => {
            if (!current) return;
            current = false;
            setLoading(false);
            setError(t("account.playerRecords.loadError"));
        };
        const timeout = window.setTimeout(fail, 15000);
        getToken().then((token) => {
            if (!current) return;
            if (!token) {
                window.clearTimeout(timeout);
                setLoading(false);
                setError(t("account.status.signInAgain"));
                return;
            }
            const receive: Parameters<typeof listPlayerRecords>[5] = (response) => {
                if (!current) return;
                window.clearTimeout(timeout);
                setLoading(false);
                if ("error" in response) {
                    setError(response.message);
                    return;
                }
                cachePlayerRecordsPage(
                    recordsScope,
                    relationship,
                    sort,
                    page,
                    response.records,
                    response.has_more,
                );
                setRecords(response.records);
                setHasMore(response.has_more);
            };
            if (groupId) {
                emit("group:player_records", { token, group_id: groupId, player_id: accountId, season, relationship, sort, page }, receive);
            } else {
                listPlayerRecords(token, relationship, sort, page, PAGE_SIZE, receive);
            }
        }).catch(fail);
        return () => { current = false; window.clearTimeout(timeout); };
    }, [accountId, recordsScope, groupId, season, getToken, emit, listPlayerRecords, page, relationship, sort, t]);

    function changeRelationship(next: Relationship) {
        setRelationship(next);
        setPage(1);
    }

    function changeSort(next: Sort) {
        setSort(next);
        setPage(1);
    }

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
                    <SegmentedButton type="button" active={sort === "win_percentage"} onClick={() => changeSort("win_percentage")} className="px-2 text-xs font-semibold">
                        {t("leaderboard.sort.winPercentage")}
                    </SegmentedButton>
                    <SegmentedButton type="button" active={sort === "games_won"} onClick={() => changeSort("games_won")} className="px-2 text-xs font-semibold">
                        {t("leaderboard.sort.won")}
                    </SegmentedButton>
                    <SegmentedButton type="button" active={sort === "games_played"} onClick={() => changeSort("games_played")} className="px-2 text-xs font-semibold">
                        {t("leaderboard.sort.played")}
                    </SegmentedButton>
                </Segmented>
            </div>

            {error ? (
                <div role="alert" className="rounded-2xl bg-ios-light-surface-2 px-4 py-5 text-sm font-medium text-red-600 dark:bg-ios-dark-surface-2 dark:text-red-300">{error}</div>
            ) : loading && records.length === 0 ? (
                <PlayerStatsTableSkeleton
                    personColumnLabel={t(relationship === "teammates"
                        ? "account.playerRecords.teammate"
                        : "account.playerRecords.opponent")}
                    rows={PAGE_SIZE}
                    percentageFirst
                />
            ) : (
                <div aria-busy={loading} className={`min-w-0 max-w-full overflow-x-auto rounded-2xl bg-ios-light-surface-2 transition-opacity dark:bg-ios-dark-surface-2 ${loading ? "opacity-70" : ""}`}>
                    <Table style={{ width: "max-content", minWidth: "100%" }}>
                        <TableHead>
                            <TableRow header>
                                    <TableCell header scope="col" className="w-px whitespace-nowrap !pl-3 !pr-3">{t("leaderboard.column.rank")}</TableCell>
                                    <TableCell header scope="col" className="whitespace-nowrap !pl-2 !pr-4">{t(relationship === "teammates" ? "account.playerRecords.teammate" : "account.playerRecords.opponent")}</TableCell>
                                    <TableCell header scope="col" className="w-px whitespace-nowrap !pl-2 !pr-3 text-right">{t("leaderboard.column.winPercentage")}</TableCell>
                                    <TableCell header scope="col" className="w-px whitespace-nowrap !px-2 text-right">{t("leaderboard.column.won")}</TableCell>
                                    <TableCell header scope="col" className="w-px whitespace-nowrap !px-2 text-right">{t("leaderboard.column.lost")}</TableCell>
                                    <TableCell header scope="col" className="w-px whitespace-nowrap !px-2 text-right">{t("leaderboard.column.played")}</TableCell>
                                </TableRow>
                        </TableHead>
                        <TableBody>
                            {records.map((entry, index) => (
                                <TableRow key={entry.account_id}>
                                    <TableCell className="w-px whitespace-nowrap !pl-3 !pr-3 text-xs font-semibold tabular-nums text-black/45 dark:text-white/45">
                                        {(page - 1) * PAGE_SIZE + index + 1}
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap !pl-2 !pr-4 font-semibold text-black dark:text-white">@{entry.username}</TableCell>
                                    <TableCell className="w-px whitespace-nowrap !pl-2 !pr-3 text-right font-normal tabular-nums text-black/70 dark:text-white/70">{Math.round(entry.win_percentage * 100)}%</TableCell>
                                    <TableCell className="w-px whitespace-nowrap !px-2 text-right font-normal tabular-nums text-black/70 dark:text-white/70">{entry.games_won}</TableCell>
                                    <TableCell className="w-px whitespace-nowrap !px-2 text-right font-normal tabular-nums text-black/70 dark:text-white/70">{entry.games_played - entry.games_won}</TableCell>
                                    <TableCell className="w-px whitespace-nowrap !px-2 text-right font-normal tabular-nums text-black/70 dark:text-white/70">{entry.games_played}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

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
