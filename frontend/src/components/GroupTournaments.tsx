import InviteButton from "game-table/components/InviteButton";
import TableInviteDialog from "game-table/components/TableInviteDialog";
import { useTableInvite } from "game-table/hooks/useTableInvite";
import LeaderboardContent, { LEADERBOARD_PAGE_SIZE, type LeaderboardEntry, type LeaderboardSort } from "game-table/components/LeaderboardContent";
import TableCards from "game-table/components/TableCards";
import { encodeTableCodePath } from "game-table/utils/tableRoute";
import type { GroupTable } from "game-table/context/TableSocket";
import PostGameDialog from "game-table/components/PostGameDialog";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AppLoadingScreen from "game-table/components/AppLoadingScreen";
import TableIdentityBadge from "game-table/components/TableIdentityBadge";
import { Badge, Button, Dialog, DialogButton, Glass, List, ListItem, Preloader, Segmented, SegmentedButton } from "konsta/react";
import { CalendarDays, Check, CircleHelp, Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuthSession } from "game-table/context/AuthSessionContext";
import { useTableSocket } from "game-table/context/TableSocket";
import type { FrontendGamePlugin } from "game-table/gamePlugin";

import { parseSpanishTournamentDate, formatSpanishTournamentDate } from "game-table/utils/tournamentDate";

import { glassWithoutLightInsetShadow } from "game-table/styles/glass";
import DismissibleNotice from "game-table/components/DismissibleNotice";
import { withAttendanceResponse, type AttendanceResponse, type AttendancePerson } from "game-table/utils/tournamentAttendance";
import LobbyRoster, { type RosterPerson } from "game-table/components/LobbyRoster";
import { buildInitialLabelsById } from "game-table/utils/playerInitialLabels";
import type { GroupMember } from "game-table/context/TableSocket";
import TournamentCreateSheet from "game-table/components/TournamentCreateSheet";

type Tournament = { id: string; scheduled_at: number; rules: unknown; status: "scheduled"; stage?: string; standings?: Omit<LeaderboardEntry, "username">[]; bracket?: { stage: "semifinal" | "final"; pairs: (string[] | null)[]; scores: number[] | null; games?: [number, number][]; table_code: string | null }[]; round?: number; can_enter_late?: boolean; champions?: string[]; draft_prompt?: { slot: number; decision: "ready" | "partner_choice"; deadline: number; candidates?: string[] }; tables?: GroupTable[]; assignment?: { id: string; table_code: string; deadline: number } | null; readiness_deadline?: number | null; readiness_id?: string; awaiting_response?: boolean; attendance_intent_count?: number | null; attendance_intent?: boolean; attendance_response?: "yes" | "maybe" | "no" | null; attendance_maybe_count?: number; attendance_roster?: AttendancePerson[] };
type GroupSettings = { rules: unknown; can_edit: boolean };

export default function GroupTournaments({ groupId, groupUrl, groupName, groupMembers, gamePlugin, onTournamentRules }: {
    groupId: string; groupUrl: string; groupName: string; groupMembers: GroupMember[]; gamePlugin: FrontendGamePlugin;
    onTournamentRules: (settings: { id: string; rules: unknown }) => void;
}) {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { tournamentId } = useParams();
    const inviteText = t("groups.tournaments.inviteShareText", { group: groupName });
    const { handleInvite, inviteCopied, fallbackInviteUrl, closeInviteFallback } = useTableInvite({
        pageShareText: inviteText,
        pageUrl: tournamentId ? `${groupUrl}/tournaments/${encodeURIComponent(tournamentId)}` : undefined,
        t,
    });
    const { getAuthToken } = useAuthSession();
    const { emit, on, off, joinTable, groupConnectionVersion } = useTableSocket();
    const [settings, setSettings] = useState<GroupSettings | null>(null);
    const [tournaments, setTournaments] = useState<Tournament[] | null>(null);
    const [selected, setSelected] = useState<Tournament | null>(null);
    useEffect(() => {
        if (selected?.id === tournamentId && selected) {
            onTournamentRules({ id: selected.id, rules: selected.rules });
        }
    }, [selected, tournamentId, onTournamentRules]);
    const [rules, setRules] = useState<unknown>(null);
    const [date, setDate] = useState("");
    const [spanishDate, setSpanishDate] = useState("");
    const datePicker = useRef<HTMLInputElement>(null);
    const [time, setTime] = useState("");
    const timeZoneId = useId();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const enteredDate = new Date(`${date}T${time}`);
    const zoneReference = Number.isFinite(enteredDate.getTime()) ? enteredDate : new Date();
    const zoneOffset = new Intl.DateTimeFormat(i18n.language, { timeZone, timeZoneName: "shortOffset" })
        .formatToParts(zoneReference).find(part => part.type === "timeZoneName")?.value ?? "";
    const zoneLabel = `${timeZone} (${zoneOffset})`;
    const isSpanish = i18n.language.toLowerCase().startsWith("es");
    const [savingIntent, setSavingIntent] = useState(false);
    const pendingIntent = useRef(false);
    const readVersion = useRef(0);
    const activeTournamentId = useRef(tournamentId);
    activeTournamentId.current = tournamentId;
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [refresh, setRefresh] = useState(0);
    const isCreating = tournamentId === "new";
    useEffect(() => {
        const update = (event: { group_id: string }) => {
            if (event.group_id === groupId) setRefresh(value => value + 1);
        };
        const refocus = () => setRefresh(value => value + 1);
        on("tournament:updated", update);
        window.addEventListener("focus", refocus);
        return () => { off("tournament:updated", update); window.removeEventListener("focus", refocus); };
    }, [on, off, groupId]);
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        if (isCreating) return;
        const update = () => setNow(Date.now());
        update();
        const timer = window.setInterval(update, 1000);
        window.addEventListener("focus", update);
        return () => { window.clearInterval(timer); window.removeEventListener("focus", update); };
    }, [isCreating]);
    const countdown = (scheduledAt: number) => {
        if (scheduledAt <= now) return t("groups.tournaments.awaitingStart");
        const remaining = scheduledAt - now;
        const [unit, milliseconds] = remaining >= 86_400_000 ? ["day", 86_400_000]
            : remaining >= 3_600_000 ? ["hour", 3_600_000]
            : remaining >= 60_000 ? ["minute", 60_000]
            : ["second", 1_000];
        const duration = new Intl.NumberFormat(i18n.language, { style: "unit", unit, unitDisplay: "narrow" })
            .format(Math.max(1, Math.floor(remaining / milliseconds)));
        return t("groups.tournaments.startsIn", { duration });
    };
    const request = useCallback(async <T,>(event: string, data: object = {}): Promise<T> => {
        const token = await getAuthToken();
        if (!token) throw new Error();
        return new Promise((resolve, reject) => {
            const timer = window.setTimeout(() => reject(new Error()), 12000);
            emit(event, { token, group_id: groupId, ...data }, (response: T | { error: string }) => {
                window.clearTimeout(timer);
                if (!response || (typeof response === "object" && "error" in response)) reject(new Error());
                else resolve(response as T);
            });
        });
    }, [getAuthToken, emit, groupId]);
    useEffect(() => {
        if (pendingIntent.current) return;
        let current = true;
        const version = ++readVersion.current;
        setError(null);
        Promise.all([
            request<GroupSettings>("group:settings"),
            tournamentId && !isCreating
                ? request<{ tournament: Tournament }>("tournament:get", { tournament_id: tournamentId })
                : request<{ tournaments: Tournament[] }>("tournament:list"),
        ]).then(([groupSettings, response]) => {
            if (!current || version !== readVersion.current) return;
            setSettings(groupSettings);
            if ("tournament" in response) setSelected(response.tournament);
            else setTournaments(response.tournaments);
        }).catch(() => { if (current && version === readVersion.current) setError(t("groups.tournaments.loadError")); });
        return () => { current = false; };
    }, [request, tournamentId, isCreating, groupConnectionVersion, refresh, t]);
    useEffect(() => {
        if (isCreating) {
            const nextHour = new Date();
            nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
            const initialDate = [nextHour.getFullYear(), String(nextHour.getMonth() + 1).padStart(2, "0"), String(nextHour.getDate()).padStart(2, "0")].join("-");
            setRules(null); setDate(initialDate); setSpanishDate(formatSpanishTournamentDate(initialDate));
            setTime(`${String(nextHour.getHours()).padStart(2, "0")}:00`);
        }
    }, [isCreating]);
    const back = () => navigate(groupUrl, { state: { groupPlayMode: "tournaments" } });
    const formatTitleDate = (timestamp: number) => {
        const parts = new Intl.DateTimeFormat(i18n.language, {
            month: "short", day: "numeric", year: "numeric",
        }).formatToParts(timestamp);
        const month = (parts.find(part => part.type === "month")?.value ?? "").replace(/\.$/, "");
        const day = parts.find(part => part.type === "day")?.value ?? "";
        const year = parts.find(part => part.type === "year")?.value ?? "";
        return `${month.charAt(0).toLocaleUpperCase(i18n.language)}${month.slice(1)}. ${day}, ${year}`;
    };
    const formatTime = (timestamp: number) => {
        const value = new Intl.DateTimeFormat(i18n.language, {
            hour: "numeric", minute: "2-digit", hour12: true,
        }).formatToParts(timestamp).map(part => part.type === "dayPeriod"
            ? part.value.replace(/[.\s\u00a0\u202f]/g, "").toLowerCase() : part.value).join("");
        const zone = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" })
            .formatToParts(timestamp).find(part => part.type === "timeZoneName")?.value ?? timeZone;
        return t("groups.tournaments.localTime", { time: value, zone });
    };
    const formatDate = (timestamp: number) => `${new Intl.DateTimeFormat(i18n.language, {
        year: "numeric", month: "short", day: "numeric",
    }).format(timestamp)} · ${formatTime(timestamp)}`;
    const create = async (event: React.FormEvent) => {
        event.preventDefault();
        if (saving || !settings?.can_edit) return;
        const scheduledAt = new Date(`${date}T${time}`).getTime();
        if (!Number.isFinite(scheduledAt) || scheduledAt <= Date.now()
            || enteredDate.getHours() !== Number(time.split(":")[0])
            || enteredDate.getMinutes() !== Number(time.split(":")[1])) {
            setError(t("groups.tournaments.futureError")); return;
        }
        setSaving(true); setError(null);
        try {
            const response = await request<{ tournament: Tournament }>("tournament:create", {
                scheduled_at: scheduledAt, rules: rules ?? settings.rules,
            });
            navigate(`${groupUrl}/tournaments/${encodeURIComponent(response.tournament.id)}`, { replace: true });
        } catch { setError(t("groups.tournaments.createError")); }
        finally { setSaving(false); }
    };
    const saveIntent = async (attendanceResponse: AttendanceResponse) => {
        if (!selected || pendingIntent.current || selected.attendance_response === attendanceResponse) return;
        const previous = selected;
        pendingIntent.current = true;
        ++readVersion.current;
        const self = groupMembers.find(member => member.is_self);
        setSelected(withAttendanceResponse(previous, attendanceResponse, self ? { ...self, is_self: true } : undefined));
        setSavingIntent(true); setError(null);
        let committed = false;
        try {
            const result = await request<{ tournament: Tournament }>("tournament:set_attendance_intent", {
                tournament_id: previous.id, response: attendanceResponse,
            });
            committed = true;
            if (activeTournamentId.current === previous.id) setSelected(result.tournament);
        } catch {
            if (activeTournamentId.current === previous.id) {
                setSelected(previous);
                setError(t("groups.tournaments.intentError"));
            }
        } finally {
            ++readVersion.current;
            pendingIntent.current = false;
            setSavingIntent(false);
            if (committed || activeTournamentId.current !== previous.id) setRefresh(value => value + 1);
        }
    };
    const roster = selected?.attendance_roster ?? [];
    const badges = buildInitialLabelsById(groupMembers.map(person => ({ id: person.account_id, name: person.name, badge_label: person.badge_label })));
    const attendancePeople: RosterPerson[] = [...roster]
        .sort((a, b) => a.name.localeCompare(b.name, i18n.language))
        .map(person => ({ id: person.account_id, name: person.name, accountUsername: person.username,
            initialLabel: badges[person.account_id]?.label, isSelf: person.is_self, isHost: false, hasSeat: false,
            statusIndicator: <span role="img" aria-label={t(person.response === "yes" ? "groups.tournaments.acceptedStatus" : person.response === "maybe" ? "groups.tournaments.tentativeStatus" : "groups.tournaments.declinedStatus")}
                className={person.response === "yes" ? "text-green-600 dark:text-green-400" : person.response === "maybe" ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}>
                {person.response === "yes" ? <Check size={20} aria-hidden="true" /> : person.response === "maybe" ? <CircleHelp size={20} aria-hidden="true" /> : <X size={20} aria-hidden="true" />}
            </span> }));
    const [starting, setStarting] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const canDelete = Boolean(settings?.can_edit && selected?.id === tournamentId
        && selected?.status === "scheduled" && (!selected.stage || selected.stage === "scheduled")
        && !selected.readiness_deadline);
    const deleteTournament = async () => {
        if (!canDelete || !deleteTarget || deleteTarget !== selected?.id || deleting || starting) return;
        setDeleting(true);
        setError(null);
        try {
            await request<{ deleted: boolean }>("tournament:delete", { tournament_id: deleteTarget });
            if (activeTournamentId.current === deleteTarget) {
                navigate(groupUrl, { replace: true, state: { groupPlayMode: "tournaments" } });
            }
        } catch {
            if (activeTournamentId.current === deleteTarget) setError(t("groups.tournaments.deleteError"));
        } finally {
            setDeleting(false);
            setDeleteTarget(null);
        }
    };
    const start = async () => {
        if (!selected || starting) return;
        setStarting(true);
        setError(null);
        try {
            const result = await request<{ tournament: Tournament }>("tournament:start", { tournament_id: selected.id });
            setSelected(result.tournament);
        } catch { setError(t("groups.tournaments.startError")); }
        finally { setStarting(false); }
    };
    useEffect(() => {
        if (!tournamentId || isCreating) return;
        const refreshView = () => setRefresh(value => value + 1);
        const handle = window.setInterval(refreshView, 10000);
        return () => {
            window.clearInterval(handle);
            emit("tournament:leave_view", { tournament_id: tournamentId });
        };
    }, [tournamentId, isCreating, emit]);
    const [dismissedAssignment, setDismissedAssignment] = useState<string>();
    const enterTable = (code: string, done: (ok: boolean) => void = () => {}) => {
        const self = groupMembers.find(member => member.is_self);
        if (!self) { done(false); return; }
        joinTable(code, self.name, () => {
            setError(t("groups.tables.enterError"));
            done(false);
        }, tableCode => {
            done(true);
            navigate(encodeTableCodePath(tableCode), { state: { returnToTournament: `${groupUrl}/tournaments/${tournamentId}` } });
        });
    };
    const joinLate = async () => {
        if (!selected?.can_enter_late || starting) return;
        setStarting(true);
        try {
            const result = await request<{ tournament: Tournament }>("tournament:late_join", { tournament_id: selected.id });
            setSelected(result.tournament);
        } catch { setError(t("groups.tables.enterError")); }
        finally { setStarting(false); }
    };
    const roundLabel = t("groups.tournaments.roundOne", { round: selected?.round || 1 });
    const [standingSort, setStandingSort] = useState<LeaderboardSort>("win_percentage");
    const [standingPage, setStandingPage] = useState(1);
    const standings = (selected?.standings ?? []).map(row => ({
        ...row, username: groupMembers.find(member => member.account_id === row.account_id)?.username ?? row.account_id,
    }));
    if (standingSort !== "win_percentage") standings.sort((a, b) => b[standingSort] - a[standingSort]);
    const standingPages = Math.max(1, Math.ceil(standings.length / LEADERBOARD_PAGE_SIZE));
    const page = Math.min(standingPage, standingPages);
    const initialLoading = !!tournamentId && !error
        && (!settings || (!isCreating && selected?.id !== tournamentId));
    if (initialLoading && isCreating) return createPortal(<div className="fixed inset-0 z-50"><AppLoadingScreen /></div>, document.body);
    if (initialLoading) return <div role="status" aria-label={t("groups.tournaments.loading")}>
        <div aria-hidden="true" className="motion-safe:animate-pulse">
            <div className="mb-2 h-10 w-56 max-w-full rounded bg-black/10 dark:bg-white/10" />
            <div className="mb-2 h-5 w-44 rounded bg-black/10 dark:bg-white/10" />
            <div className="mb-3 h-6 w-28 rounded bg-black/10 dark:bg-white/10" />
            <div className="mb-5 h-9 w-32 rounded-full bg-black/10 dark:bg-white/10" />
            <div className="h-9 rounded-full bg-black/10 dark:bg-white/10" />
        </div>
    </div>;
    return <>
        {error && !isCreating && <DismissibleNotice onDismiss={() => setError(null)}>{error} <Button inline clear onClick={() => setRefresh(v => v + 1)}>{t("groups.list.retry")}</Button></DismissibleNotice>}
        {isCreating ? <TournamentCreateSheet groupName={groupName} gamePlugin={gamePlugin}
            rules={rules ?? settings?.rules ?? gamePlugin.defaultSettings} onRulesChange={setRules}
            canEdit={!!settings?.can_edit} saving={saving} canSubmit={!!date && !!time}
            error={error} onDismissError={() => setError(null)} onRetry={() => setRefresh(v => v + 1)} onCancel={back} onCreate={create}
            schedulingRows={<>
                    <ListItem titleFontSizeIos="text-[17px]" titleFontSizeMaterial="text-[16px]" title={t("groups.tournaments.date")} after={<span className={`relative flex min-w-0 items-center ${isSpanish ? "pr-11" : ""}`}>
                        {isSpanish && <input aria-label={`${t("groups.tournaments.date")} (dd/mm/yyyy)`}
                            className="w-32 min-w-0 rounded-lg bg-ios-light-surface-2 px-2 py-1 text-right text-inherit dark:bg-ios-dark-surface-2" type="text" inputMode="numeric"
                            placeholder="dd/mm/yyyy" maxLength={10} value={spanishDate} required disabled={saving}
                            aria-invalid={!!spanishDate && !date}
                            onChange={event => {
                                const digits = event.target.value.replace(/\D/g, "").slice(0, 8);
                                const formatted = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join("/");
                                setSpanishDate(formatted); setDate(parseSpanishTournamentDate(formatted));
                            }} />}
                        <input ref={datePicker} aria-label={t("groups.tournaments.date")}
                            aria-hidden={isSpanish || undefined} tabIndex={isSpanish ? -1 : undefined}
                            className={isSpanish ? "pointer-events-none absolute bottom-0 right-0 h-px w-px opacity-0" : "min-w-0 max-w-full rounded-lg bg-ios-light-surface-2 px-2 py-1 text-right text-inherit dark:bg-ios-dark-surface-2"}
                            type="date" value={date} required={!isSpanish} disabled={saving}
                            onChange={event => { setDate(event.target.value); setSpanishDate(formatSpanishTournamentDate(event.target.value)); }} />
                        {isSpanish && <Button type="button" clear rounded inline className="absolute right-0 top-1/2 h-11 w-11 -translate-y-1/2 !px-0"
                            aria-label={t("groups.tournaments.openCalendar")} disabled={saving}
                            onClick={() => datePicker.current?.showPicker()}><CalendarDays size={20} /></Button>}
                    </span>} />
                    <ListItem titleFontSizeIos="text-[17px]" titleFontSizeMaterial="text-[16px]" title={t("groups.tournaments.time")} after={<input aria-label={t("groups.tournaments.time")} aria-describedby={timeZoneId} className="min-w-0 max-w-full rounded-lg bg-ios-light-surface-2 px-2 py-1 text-right text-inherit dark:bg-ios-dark-surface-2" type="time" value={time} required disabled={saving} onChange={event => setTime(event.target.value)} />} />
                    <ListItem titleFontSizeIos="text-[17px]" titleFontSizeMaterial="text-[16px]"
                        title={t("groups.tournaments.timeZone")} after={<span id={timeZoneId} className="break-words text-right text-sm">{zoneLabel}</span>} />
            </>} />
        : tournamentId ? selected?.id === tournamentId ? <>
            <h1 className="mb-1 px-1 text-[34px] font-bold leading-tight">{formatTitleDate(selected.scheduled_at)}</h1>
            <div className="mb-2 flex flex-wrap items-center gap-2 px-1 text-sm text-black/55 dark:text-white/55">
                <span>{t("groups.tournaments.tournament")}</span>
                <TableIdentityBadge groupName={groupName} compact />
            </div>
            <p className="mb-3 px-1 text-black/55 dark:text-white/55">{formatTime(selected.scheduled_at)}</p>
            <div className="mb-5 px-1">
                {selected.scheduled_at > now || !settings?.can_edit || selected.readiness_deadline || (selected.stage && selected.stage !== "scheduled") ? <Badge
                    colors={{ bg: "bg-black/5 dark:bg-white/10", text: "text-black/65 dark:text-white/65" }}
                    className="min-h-9 !rounded-full !px-3 !py-2 !text-sm font-medium !whitespace-normal">
                    {selected.stage === "draft" ? t("groups.tournaments.partnerDraft")
                        : selected.stage === "knockout" ? t("groups.tournaments.knockout")
                        : selected.stage === "completed" ? t("groups.tournaments.completed")
                        : selected.stage === "qualification" ? roundLabel
                        : selected.readiness_deadline ? t("table.queue.waitingChallengers")
                        : selected.scheduled_at > now ? countdown(selected.scheduled_at) : t("groups.tournaments.awaitingAdmin")}
                </Badge> : <Button type="button" inline rounded tonal disabled={starting || deleting} onClick={start} className="h-9 !px-3 !text-sm">
                    {t("groups.tournaments.start")}
                </Button>}
            </div>
            {!!selected.champions?.length && <LobbyRoster groupId={groupId}
                title={t("groups.tournaments.champions")} flush showSeatLocation={false}
                className="mb-5 [&>h2]:!px-1 [&>.k-list]:!mx-0"
                people={selected.champions.map(id => {
                    const member = groupMembers.find(person => person.account_id === id);
                    return { id, name: member?.name ?? id, initialLabel: badges[id]?.label, isHost: false, hasSeat: false };
                })} />}
            {selected.readiness_id && selected.readiness_deadline && selected.awaiting_response && <PostGameDialog
                selfId="self" promptContext={roundLabel}
                transition={{ id: selected.readiness_id, phase: "challenger_checks", seating_blocked: true,
                    previous_seats: [], previous_teams: [], winners: [], proposed_seats: [],
                    players: { self: { decision: "ready", deadline: selected.readiness_deadline / 1000, team_preference: null } } }}
                onRespond={(attempt, response, done) => {
                    request<{ tournament: Tournament }>("tournament:ready", {
                        tournament_id: selected.id, attempt, accepted: "keep_playing" in response && response.keep_playing,
                    }).then(result => { setSelected(result.tournament); done(true); }, () => done(false));
                }} />}
            {standings.length > 0 && <section className="mb-5" aria-label={t("leaderboard.title")}>
                <h2 className="mb-2 px-1 text-xl font-semibold">{t("leaderboard.title")}</h2>
                <LeaderboardContent embedded minimumGames={0} sort={standingSort} page={page}
                    totalPages={standingPages} hasMore={page < standingPages}
                    entries={standings.slice((page - 1) * LEADERBOARD_PAGE_SIZE, page * LEADERBOARD_PAGE_SIZE)}
                    onSortChange={sort => { setStandingSort(sort); setStandingPage(1); }}
                    onPrevious={() => setStandingPage(page - 1)} onNext={() => setStandingPage(page + 1)} />
            </section>}
            {selected.bracket && (["final", "semifinal"] as const).map(stage => {
                const matches = selected.bracket?.filter(match => match.stage === stage) ?? [];
                if (!matches.length) return null;
                return <section key={stage} className="mb-5">
                    <h2 className="mb-2 px-1 text-xl font-semibold">{t(`groups.tournaments.${stage}`)}</h2>
                    <List inset strong className="!m-0">
                        {matches.map((match, index) => <ListItem key={index}
                            link={!!match.table_code} linkComponent="button" linkProps={{ type: "button" }}
                            onClick={match.table_code ? () => enterTable(match.table_code!) : undefined}
                            titleFontSizeIos="text-[17px]" titleFontSizeMaterial="text-[16px]"
                            title={<span className="grid w-full gap-1">
                                {match.pairs.map((pair, side) => <span key={side} className="flex items-center gap-2">
                                    <span className="min-w-0 flex-1 whitespace-normal">{pair?.map(id => groupMembers.find(member => member.account_id === id)?.name ?? id).join(" & ")
                                        ?? t("groups.tournaments.semifinalWinner", { number: side + 1 })}</span>
                                    {match.games?.map((points, game) => <span key={game}
                                        aria-label={t("groups.tournaments.gameScore", { game: game + 1, score: points[side] })}
                                        className="w-7 shrink-0 text-right text-sm tabular-nums text-black/55 dark:text-white/55">
                                        {points[side]}
                                    </span>)}
                                    {match.scores && <span
                                        aria-label={t("groups.tournaments.seriesWins", { wins: match.scores[side] })}
                                        className="w-6 shrink-0 text-right font-semibold tabular-nums">{match.scores[side]}</span>}
                                </span>)}
                            </span>} />)}
                    </List>
                </section>;
            })}
            {selected.draft_prompt && <PostGameDialog
                selfId="self" promptContext={t("groups.tournaments.partnerDraft")}
                memberNames={Object.fromEntries(groupMembers.map(member => [member.account_id, member.name]))}
                transition={{ id: String(selected.draft_prompt.deadline), phase: "partner_selection", seating_blocked: true,
                    previous_seats: [], previous_teams: [], winners: [], proposed_seats: [],
                    selection_candidates: selected.draft_prompt.candidates,
                    players: { self: { decision: selected.draft_prompt.decision, deadline: selected.draft_prompt.deadline / 1000, team_preference: null } } }}
                onRespond={(_, response, done) => {
                    request<{ tournament: Tournament }>("tournament:draft", {
                        tournament_id: selected.id, slot: selected.draft_prompt?.slot,
                        player: "selected_player" in response ? response.selected_player : undefined,
                        accepted: "keep_playing" in response && response.keep_playing,
                    }).then(result => { setSelected(result.tournament); done(true); }, () => done(false));
                }} />}
            {selected.can_enter_late && <Button type="button" inline rounded tonal disabled={starting} onClick={joinLate}>
                {t("table.queue.join")}
            </Button>}
            {(selected.stage === "qualification" || selected.stage === "knockout") && <>
                {selected.assignment && selected.assignment.id !== dismissedAssignment && selected.assignment.deadline > now && <PostGameDialog
                    selfId="self" promptContext={roundLabel}
                    transition={{ id: selected.assignment.id, phase: "challenger_checks", seating_blocked: true,
                        previous_seats: [], previous_teams: [], winners: [], proposed_seats: [],
                        players: { self: { decision: "ready", deadline: selected.assignment.deadline / 1000, team_preference: null } } }}
                    onRespond={(id, response, done) => {
                        if ("keep_playing" in response && response.keep_playing && selected.assignment) {
                            enterTable(selected.assignment.table_code, done);
                        } else { setDismissedAssignment(id); done(true); }
                    }} />}
                {selected.stage === "qualification" && <TableCards tables={(selected.tables ?? []).map(table => ({ ...table, group_id: groupId }))} getKey={table => table.instance_id}
                    isClosing={() => false} onClosed={() => {}} onEnter={table => enterTable(table.table_code)}
                    showCreate={false} creating={false} onCreate={() => {}} createLabel="" />}
            </>}
            {(!selected.stage || selected.stage === "scheduled") && <>
                <section className="mb-6" aria-label={t("groups.tournaments.yourResponse")}>
                    <div className="mb-2 flex min-h-5 items-center justify-between gap-2 px-1 text-sm text-black/55 dark:text-white/55">
                        <span>{t("groups.tournaments.yourResponse")}</span>
                        <span role="status" className="flex items-center gap-2">
                            {savingIntent && <><Preloader className="h-4 w-4" />{t("groups.tournaments.savingResponse")}</>}
                        </span>
                    </div>
                    <Segmented strong rounded className="w-full" role="group" aria-busy={savingIntent} aria-label={t("groups.tournaments.yourResponse")}>
                        {(["yes", "maybe", "no"] as const).map(response => <SegmentedButton key={response}
                            type="button" active={selected.attendance_response === response}
                            aria-pressed={selected.attendance_response === response} disabled={savingIntent}
                            onClick={() => saveIntent(response)}>{t(`groups.tournaments.response.${response}`)}</SegmentedButton>)}
                    </Segmented>
                </section>
                <div className="flex justify-center">
                    <InviteButton onInvite={handleInvite} inviteCopied={inviteCopied} />
                </div>
                <TableInviteDialog shareText={inviteText} fallbackInviteUrl={fallbackInviteUrl} onCloseInviteFallback={closeInviteFallback} />
                <section aria-label={t("groups.tournaments.attendance")}>
                    {attendancePeople.length > 0 ? <LobbyRoster groupId={groupId} people={attendancePeople} flush showSeatLocation={false}
                        title={t("groups.tournaments.attendance")} className="[&>h2]:!px-1 [&>p]:!px-1 [&>.k-list]:!mx-0"
                        subtitle={t("groups.tournaments.attendanceSummary", {
                            yes: selected.attendance_intent_count ?? 0,
                            maybe: selected.attendance_maybe_count ?? 0,
                            no: roster.filter(person => person.response === "no").length,
                        })} />
                        : <p className="px-1 text-sm text-black/55 dark:text-white/55">{t("groups.tournaments.noResponses")}</p>}
                </section>
            </>}
            {canDelete && <div className="mt-4 px-1">
                <Button type="button" inline clear className="!text-red-600 dark:!text-red-400"
                    disabled={starting || deleting} onClick={() => setDeleteTarget(selected.id)}>
                    {t("groups.tournaments.delete")}
                </Button>
            </div>}
            <Dialog opened={canDelete && deleteTarget === selected.id} title={t("groups.tournaments.delete")}
                content={t("groups.tournaments.deleteConfirm")}
                buttons={<>
                    <DialogButton disabled={deleting} onClick={() => setDeleteTarget(null)}>
                        {t("groups.tournaments.cancel")}
                    </DialogButton>
                    <DialogButton disabled={deleting} className="!text-red-600 dark:!text-red-400"
                        onClick={deleteTournament}>{t("groups.tournaments.deleteShort")}</DialogButton>
                </>} />
        </> : null : <section>
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
                <h2 className="text-[22px] font-bold">{t("groups.tournaments.upcoming")}</h2>
                <div className="h-11 w-11 shrink-0">
                    {(!settings || settings.can_edit) && <Button rounded inline aria-label={t("groups.tournaments.create")}
                        disabled={!settings || !settings.can_edit || tournaments === null}
                        className="h-11 w-11 !px-0" onClick={() => navigate(`${groupUrl}/tournaments/new`)}><Plus size={22} /></Button>}
                </div>
            </div>
            {tournaments === null ? !error && <Glass highlight={false} colors={{ shadowIos: glassWithoutLightInsetShadow }} className="overflow-hidden rounded-[28px]">
                    <div role="status" aria-label={t("groups.tournaments.loading")} className="px-5 py-5 sm:px-6">
                        <div aria-hidden="true" className="motion-safe:animate-pulse">
                            <div className="h-7 w-44 rounded bg-black/10 dark:bg-white/10" />
                            <div className="mt-1 h-5 w-36 rounded bg-black/10 dark:bg-white/10" />
                            <div className="mt-1 h-5 w-28 rounded bg-black/10 dark:bg-white/10" />
                        </div>
                    </div>
                </Glass>
                : tournaments.length ? <Glass highlight={false} colors={{ shadowIos: glassWithoutLightInsetShadow }} className="overflow-hidden rounded-[28px]">
                    <ul className="divide-y divide-black/10 dark:divide-white/10">
                        {tournaments.map(item => <li key={item.id}>
                            <Link to={`${groupUrl}/tournaments/${encodeURIComponent(item.id)}`}
                                aria-label={`${t("groups.tournaments.open", { date: formatDate(item.scheduled_at) })}, ${countdown(item.scheduled_at)}, ${item.attendance_intent_count == null ? t("groups.tournaments.attendanceUnknown") : t("groups.tournaments.attending", { count: item.attendance_intent_count })}, ${t("groups.tournaments.maybeCount", { count: item.attendance_maybe_count ?? 0 })}`}
                                className="block px-5 py-5 text-inherit no-underline focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-black dark:focus-visible:outline-white active:opacity-70 sm:px-6">
                                <h3 className="text-xl font-semibold text-black dark:text-white">
                                    {formatTitleDate(item.scheduled_at)}
                                </h3>
                                <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-black/55 dark:text-white/55">
                                    <span>{formatTime(item.scheduled_at)}</span>
                                    <span aria-hidden="true">|</span>
                                    <span className="tabular-nums">{countdown(item.scheduled_at)}</span>
                                </p>
                                <p className="mt-1 text-sm tabular-nums text-black/55 dark:text-white/55">
                                    {t("groups.tournaments.attendanceListSummary", {
                                        yes: item.attendance_intent_count ?? 0, maybe: item.attendance_maybe_count ?? 0,
                                    })}
                                </p>
                            </Link>
                        </li>)}
                    </ul>
                </Glass> : !error && <p className="px-1 text-black/55 dark:text-white/55">{t("groups.tournaments.empty")}</p>}
        </section>}
    </>;
}
