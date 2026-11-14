import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogButton } from 'konsta/react';
import { useTranslation } from 'react-i18next';
import { useTable } from 'game-table/context/TableState';
import { useTableSocket } from 'game-table/context/TableSocket';
import { importantGlassWithoutLightInsetShadow } from 'game-table/styles/glass';

export default function EndGameConfirmationDialog() {
    const { state } = useTable();
    const { respondGameEnd, emit } = useTableSocket();
    const start = state.tableView?.start_game_confirmation;
    const starting = start?.status === "pending";
    const confirmation = starting ? start : state.tableView?.end_game_confirmation;
    const self = state.selfMemberId;
    if (!confirmation || confirmation.status !== 'pending' || !self || !(self in confirmation.responses) || confirmation.responses[self] !== null) return null;
    return <Confirmation key={`${confirmation.id}:${confirmation.responses[self]}`} deadline={confirmation.deadline}
        starting={starting} answered={confirmation.responses[self] !== null} responses={confirmation.responses}
        memberNames={Object.fromEntries(Object.entries(state.tableView?.members ?? {}).map(([id, member]) => [id, member.name]))}
        onRespond={(yes, callback) => {
            if (starting) emit("table:start_game_response", { confirmation_id: confirmation.id, yes },
                (ack: { updated?: boolean }) => callback(ack?.updated === true));
            else respondGameEnd(confirmation.id, yes, callback);
        }} />;
}

function Confirmation({ deadline, answered, onRespond, responses, memberNames, starting }: {
    responses: Record<string, boolean | null>; memberNames: Record<string, string>;
    starting: boolean; deadline: number; answered: boolean; onRespond: (yes: boolean, callback: (saved: boolean) => void) => void;
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
    const copy = starting ? "table.startConfirmation" : "table.endConfirmation";
    return <Dialog opened backdrop role="dialog" aria-label={t(`${copy}.question`)}
        title={<span className="block text-center">{t(`${copy}.question`)}</span>}
        style={{ zIndex: 40, width: 'max-content', maxWidth: 'calc(100% - 2rem)' }}
        className={`${importantGlassWithoutLightInsetShadow} text-center [&>.flex-col]:!pb-2 [&>.flex:last-child]:!pt-0`}
        buttons={<div className="grid w-full gap-1 [&>button]:px-[2em]">
            {!answered ? <>
                <DialogButton disabled={pending || count === 0} onClick={() => respond(true)}>{t(`${copy}.yes`)}</DialogButton>
                <DialogButton disabled={pending || count === 0} onClick={() => respond(false)}>{t(`${copy}.no`)}</DialogButton>
            </> : <p className="px-4 pt-2 text-center text-sm">{t('table.endConfirmation.waiting')}</p>}
            {answered ? <div className="grid gap-2 px-4 py-2 text-center text-sm">
                {Object.entries(responses).map(([id, response]) => <p key={id} className="m-0 text-center">
                    {memberNames[id] ?? id}{': '}{t(response === null ? 'table.postGame.answering' : response ? 'table.endConfirmation.yes' : 'table.endConfirmation.no')}
                </p>)}
            </div> : null}
            {error ? <p role="alert" className="px-4 text-center text-sm text-red-600 dark:text-red-400">{t('table.postGame.saveError')}</p> : null}
            <p className="px-4 py-2 text-center text-sm tabular-nums text-black/55 dark:text-white/55">{t(`${copy}.timer`, { count })}</p>
        </div>} />;
}
