/**
 * clientId.ts
 * Author: Oliver Alonzo
 * Supported by ChatGPT (GPT-5)
 * Date: 2025-08-10
 * Version: 1.0
 *
 * Generates and persists a stable, per-device client identifier.
 * - Uses localStorage (browser-only).
 * - Prefers crypto.randomUUID(); includes a UUID-like fallback.
 * - Caches in-memory to avoid repeated storage reads.
 */

const STORAGE_KEY = "game-table.clientId";
const LEGACY_STORAGE_KEY = "doble6.clientId";

let cachedClientId: string | null = null;

function isBrowser(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readStored(): string | null {
    if (!isBrowser()) return null;
    try {
        const v = window.localStorage.getItem(STORAGE_KEY)
            ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
        return v && v.trim().length > 0 ? v : null;
    } catch {
        return null;
    }
}

function writeStored(id: string): void {
    if (!isBrowser()) return;
    try {
        window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
        // Ignore write failures (e.g., storage disabled)
    }
}

export function createClientId(): string {
    // Prefer native
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    // UUID v4-like fallback (not cryptographically strong)
    const rnd = (n = 16) =>
        Array.from({ length: n }, () =>
            Math.floor(Math.random() * 16).toString(16)
        ).join("");

    // xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx (y: 8|9|A|B)
    const y = ((Math.random() * 4) | 8).toString(16);
    return `${rnd(8)}-${rnd(4)}-4${rnd(3)}-${y}${rnd(3)}-${rnd(12)}`;
}

/**
 * Returns a stable clientId (generates and persists if missing).
 * Safe to call on both server and client; on the server it returns
 * an ephemeral ID (not persisted) and caches in-memory for that process.
 */
export function getClientId(): string {
    if (cachedClientId) return cachedClientId;

    // Try storage (browser)
    const stored = readStored();
    if (stored) {
        cachedClientId = stored;
        return cachedClientId;
    }

    // Create new
    const fresh = createClientId();
    cachedClientId = fresh;
    writeStored(fresh);
    return cachedClientId;
}

/**
 * Clears the cached value (mainly for tests). Does not remove from storage.
 */
export function _resetClientIdCacheForTests(): void {
    cachedClientId = null;
}
