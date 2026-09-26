import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthSession } from "game-table/context/AuthSessionContext";
import { useTableSocket } from "game-table/context/TableSocket";
import { useGroupsCache } from "game-table/context/GroupsCacheContext";
import { groupActivityKey } from "game-table/types/groupActivity";

export function useGroupActivity(groupId: string, season = "current", page = 1, enabled = true) {
    const { getAuthToken, authUserId } = useAuthSession();
    const { getGroupActivity, groupConnectionVersion } = useTableSocket();
    const { activity, saveActivity, clearGroupActivity } = useGroupsCache();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const key = groupActivityKey(groupId, season, page);
    const data = activity[key];
    const [refresh, setRefresh] = useState(0);
    const retry = useCallback(() => setRefresh(value => value + 1), []);
    const [status, setStatus] = useState({ key, loading: true, error: null as string | null });
    useEffect(() => {
        if (!enabled) return;
        window.addEventListener("focus", retry);
        return () => window.removeEventListener("focus", retry);
    }, [retry, enabled]);
    useEffect(() => {
        if (!enabled) return;
        let current = true;
        setStatus({ key, loading: true, error: null });
        const fail = () => {
            if (!current) return;
            current = false;
            setStatus({ key, loading: false, error: t("groups.stats.loadError") });
        };
        const timeout = window.setTimeout(fail, 15000);
        getAuthToken().then(token => {
            if (!current) return;
            if (!token) { window.clearTimeout(timeout); fail(); return; }
            getGroupActivity(token, groupId, season, page, response => {
                if (!current) return;
                window.clearTimeout(timeout);
                if ("error" in response) {
                    if (response.code === "GROUP_ACCESS_DENIED") {
                        clearGroupActivity(groupId);
                        navigate("/?tab=groups", { replace: true, state: { groupOpenFailed: true, authUserId } });
                    }
                    fail();
                    return;
                }
                current = false;
                saveActivity(key, response);
                setStatus({ key, loading: false, error: null });
            });
        }).catch(() => { window.clearTimeout(timeout); fail(); });
        return () => { current = false; window.clearTimeout(timeout); };
    }, [enabled, groupId, season, page, key, getAuthToken, getGroupActivity, groupConnectionVersion, refresh, saveActivity, clearGroupActivity, navigate, authUserId, t]);
    return { data, loading: enabled && (status.key !== key || status.loading), error: status.key === key ? status.error : null, retry };
}
