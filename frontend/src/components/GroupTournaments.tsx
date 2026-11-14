import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AppLoadingScreen from "game-table/components/AppLoadingScreen";
import TableIdentityBadge from "game-table/components/TableIdentityBadge";
import { Badge, Button, Glass, ListItem, Preloader, Segmented, SegmentedButton } from "konsta/react";
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

type Tournament = { id: string; scheduled_at: number; rules: unknown; status: "scheduled"; attendance_intent_count?: number | null; attendance_intent?: boolean; attendance_response?: "yes" | "maybe" | "no" | null; attendance_maybe_count?: number; attendance_roster?: AttendancePerson[] };
type GroupSettings = { rules: unknown; can_edit: boolean };

export default function GroupTournaments({ groupId, groupUrl, groupName, groupMembers, gamePlugin }: {
    groupId: string; groupUrl: string; groupName: string; groupMembers: GroupMember[]; gamePlugin: FrontendGamePlugin;
}) {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { tournamentId } = useParams();
    const { getAuthToken } = useAuthSession();
    const { emit, on, off, groupConnectionVersion } = useTableSocket();
    const [settings, setSettings] = useState<GroupSettings | null>(null);
    const [tournaments, setTournaments] = useState<Tournament[] | null>(null);
    const [selected, setSelected] = useState<Tournament | null>(null);
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
        const timer = window.setInterval(update, 10000);
        window.addEventListener("focus", update);
        return () => { window.clearInterval(timer); window.removeEventListener("focus", update); };
    }, [isCreating]);
    const countdown = (scheduledAt: number) => {
        if (scheduledAt <= now) return t("groups.tournaments.awaitingStart");
        const minutes = Math.ceil((scheduledAt - now) / 60000);
        const parts = [
            ["day", Math.floor(minutes / 1440)],
            ["hour", Math.floor(minutes % 1440 / 60)],
            ["minute", minutes % 60],
        ] as const;
        const duration = parts.filter(([, value]) => value > 0).map(([unit, value]) =>
            new Intl.NumberFormat(i18n.language, { style: "unit", unit, unitDisplay: "narrow" }).format(value)
        ).join(" ");
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
    const SettingsPanel = gamePlugin.SettingsPanel;
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
    const initialLoading = !error && (!settings || (tournamentId && !isCreating
        ? selected?.id !== tournamentId : !isCreating && tournaments === null));
    if (initialLoading) return createPortal(<div className="fixed inset-0 z-50"><AppLoadingScreen /></div>, document.body);
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
                {selected.scheduled_at > now || !settings?.can_edit ? <Badge
                    colors={{ bg: "bg-black/5 dark:bg-white/10", text: "text-black/65 dark:text-white/65" }}
                    className="min-h-9 !rounded-full !px-3 !py-2 !text-sm font-medium !whitespace-normal">
                    {selected.scheduled_at > now ? countdown(selected.scheduled_at) : t("groups.tournaments.awaitingAdmin")}
                </Badge> : <Button type="button" inline rounded tonal disabled className="h-9 !px-3 !text-sm">
                    {t("groups.tournaments.start")}
                </Button>}
            </div>
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
            <section aria-label={t("groups.tournaments.attendance")}>
                {attendancePeople.length > 0 ? <LobbyRoster people={attendancePeople} flush showSeatLocation={false}
                    title={t("groups.tournaments.attendance")} className="[&>h2]:!px-1 [&>p]:!px-1 [&>.k-list]:!mx-0"
                    subtitle={t("groups.tournaments.attendanceSummary", {
                        yes: selected.attendance_intent_count ?? 0,
                        maybe: selected.attendance_maybe_count ?? 0,
                        no: roster.filter(person => person.response === "no").length,
                    })} />
                    : <p className="px-1 text-sm text-black/55 dark:text-white/55">{t("groups.tournaments.noResponses")}</p>}
            </section>
            <SettingsPanel value={gamePlugin.resolveSettings(selected.rules)} readOnly isFourPlayer seatCount={4} gameOnly collapsible={false} flush
                title={t("groups.tournaments.games")} gameSettingsSubtitle={t("groups.tournaments.configuration")} sections={{ profile: false, display: false, language: false }} />

        </> : null : <section>
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
                <h2 className="text-[22px] font-bold">{t("groups.tournaments.upcoming")}</h2>
                <div className="h-11 w-11 shrink-0">
                    {(!settings || settings.can_edit) && <Button rounded inline aria-label={t("groups.tournaments.create")}
                        disabled={!settings || !settings.can_edit || tournaments === null}
                        className="h-11 w-11 !px-0" onClick={() => navigate(`${groupUrl}/tournaments/new`)}><Plus size={22} /></Button>}
                </div>
            </div>
            {tournaments === null ? null
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
