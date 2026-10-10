import { useEffect, useRef, useState } from 'react';
import { Button } from 'konsta/react';
import { useTranslation } from 'react-i18next';
import { useTable } from 'game-table/context/TableState';
import { useTableSocket } from 'game-table/context/TableSocket';

export default function QueueAction() {
    const { t } = useTranslation();
    const { state } = useTable();
    const { setQueued } = useTableSocket();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState(false);
    const pendingRef = useRef(false);
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const table = state.tableView;
    const selfId = state.selfMemberId;
    if (!table || !selfId || table.seats.includes(selfId)) return null;
    const queued = table.queue?.includes(selfId) ?? false;
    const check = table.post_game_transition?.players[selfId];
    if (!queued && table.post_game_transition?.seating_blocked && check && !['left', 'timed_out'].includes(check.decision)) return null;
    const toggle = () => {
        if (pendingRef.current) return;
        pendingRef.current = true;
        setPending(true);
        setError(false);
        setQueued(!queued, saved => {
            if (!mounted.current) return;
            pendingRef.current = false;
            setPending(false);
            setError(!saved);
        });
    };
    return <div className="flex flex-col items-center px-safe-4 py-3">
        <Button type="button" inline rounded tonal disabled={pending} onClick={toggle} className="h-9 px-3">
            {t(queued ? 'table.queue.leave' : 'table.queue.join')}
        </Button>
        {error ? <p role="alert" className="mt-2 text-center text-sm text-red-600 dark:text-red-400">{t('table.queue.error')}</p> : null}
    </div>;
}
