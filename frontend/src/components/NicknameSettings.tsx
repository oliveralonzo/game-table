import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Shuffle } from "lucide-react";
import { Button, List, ListItem } from "konsta/react";
import { generateNickname } from "game-table/utils/nicknameGenerator";
import { backendErrorToJoinKey } from "game-table/i18n/backendErrors";
import { useTable } from "game-table/context/TableState";
import { useTableSocket } from "game-table/context/TableSocket";
import { getBadgeOptions, getSavedBadge, saveBadge, DISPLAY_NAME_MAX_LENGTH, getNameInitials } from "game-table/utils/playerInitialLabels";

export type NicknameChangeHandler = (
    name: string,
    onSuccess?: () => void,
    onError?: (message: string, code?: string) => void,
) => void;

type Props = {
    value: string;
    onDraftChange?: (name: string) => void;
    onChange: NicknameChangeHandler;
    showGenerator?: boolean;
    compact?: boolean;
    heading?: string;
    editRequested?: boolean;
    showDone?: boolean;
    generatorIcon?: boolean;
};

export default function NicknameSettings({
    value,
    onDraftChange,
    onChange,
    showGenerator = false,
    compact = false,
    heading,
    editRequested = false,
    showDone = true,
    generatorIcon = false,
}: Props) {
    const { t, i18n } = useTranslation();
    const { state } = useTable();
    const { updateBadge } = useTableSocket();
    const member = state.selfMemberId ? state.tableView?.members[state.selfMemberId] : undefined;
    const savedBadge = member?.name === value ? member.badge_label : getSavedBadge(value);
    const [badge, setBadge] = useState(savedBadge ?? getNameInitials(value));
    const [draft, setDraft] = useState(value);
    const [editing, setEditing] = useState(editRequested || !value.trim());
    const options = getBadgeOptions(draft);
    const visibleBadge = options.includes(badge) ? badge : options[0] ?? "?";
    const [error, setError] = useState<string | null>(null);
    const latestDraftRef = useRef(draft);
    const latestValueRef = useRef(value);
    const onChangeRef = useRef(onChange);
    const lastSubmittedRef = useRef<string | null>(null);
    const pendingBadge = useRef<{ name: string; option: string } | null>(null);
    const badgeSaving = useRef(false);
    const confirmedBadge = useRef({ name: value, option: savedBadge ?? getNameInitials(value) });

    useEffect(() => {
        if (editRequested) setEditing(true);
    }, [editRequested]);

    useEffect(() => {
        setDraft(value);
        confirmedBadge.current = { name: value, option: savedBadge ?? getNameInitials(value) };
        if (pendingBadge.current?.name !== value) {
            setBadge(savedBadge ?? getNameInitials(value));
        }
        latestDraftRef.current = value;
        latestValueRef.current = value;
    }, [value, savedBadge]);

    useEffect(() => {
        onChangeRef.current = onChange;
    }, [onChange]);

    useEffect(() => () => {
        const trimmed = latestDraftRef.current.trim();
        if (
            trimmed &&
            trimmed !== latestValueRef.current &&
            trimmed !== lastSubmittedRef.current
        ) {
            onChangeRef.current(trimmed);
        }
    }, []);

    const save = (name: string, onSaved?: () => void) => {
        const trimmed = name.trim();
        if (Array.from(trimmed).length > DISPLAY_NAME_MAX_LENGTH) {
            setError(t("table.status.nameTooLong", { count: DISPLAY_NAME_MAX_LENGTH }));
            return;
        }
        if (!trimmed) {
            setError(t("table.status.nameRequired"));
            return;
        }
        if (trimmed === value) { onSaved?.(); return; }

        lastSubmittedRef.current = trimmed;

        onChange(
            trimmed,
            () => { setError(null); onSaved?.(); },
            (message, code) => setError(t(backendErrorToJoinKey(code, message))),
        );
    };

    const savePendingBadge = () => {
        const request = pendingBadge.current;
        if (!request || badgeSaving.current) return;
        badgeSaving.current = true;
        const settle = (message?: string) => {
            badgeSaving.current = false;
            if (!message) {
                confirmedBadge.current = request;
                saveBadge(request.name, request.option);
            }
            // Serialize saves so fast clicks cannot leave the database on an
            // older choice. The newest selection remains visible throughout.
            if (pendingBadge.current !== request) { savePendingBadge(); return; }
            pendingBadge.current = null;
            if (message) {
                setBadge(confirmedBadge.current.name === request.name
                    ? confirmedBadge.current.option : getNameInitials(request.name));
                setError(message);
            } else {
                setBadge(request.option);
                setError(null);
            }
        };
        const apply = () => updateBadge(request.name, request.option, () => settle(), settle);
        if (request.name !== latestValueRef.current) onChangeRef.current(request.name, apply, settle);
        else apply();
    };

    const selectBadge = (option: string) => {
        setBadge(option);
        setError(null);
        pendingBadge.current = { name: draft.trim(), option };
        savePendingBadge();
    };

    const editAction = editing && !showDone ? null : (
        <Button type="button" inline clear small rounded className={`absolute z-10 h-8 !px-2 normal-case ${compact ? "-right-2 -top-1" : "right-1 top-1"}`}
            aria-label={editing ? t("table.action.done") : t("table.action.editProfile")}
            onClick={() => editing ? save(draft, () => setEditing(false)) : setEditing(true)}>
            {t(editing ? "table.action.done" : "table.action.edit")}
        </Button>
    );

    const editor = (
        <div className={`relative grid w-full min-w-0 gap-2 ${compact ? "py-1" : "p-3"}`}>
            {editAction}
            <span className="pr-16 text-xs font-medium text-black/45 dark:text-white/45">{t("table.label.displayName")}</span>
            <label className="grid gap-1.5">
                <span className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
                    <span
                        aria-hidden="true"
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-sm font-medium tabular-nums text-black ring-1 ring-inset ring-[#A97142] dark:bg-white dark:text-black dark:ring-[#A97142]"
                    >
                        {visibleBadge}
                    </span>
                    <span className={`grid min-w-0 gap-2 ${showGenerator ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-1"}`}>
                        <input
                            aria-label={t("table.label.displayName")}
                            maxLength={DISPLAY_NAME_MAX_LENGTH}
                            value={draft}
                            onChange={(event) => {
                                const nextDraft = event.target.value;
                                setDraft(nextDraft);
                                latestDraftRef.current = nextDraft;
                                onDraftChange?.(nextDraft);
                            }}
                            onBlur={() => save(draft)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") event.currentTarget.blur();
                            }}
                            className="h-11 min-w-0 rounded-2xl bg-ios-light-surface-2 px-4 text-[17px] text-black outline-none ring-1 ring-inset ring-black/10 transition focus:ring-2 focus:ring-primary dark:bg-ios-dark-surface-2 dark:text-white dark:ring-white/15"
                        />
                        {showGenerator ? (
                            <Button
                                type="button"
                                tonal
                                rounded
                                title={t("join.action.generate")}
                                aria-label={t("join.action.generate")}
                                className={generatorIcon ? "h-11 w-11 shrink-0 !px-0" : "h-11 min-w-24 px-3 font-semibold"}
                                onClick={() => {
                                    const generated = generateNickname(i18n.language);
                                    setDraft(generated);
                                    latestDraftRef.current = generated;
                                    onDraftChange?.(generated);
                                    save(generated);
                                }}
                            >
                                {generatorIcon ? <Shuffle size={18} strokeWidth={2} /> : t("join.action.generate")}
                            </Button>
                        ) : null}
                    </span>
                </span>
            </label>
            {options.length > 0 ? <fieldset className="min-w-0">
                <legend className="mb-2 text-xs font-medium text-black/45 dark:text-white/45">{t("table.label.badge")}</legend>
                <div role="radiogroup" aria-label={t("table.label.badge")} className="flex flex-wrap gap-2">
                    {options.map(option => <button key={option} type="button" role="radio"
                        aria-checked={visibleBadge === option} aria-label={t("table.label.badgeOption", { badge: option })}
                        className={`grid h-10 min-w-10 place-items-center rounded-full px-2 text-sm font-medium ring-1 ${visibleBadge === option ? "bg-primary text-white ring-primary" : "bg-ios-light-surface-2 text-black ring-black/10 dark:bg-ios-dark-surface-2 dark:text-white dark:ring-white/15"}`}
                        onMouseDown={event => event.preventDefault()}
                        onClick={() => selectBadge(option)}>{option}</button>)}
                </div>
            </fieldset> : null}
            {error ? <span className="text-xs text-red-500">{error}</span> : null}
        </div>
    );

    const content = editing ? editor : (
        <div className={`relative grid w-full min-w-0 gap-2 ${compact ? "py-1" : "p-3"}`}>
            {editAction}
            <span className="pr-16 text-xs font-medium text-black/45 dark:text-white/45">{t("table.label.displayName")}</span>
            <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden="true" className="grid h-10 min-w-10 shrink-0 place-items-center rounded-full bg-white px-2 text-sm font-medium text-black ring-1 ring-inset ring-[#A97142]">{visibleBadge}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-black dark:text-white">{value}</span>
            </div>
        </div>
    );

    return (
        <section className="grid min-w-0 gap-2">
            {heading ? <h3 className={`${compact ? "" : "px-safe-4"} text-xs font-semibold uppercase text-black/45 dark:text-white/45`}>{heading}</h3> : null}
            <div className="relative min-w-0">

            {compact ? content : (
                <List inset nested={false} outline strong className="m-0 overflow-hidden">
                    <ListItem title={content} strongTitle={false} titleWrapClassName="w-full [&>div]:w-full" />
                </List>
            )}
            </div>
        </section>
    );
}
