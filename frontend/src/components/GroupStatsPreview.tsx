import { compareHeadToHead, compareHeadToHeadScore } from "game-table/utils/headToHead";
import type { GroupActivity } from "game-table/types/groupActivity";
import { useGroupActivity } from "game-table/hooks/useGroupActivity";
import GroupHistoryPreview from "game-table/components/GroupHistoryPreview";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, List, ListInput, Segmented, SegmentedButton } from "konsta/react";
import LeaderboardContent, { LEADERBOARD_PAGE_SIZE, type LeaderboardSort } from "game-table/components/LeaderboardContent";
import { useLocation, useNavigate } from "react-router-dom";
import PlayerStatsTableSkeleton from "game-table/components/PlayerStatsTableSkeleton";
import DismissibleNotice from "game-table/components/DismissibleNotice";
import PlayerRecordsScreen from "game-table/pages/PlayerRecordsScreen";
import type { LeaderboardEntry } from "game-table/components/LeaderboardContent";
import { ArrowLeft } from "lucide-react";

export function groupMonthLabel(language: string, season = new Date().toISOString().slice(0, 7)) {
    return new Intl.DateTimeFormat(language, { month: "long", year: "numeric", timeZone: "UTC" })
        .formatToParts(new Date(`${season}-01T00:00:00Z`))
        .map(part => part.type === "month"
            ? part.value.charAt(0).toLocaleUpperCase(language) + part.value.slice(1)
            : part.value)
        .join("");
}

export function GroupStatsOverview({ onOpen, data }: { onOpen?: () => void; data?: GroupActivity }) {
    const { t } = useTranslation();
    const highlights = ([
        ["best_percentage", "bestPercentage"], ["most_wins", "mostWins"],
        ["head_to_head", "headToHead"], ["win_streak", "streakLeader"],
    ] as const).map(([field, label]) => {
        const highlight = data?.highlights[field];
        const records = new Map<string, string[]>();
        if (field === "head_to_head") for (const record of data?.highlights.head_to_head?.records ?? []) {
            const value = `${record.ahead}–${record.tied}–${record.behind}`;
            records.set(value, [...(records.get(value) ?? []), record.username]);
        }
        return { label: t(`groups.stats.${label}`),
            records: [...records].map(([value, usernames]) => ({ value, usernames })),
            value: highlight?.value == null ? "—" : field === "best_percentage" ? `${Math.round(highlight.value * 100)}%` : highlight.value,
            usernames: highlight?.usernames ?? [],
        };
    });
    return <section className="mb-5" aria-label={t("groups.stats.title")}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {highlights.map(item =>
                <Card key={item.label} className="!m-0" contentWrap={false}>
                    <div className="px-4 py-3 space-y-2 sm:py-4 sm:space-y-3">{(item.records.length ? item.records : [item]).map((record, index) => <div key={index}>
                        <div className="text-2xl sm:text-[30px] font-bold tabular-nums leading-tight">{record.value}</div>
                        <div className="mt-0.5 text-sm text-black/55 dark:text-white/55 sm:mt-1">{item.label}</div>
                        {record.usernames.length > 0 && <ul className="mt-1 space-y-0.5 break-words text-sm font-medium sm:mt-2 sm:space-y-1">{record.usernames.map(username => <li key={username}>@{username}</li>)}</ul>}
                    </div>)}</div>
                </Card>)}
        </div>
        {onOpen && <div className="mt-1 flex justify-end"><Button clear inline rounded onClick={onOpen} className="h-11">{t("groups.stats.view")}</Button></div>}
    </section>;
}

export default function GroupStatsPreview({ onBack, groupName, groupId }: { onBack: () => void; groupName: string; groupId: string }) {
    const { t, i18n } = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();
    const params = new URLSearchParams(location.search);
    const playerReference = params.get("player");
    const [season, setSeason] = useState(() => params.get("season") ?? "current");
    const activityScroll = useRef(0);
    const previousPlayer = useRef<string | null>(null);
    useLayoutEffect(() => {
        if (playerReference) window.scrollTo(0, 0);
        else if (previousPlayer.current) window.scrollTo(0, activityScroll.current);
        previousPlayer.current = playerReference;
    }, [playerReference]);
    const openPlayer = (player: LeaderboardEntry) => {
        activityScroll.current = window.scrollY;
        navigate({ pathname: location.pathname, search: new URLSearchParams({ player: player.username, season: selectedSeason }).toString() },
            { state: { ...location.state, playerUsername: player.username, fromGroupActivity: true } });
    };
    const backToActivity = () => location.state?.fromGroupActivity
        ? navigate(-1) : navigate(location.pathname, { replace: true });
    const [historyPage, setHistoryPage] = useState(1);
    const [view, setView] = useState<"standings" | "history">("standings");
    const { data, loading, error, retry } = useGroupActivity(groupId, season, historyPage);
    const selectedPlayer = data?.players.find(player => player.username === playerReference)
        ?? data?.players.find(player => player.account_id === playerReference);
    useEffect(() => {
        if (!selectedPlayer || selectedPlayer.username === playerReference) return;
        const next = new URLSearchParams(location.search);
        next.set("player", selectedPlayer.username);
        navigate({ pathname: location.pathname, search: next.toString() }, { replace: true, state: location.state });
    }, [selectedPlayer?.username, playerReference, location.pathname, location.search, location.state, navigate]);
    const [seasons, setSeasons] = useState<string[]>([]);
    useEffect(() => { if (data) setSeasons(data.seasons); }, [data]);
    const activeSeason = playerReference ? params.get("season") ?? season : season;
    const selectedSeason = activeSeason === "current" ? data?.current_season ?? new Date().toISOString().slice(0, 7) : activeSeason;
    return <>
        <Button clear inline rounded onClick={playerReference ? backToActivity : onBack} className="mb-3 h-11 !px-1"><ArrowLeft size={18} className="mr-1" />{playerReference ? t("groups.stats.activity") : groupName}</Button>
        <h1 className="mb-1 px-1 text-[34px] font-bold leading-tight">{groupName}</h1>
        <p className="px-1 text-black/55 dark:text-white/55">{playerReference
            ? `@${selectedPlayer?.username ?? playerReference}`
            : t("groups.stats.activity")}</p>
        <List strong inset className="!mx-0 !mt-4 !mb-5">
            <ListInput title="" label={t("groups.stats.season")} type="select"
                value={selectedSeason}
                onChange={event => {
                    if (playerReference) {
                        params.set("season", event.target.value);
                        navigate({ pathname: location.pathname, search: params.toString() }, { replace: true, state: location.state });
                    } else {
                        setSeason(event.target.value);
                        setHistoryPage(1);
                    }
                }}>
                <option value="all">{t("groups.stats.allTime")}</option>
                {(seasons.length ? seasons : [selectedSeason === "all" ? new Date().toISOString().slice(0, 7) : selectedSeason]).map(month => <option key={month} value={month}>{groupMonthLabel(i18n.language, month)}</option>)}
            </ListInput>
        </List>
        <div hidden={!!playerReference}>
        <Segmented strong rounded className="mb-5">
            <SegmentedButton active={view === "standings"} onClick={() => setView("standings")}>{t("groups.stats.standings")}</SegmentedButton>
            <SegmentedButton active={view === "history"} onClick={() => setView("history")}>{t("groups.stats.history")}</SegmentedButton>
        </Segmented>
        {error && <p role="alert" className="mb-3 px-1 text-sm text-black/55 dark:text-white/55">{error} <Button inline clear onClick={retry}>{t("groups.list.retry")}</Button></p>}
        {view === "standings" ? <>
            <GroupStatsOverview data={data} />
            <GroupStandings key={season} data={data} loading={loading} onPlayerOpen={openPlayer} />
        </> : <GroupHistoryPreview data={data?.history} loading={loading} onPageChange={setHistoryPage} /> }
        </div>
        {playerReference && (selectedPlayer ? <PlayerRecordsScreen key={`${selectedPlayer.account_id}:${selectedSeason}`} accountId={selectedPlayer.account_id}
            groupId={groupId} season={selectedSeason} availability={{ teammates: true, opponents: true }} />
            : loading ? <PlayerStatsTableSkeleton personColumnLabel={t("account.playerRecords.teammate")} percentageFirst />
            : <DismissibleNotice onDismiss={backToActivity}>{error ?? t("groups.stats.playerUnavailable")}</DismissibleNotice>)}
    </>;
}

function GroupStandings({ data, loading, onPlayerOpen }: { data?: GroupActivity; loading: boolean; onPlayerOpen: (player: LeaderboardEntry) => void }) {
    const { t } = useTranslation();
    const [showTeams, setShowTeams] = useState(false);
    const [playerSort, setPlayerSort] = useState<LeaderboardSort | "head_to_head">("win_percentage");
    const [teamSort, setTeamSort] = useState<LeaderboardSort>("win_percentage");
    const sort = showTeams ? teamSort : playerSort;
    const [page, setPage] = useState(1);
    const entries = [...((showTeams ? data?.teams : data?.players) ?? [])].sort((a, b) => {
        if (sort === "head_to_head") return compareHeadToHead(a, b);
        if (sort === "win_percentage") {
            const eligible = Number(b.games_played >= 10) - Number(a.games_played >= 10);
            if (eligible) return eligible;
            if (a.games_played >= 10 && b.games_played >= 10) {
                const difference = Math.round(b.win_percentage * 100) - Math.round(a.win_percentage * 100) || b.games_won - a.games_won;
                if (difference) return difference;
            }
            return b.games_played - a.games_played || b.games_won - a.games_won || a.username.localeCompare(b.username);
        }
        return b[sort] - a[sort] || (sort === "games_won" ? b.games_played - a.games_played : b.games_won - a.games_won) || a.username.localeCompare(b.username);
    });
    const ranks: number[] = [];
    if (sort === "head_to_head") entries.forEach((entry, index) => {
        ranks.push(index > 0 && compareHeadToHeadScore(entries[index - 1], entry) === 0
            ? ranks[index - 1] : index + 1);
    });
    const totalPages = Math.max(1, Math.ceil(entries.length / LEADERBOARD_PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    return <LeaderboardContent embedded isLoading={loading} totalPages={data ? totalPages : undefined}
        showHeadToHead={!showTeams}
        onPlayerOpen={showTeams ? undefined : onPlayerOpen}
        onHeadToHeadSort={() => { setPlayerSort("head_to_head"); setPage(1); }}
        ranks={sort === "head_to_head" ? ranks.slice((currentPage - 1) * LEADERBOARD_PAGE_SIZE, currentPage * LEADERBOARD_PAGE_SIZE) : undefined}
        participantColumnLabel={showTeams ? t("groups.stats.team") : undefined}
        controls={<div className="grid w-[10rem] max-w-full gap-1">
            <span className="px-1 text-xs font-semibold uppercase tracking-wide text-black/40 dark:text-white/40">{t("groups.stats.show")}</span>
            <Segmented rounded strong className="h-9 w-full">
                <SegmentedButton active={!showTeams} className="px-2 text-xs font-semibold" onClick={() => { setShowTeams(false); setPage(1); }}>{t("groups.stats.players")}</SegmentedButton>
                <SegmentedButton active={showTeams} className="px-2 text-xs font-semibold" onClick={() => { setShowTeams(true); setPage(1); }}>{t("groups.stats.teams")}</SegmentedButton>
            </Segmented>
        </div>}
        entries={entries.slice((currentPage - 1) * LEADERBOARD_PAGE_SIZE, currentPage * LEADERBOARD_PAGE_SIZE)}
        sort={sort} page={currentPage} hasMore={currentPage < totalPages}
        onSortChange={value => { if (showTeams) setTeamSort(value); else setPlayerSort(value); setPage(1); }}
        onPrevious={() => setPage(Math.max(1, currentPage - 1))}
        onNext={() => setPage(currentPage + 1)} />;
}
