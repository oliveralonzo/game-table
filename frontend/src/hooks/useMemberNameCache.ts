import { useEffect, useMemo, useState } from "react";

import type { TableMember } from "game-table/types/table";

function readNameCache(storageKey: string | null): Record<string, string> {
    if (!storageKey) return {};

    try {
        return JSON.parse(sessionStorage.getItem(storageKey) ?? "{}");
    } catch {
        sessionStorage.removeItem(storageKey);
        return {};
    }
}

export function useMemberNameCache(
    tableCode: string | null | undefined,
    members: Record<string, TableMember> | null | undefined,
) {
    const storageKey = tableCode ? `memberNames:${tableCode}` : null;
    const currentNames = useMemo(
        () => Object.fromEntries(
            Object.entries(members ?? {}).map(([id, member]) => [id, member.name])
        ),
        [members]
    );
    const [cachedNames, setCachedNames] = useState<Record<string, string>>(() =>
        readNameCache(storageKey)
    );

    useEffect(() => {
        setCachedNames(readNameCache(storageKey));
    }, [storageKey]);

    useEffect(() => {
        if (!storageKey || Object.keys(currentNames).length === 0) return;

        setCachedNames((previousNames) => {
            const nextNames = {
                ...previousNames,
                ...currentNames,
            };

            sessionStorage.setItem(storageKey, JSON.stringify(nextNames));
            return nextNames;
        });
    }, [currentNames, storageKey]);

    return useMemo(
        () => ({
            ...cachedNames,
            ...currentNames,
        }),
        [cachedNames, currentNames]
    );
}
