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
    return <>
        <PlatformSettingsPanel displayName={displayName} onDisplayNameChange={onDisplayNameChange} routed
            gameSettingsNested={nested} showLanguage={!gamePlugin.features.settings} gameSettings={gamePlugin.features.settings ? <SettingsPanel
                value={gamePlugin.resolveSettings(settings?.rules ?? gamePlugin.defaultSettings)} onChange={(rules: unknown) => save({ rules })}
                readOnly={!settings?.can_edit} gameSettingsLoading={!settings}
                isFourPlayer={(settings?.seat_count ?? 4) === 4} seatCount={settings?.seat_count ?? 4}
                onAddSeat={() => save({ seat_count: Math.min(4, (latest.current?.seat_count ?? 4) + 1) })}
                onRemoveSeat={() => save({ seat_count: Math.max(2, (latest.current?.seat_count ?? 4) - 1) })}
                title={t("table.label.game")} showHeading={false} flush collapsible={false} embeddedGamePane
                onNestedNavigationChange={setNested} sections={{ profile: false, language: true }} /> : undefined} />
        {error && <DismissibleNotice onDismiss={() => setError(null)}>{error}</DismissibleNotice>}
    </>;
}
