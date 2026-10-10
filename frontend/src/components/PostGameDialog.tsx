import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogButton } from 'konsta/react';
import { useTranslation } from 'react-i18next';
import { importantGlassWithoutLightInsetShadow } from 'game-table/styles/glass';
import type { PostGameTeamPreference, PostGameTransitionView } from 'game-table/types/table';

type Response = { keep_playing: boolean } | { team_preference: PostGameTeamPreference } | { selected_player: string };
type Props = {
    transition: PostGameTransitionView;
    selfId: string;
    memberNames?: Record<string, string>;
    onRespond: (transitionId: string, response: Response, onResult: (saved: boolean) => void) => void;
};

export default function PostGameDialog(props: Props) {
    const player = props.transition.players[props.selfId];
    if (!player || (['accepted', 'waiting'].includes(player.decision) && !props.transition.seating_blocked)) return null;
    // A broadcast advancing the prompt resets pending/error/dismissed state.
    return <PlayerPrompt key={`${props.selfId}:${player.decision}`} {...props} />;
}

function PlayerPrompt({ transition, selfId, onRespond, memberNames = {} }: Props) {
    const { t } = useTranslation();
    const player = transition.players[selfId];
    const [now, setNow] = useState(Date.now());
    const [pending, setPending] = useState(false);
    const [error, setError] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const pendingRef = useRef(false);
    const mounted = useRef(true);
    const deadline = player.deadline;
    const count = deadline === null ? null : Math.max(0, Math.ceil(deadline - now / 1000));
    const keepPlaying = player.decision === 'keep_playing';
    const teamChoice = player.decision === 'team_choice';
    const ready = player.decision === 'ready';
    const playerChoice = player.decision === 'partner_choice';
    const hasPrompt = keepPlaying || teamChoice || ready || playerChoice;
    const terminal = player.decision === 'left' || player.decision === 'timed_out';
    const disabled = pending || count === 0;

    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);
    useEffect(() => {
        if (deadline === null) return;
        const update = () => setNow(Date.now());
        update();
        const interval = window.setInterval(update, 250);
        const onVisibility = () => { if (!document.hidden) update(); };
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            window.clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [deadline]);

    const respond = (response: Response) => {
        if (pendingRef.current || (deadline !== null && Date.now() / 1000 >= deadline)) return;
        pendingRef.current = true;
        setPending(true);
        setError(false);
        onRespond(transition.id, response, (saved) => {
            if (!mounted.current) return;
            if (!saved) {
                pendingRef.current = false;
                setPending(false);
                setError(true);
            }
            // Success waits for the authoritative table broadcast.
        });
    };
    if (dismissed) return null;

    const status = terminal
        ? t(player.decision === 'left' ? 'table.postGame.watching' : 'table.postGame.expired')
        : t(player.decision === 'waiting'
            ? transition.phase === 'winner_checks' ? 'table.postGame.waitingWinners'
                : transition.challengers?.includes(selfId) ? 'table.queue.waitingTurn' : 'table.queue.waitingChallengers'
            : 'table.postGame.waitingPlayers');
    const inviter = transition.invited_by?.[selfId];
    const title = ready ? t('table.queue.readyQuestion')
        : playerChoice ? t('table.queue.choosePlayer')
        : keepPlaying ? inviter
            ? t('table.queue.selected', { name: memberNames[inviter] ?? '' })
            : t('table.postGame.keepPlayingQuestion')
        : teamChoice ? t('table.postGame.partnerQuestion') : undefined;

    return (
        <Dialog
            opened
            backdrop={false}
            role="dialog"
            aria-label={title ?? status}
            title={title ? <span className="block text-center">{title}</span> : undefined}
            style={{ zIndex: 5, width: 'max-content', maxWidth: 'calc(100% - 2rem)' }}
            className={`${importantGlassWithoutLightInsetShadow} [&>.flex-col:empty]:hidden [&>.flex-col]:!pb-2 [&>.flex:last-child]:!pt-0`}
            buttons={(
                <div className="grid w-full gap-1 [&>button]:px-[2em]">
                    {ready ? <>
                        <DialogButton disabled={disabled} onClick={() => respond({ keep_playing: true })}>
                            {t('table.queue.ready')}
                        </DialogButton>
                        <DialogButton disabled={disabled} onClick={() => respond({ keep_playing: false })}>
                            {t('table.queue.skip')}
                        </DialogButton>
                    </> : playerChoice ? (transition.selection_candidates ?? []).map(id => (
                        <DialogButton key={id} disabled={disabled} onClick={() => respond({ selected_player: id })}>
                            {memberNames[id] ?? id}
                        </DialogButton>
                    )) : keepPlaying ? <>
                        <DialogButton disabled={disabled} onClick={() => respond({ keep_playing: true })}>
                            {t('table.postGame.keepPlaying')}
                        </DialogButton>
                        <DialogButton disabled={disabled} onClick={() => respond({ keep_playing: false })}>
                            {t('table.postGame.leave')}
                        </DialogButton>
                    </> : teamChoice ? <>
                        <DialogButton disabled={disabled} onClick={() => respond({ team_preference: 'same_team' })}>
                            {t('table.postGame.samePartner')}
                        </DialogButton>
                        <DialogButton disabled={disabled} onClick={() => respond({ team_preference: 'mix_it_up' })}>
                            {t('table.postGame.changePartner')}
                        </DialogButton>
                    </> : null}
                    {error ? <p role="alert" className="px-4 pt-2 text-center text-sm text-red-600 dark:text-red-400">
                        {t('table.postGame.saveError')}
                    </p> : null}
                    <p className="px-4 py-2 text-center text-sm tabular-nums text-black/55 dark:text-white/55">
                        {hasPrompt && count !== null
                            ? t(teamChoice || playerChoice ? 'table.postGame.chooseWithin' : 'table.postGame.spotExpires', { count })
                            : status}
                    </p>
                    {terminal ? <DialogButton onClick={() => setDismissed(true)}>
                        {t('table.action.done')}
                    </DialogButton> : null}
                </div>
            )}
        />
    );
}
