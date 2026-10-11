import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogButton } from 'konsta/react';
import { useTranslation } from 'react-i18next';
import { useTable } from 'game-table/context/TableState';
import { useTableSocket } from 'game-table/context/TableSocket';
import { importantGlassWithoutLightInsetShadow } from 'game-table/styles/glass';

export default function UnseatConfirmationDialog() {
    const { state } = useTable();
    const { respondUnseat } = useTableSocket();
    const self = state.selfMemberId;
    const confirmation = self ? state.tableView?.unseat?.confirmations[self] : undefined;
    if (!confirmation || !self) return null;
    return <Confirmation key={confirmation.id} deadline={confirmation.deadline}
        answered={false} requesterName={confirmation.requester_name}
        onRespond={(yes, callback) => respondUnseat(confirmation.id, yes, callback)} />;
}

function Confirmation({ deadline, answered, onRespond, requesterName }: {
    requesterName?: string | null; deadline: number; answered: boolean; onRespond: (yes: boolean, callback: (saved: boolean) => void) => void;
}) {
    const { t } = useTranslation();
    const [now, setNow] = useState(Date.now());
    const [pending, setPending] = useState(false);
    const [error, setError] = useState(false);
    const pendingRef = useRef(false);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        const timer = window.setInterval(() => setNow(Date.now()), 250);
        return () => { mounted.current = false; window.clearInterval(timer); };
    }, []);
    const count = Math.max(0, Math.ceil(deadline - now / 1000));
    const respond = (yes: boolean) => {
        if (pendingRef.current || Date.now() / 1000 >= deadline) return;
        pendingRef.current = true; setPending(true); setError(false);
        onRespond(yes, saved => {
            if (!mounted.current || saved) return;
            pendingRef.current = false; setPending(false); setError(true);
        });
    };
    const question = requesterName ? t('table.unseatConfirmation.requestedBy', { player: requesterName }) : t('table.unseatConfirmation.question');
    return <Dialog opened backdrop role="dialog" aria-label={question}
        title={<span className="block text-center">{question}</span>}
        style={{ zIndex: 40, width: 'max-content', maxWidth: 'calc(100% - 2rem)' }}
        className={`${importantGlassWithoutLightInsetShadow} text-center [&>.flex-col]:!pb-2 [&>.flex:last-child]:!pt-0`}
        buttons={<div className="grid w-full gap-1 [&>button]:px-[2em]">
            {!answered ? <>
                <DialogButton disabled={pending || count === 0} onClick={() => respond(true)}>{t('table.unseatConfirmation.yes')}</DialogButton>
                <DialogButton disabled={pending || count === 0} onClick={() => respond(false)}>{t('table.unseatConfirmation.no')}</DialogButton>
            </> : <p className="px-4 pt-2 text-center text-sm">{t('table.unseatConfirmation.waiting')}</p>}
            {error ? <p role="alert" className="px-4 text-center text-sm text-red-600 dark:text-red-400">{t('table.postGame.saveError')}</p> : null}
            <p className="px-4 py-2 text-center text-sm tabular-nums text-black/55 dark:text-white/55">{t('table.unseatConfirmation.timer', { count })}</p>
        </div>} />;
}
