import { List } from "konsta/react";
import SettingsSelectionItem from "game-table/components/SettingsSelectionItem";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FrontendGamePlugin } from "game-table/gamePlugin";
import type { NicknameChangeHandler } from "game-table/components/NicknameSettings";
import PlatformSettingsPanel from "game-table/components/PlatformSettingsPanel";
import DismissibleNotice from "game-table/components/DismissibleNotice";
import { useAuthSession } from "game-table/context/AuthSessionContext";
import { useTableSocket } from "game-table/context/TableSocket";

type Settings = { rules: unknown; seat_count: number; can_edit: boolean };
export default function GroupSettingsPanel({ groupId, gamePlugin, displayName, onDisplayNameChange }: {
    groupId: string; gamePlugin: FrontendGamePlugin; displayName: string; onDisplayNameChange: NicknameChangeHandler;
}) {
    const { t } = useTranslation();
    const { getAuthToken } = useAuthSession();
    const { emit } = useTableSocket();
    const [settings, setSettings] = useState<Settings | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [nested, setNested] = useState(false);
    const latest = useRef<Settings | null>(null);
    const queued = useRef<Settings | null>(null);
    const saving = useRef(false);
    const mounted = useRef(true);
    const request = async (event: string, data: object = {}) => {
        const token = await getAuthToken();
        if (!token) throw new Error();
        return new Promise<Settings>((resolve, reject) => {
            const timer = window.setTimeout(() => reject(new Error()), 12000);
            emit(event, { token, group_id: groupId, ...data }, (response: Settings | { error: string }) => {
                window.clearTimeout(timer);
                if (!response || "error" in response) reject(new Error()); else resolve(response);
            });
        });
    };
    useEffect(() => {
        mounted.current = true;
        let current = true;
        request("group:settings").then(value => {
            if (current) { latest.current = value; setSettings(value); }
        }).catch(() => { if (current) setError(t("groups.settings.loadError")); });
        return () => { current = false; mounted.current = false; };
    }, [groupId, getAuthToken, emit]);
    const save = async (patch: Partial<Settings>) => {
        if (!latest.current?.can_edit) return;
        const value = { ...latest.current, ...patch };
        latest.current = value;
        queued.current = value;
        setSettings(value);
        setError(null);
        if (saving.current) return;
        saving.current = true;
        try {
            while (queued.current) {
                const next = queued.current;
                queued.current = null;
                const saved = await request("group:update_settings", { rules: next.rules, seat_count: next.seat_count });
                if (!queued.current) {
                    latest.current = saved;
                    if (mounted.current) setSettings(saved);
                }
            }
        } catch {
            queued.current = null;
            if (mounted.current) setError(t("groups.settings.saveError"));
            try {
                const saved = await request("group:settings");
                latest.current = saved;
                if (mounted.current) setSettings(saved);
            } catch { /* Keep the notice if the connection is still unavailable. */ }
        } finally { saving.current = false; }
    };
    const SettingsPanel = gamePlugin.SettingsPanel;
    const rules = gamePlugin.resolveSettings(settings?.rules ?? gamePlugin.defaultSettings);
    const supportsRatings = typeof rules === "object" && rules !== null &&
        "rated_games" in rules && typeof rules.rated_games === "boolean" &&
        "show_ratings" in rules && typeof rules.show_ratings === "boolean";
    const toggleRatingSetting = (key: "show_ratings" | "rated_games") => {
        const current = { ...Object(rules), ...Object(latest.current?.rules) };
        void save({ rules: { ...current, [key]: current[key] !== true } });
    };
    const ratingsPane = supportsRatings ? {
        title: t("table.label.ratingsHeading"),
        content: <>
            <List inset nested={false} outline strong className="m-0 overflow-hidden">
                <SettingsSelectionItem type="checkbox" title={t("table.label.showRatings")}
                    checked={rules.show_ratings === true} disabled={!settings?.can_edit}
                    onChange={() => toggleRatingSetting("show_ratings")} />
                <SettingsSelectionItem type="checkbox" title={t("table.label.ratedGames")}
                    checked={rules.rated_games === true} disabled={!settings?.can_edit}
                    onChange={() => toggleRatingSetting("rated_games")} />
            </List>
            {settings && <p className="m-0 px-safe-4 text-sm opacity-65" aria-live="polite">
                {t(rules.show_ratings
                    ? rules.rated_games ? "table.label.ratingsBoth" : "table.label.ratingsShow"
                    : rules.rated_games ? "table.label.ratingsUpdate" : "table.label.ratingsNeither")}
            </p>}
        </>,
    } : undefined;
    return <>
        <PlatformSettingsPanel displayName={displayName} onDisplayNameChange={onDisplayNameChange} routed extraPane={ratingsPane}
            gameSettingsNested={nested} renderGameSettings={gamePlugin.features.settings ? afterGameRow => <SettingsPanel
                afterGameRow={afterGameRow}
                value={rules} onChange={(rules: unknown) => save({ rules })}
                readOnly={!settings?.can_edit} gameSettingsLoading={!settings}
                isFourPlayer={(settings?.seat_count ?? 4) === 4} seatCount={settings?.seat_count ?? 4}
                onAddSeat={() => save({ seat_count: Math.min(4, (latest.current?.seat_count ?? 4) + 1) })}
                onRemoveSeat={() => save({ seat_count: Math.max(2, (latest.current?.seat_count ?? 4) - 1) })}
                title={t("table.label.game")} showHeading={false} flush collapsible={false} embeddedGamePane
                onNestedNavigationChange={setNested} sections={{ profile: false, language: false }} /> : undefined} />
        {error && <DismissibleNotice onDismiss={() => setError(null)}>{error}</DismissibleNotice>}
    </>;
}
