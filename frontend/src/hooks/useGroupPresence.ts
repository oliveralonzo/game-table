import { useEffect } from "react";
import { useAuthSession } from "game-table/context/AuthSessionContext";
import { useGroupsCache } from "game-table/context/GroupsCacheContext";
import { useTableSocket } from "game-table/context/TableSocket";

export function useGroupPresence(groupId: string | null) {
    const { getAuthToken, isSignedIn } = useAuthSession();
    const { updateGroupPresence, leaveGroupPresence, groupConnectionVersion } = useTableSocket();
    const { savePresence } = useGroupsCache();
    useEffect(() => {
        savePresence(null);
        if (!groupId || !isSignedIn) return;
        let current = true;
        let busy = false;
        let requestVersion = 0;
        let requestTimeout: number | undefined;
        const refresh = async () => {
            if (!current || busy) return;
            busy = true;
            const version = ++requestVersion;
            const accept = () => current && version === requestVersion;
            requestTimeout = window.setTimeout(() => {
                ++requestVersion;
                busy = false;
                savePresence(null);
            }, 12000);
            const finish = () => {
                window.clearTimeout(requestTimeout);
                busy = false;
            };
            try {
                const token = await getAuthToken();
                if (!accept()) return;
                if (!token) { finish(); savePresence(null); return; }
                updateGroupPresence(token, groupId, response => {
                    if (!accept()) return;
                    finish();
                    savePresence("error" in response ? null : response);
                });
            } catch {
                if (!accept()) return;
                finish();
                savePresence(null);
            }
        };
        void refresh();
        const interval = window.setInterval(refresh, 15000);
        window.addEventListener("focus", refresh);
        return () => {
            current = false;
            window.clearInterval(interval);
            window.clearTimeout(requestTimeout);
            window.removeEventListener("focus", refresh);
            leaveGroupPresence(groupId);
            savePresence(null);
        };
    }, [groupId, isSignedIn, getAuthToken, updateGroupPresence, leaveGroupPresence, groupConnectionVersion, savePresence]);
}
