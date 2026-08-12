/**
 * SessionContext.tsx
 * Author: Oliver Alonzo
 * Supported by ChatGPT (GPT-5)
 * Date: 2026-05-31
 * Version: 0.2
 *
 * Tab-scoped client session identity provider.
 *
 * Responsibilities:
 * - Create or load a stable client_session_id for this browser tab.
 * - Persist it in sessionStorage so refreshes preserve identity.
 * - Persist the last-used display name for easier table entry.
 * - Expose session identity values to downstream providers.
 */

import {
    createContext,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from "react";

const SESSION_STORAGE_KEY = "game-table:clientSessionId";
const DISPLAY_NAME_STORAGE_KEY = "game-table:displayName";
const LEGACY_SESSION_STORAGE_KEY = "doble6:clientSessionId";
const LEGACY_DISPLAY_NAME_STORAGE_KEY = "doble6:displayName";

type SessionContextValue = {
    clientSessionId: string;
    displayName: string;
    setDisplayName: (name: string) => void;
};

const SessionContext = createContext<SessionContextValue | undefined>(
    undefined
);

function getOrCreateClientSessionId(): string {
    const existing = sessionStorage.getItem(SESSION_STORAGE_KEY)
        ?? sessionStorage.getItem(LEGACY_SESSION_STORAGE_KEY);
    if (existing) return existing;

    const browserCrypto = globalThis.crypto;
    const id =
        browserCrypto?.randomUUID?.() ??
        `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(SESSION_STORAGE_KEY, id);
    return id;
}

function getSavedDisplayName(): string {
    return localStorage.getItem(DISPLAY_NAME_STORAGE_KEY)
        ?? localStorage.getItem(LEGACY_DISPLAY_NAME_STORAGE_KEY)
        ?? "";
}

export function SessionProvider({ children }: { children: ReactNode }) {
    const clientSessionId = useMemo(
        () => getOrCreateClientSessionId(),
        []
    );

    const [displayName, setDisplayNameState] = useState(
        () => getSavedDisplayName()
    );

    function setDisplayName(name: string) {
        setDisplayNameState(name);
        localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, name);
    }

    return (
        <SessionContext.Provider
            value={{
                clientSessionId,
                displayName,
                setDisplayName,
            }}
        >
            {children}
        </SessionContext.Provider>
    );
}

export function useSession() {
    const ctx = useContext(SessionContext);
    if (!ctx) {
        throw new Error("useSession must be used within SessionProvider");
    }
    return ctx;
}
