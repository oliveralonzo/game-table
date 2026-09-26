import { useEffect, useRef, useState } from "react";

/** One create-first flow for private and group table cards. */
export function useTableCreation<T>({ request, onCreated, onError, errorMessage }: {
    request: () => Promise<T>; onCreated: (table: T) => void;
    onError: (message: string | null) => void; errorMessage: string;
}) {
    const [creating, setCreating] = useState(false);
    const pending = useRef(false);
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const create = () => {
        if (pending.current) return;
        pending.current = true;
        setCreating(true);
        onError(null);
        let finished = false;
        const finish = (table?: T, error?: unknown) => {
            if (finished) return;
            finished = true;
            window.clearTimeout(timer);
            pending.current = false;
            if (!mounted.current) return;
            if (table !== undefined) onCreated(table);
            else onError(error instanceof Error ? error.message : errorMessage);
            setCreating(false);
        };
        const timer = window.setTimeout(() => finish(), 15000);
        Promise.resolve().then(request).then(table => finish(table), error => finish(undefined, error));
    };
    return { creating, create };
}
