import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "konsta/react";
import { RotateCcw, Users, X } from "lucide-react";
import { glassWithoutLightInsetShadow } from "game-table/styles/glass";

type Props = {
    title: string;
    pending?: boolean;
    closing?: boolean;
    onClosed?: (code: string) => void;
    participantCount: number;
    peopleLabel: string;
    enterLabel: string;
    backLabel: string;
    onEnter: () => void;
    onRemove?: () => void;
    removeLabel?: string;
    roster: ReactNode;
    children: ReactNode;
};

export default function GroupTablePreviewCard({ title, pending = false, closing = false, onClosed, participantCount, peopleLabel, enterLabel, backLabel, onEnter, onRemove, removeLabel, roster, children }: Props) {
    const { t } = useTranslation();
    const disabled = pending || closing;
    const swipe = useRef<{ x: number; y: number } | null>(null);
    const suppressClick = useRef(false);
    const card = useRef<HTMLDivElement | null>(null);
    const closedCallback = useRef(onClosed);
    closedCallback.current = onClosed;
    useLayoutEffect(() => {
        if (!closing || !card.current) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            closedCallback.current?.(title);
            return;
        }
        const exit = card.current.animate([
            { opacity: 0.65, transform: "scale(1)" },
            { opacity: 0, transform: "scale(0.98)" },
        ], { delay: 100, duration: 480, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "both" });
        exit.finished.then(() => closedCallback.current?.(title)).catch(() => {});
        return () => exit.cancel();
    }, [closing, title]);
    const [flipped, setFlipped] = useState(false);
    const peopleButton = useRef<HTMLButtonElement | null>(null);
    const backButton = useRef<HTMLButtonElement | null>(null);
    const surface = useRef<HTMLDivElement | null>(null);
    const animation = useRef<Animation | null>(null);
    const turning = useRef(false);
    const didFlip = useRef(false);
    const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    useLayoutEffect(() => {
        if (!didFlip.current || !surface.current) return;
        const finish = () => {
            turning.current = false;
            (flipped ? backButton : peopleButton).current?.focus({ preventScroll: true });
        };
        if (reducedMotion()) {
            finish();
            return;
        }
        const current = surface.current.animate([
            { transform: "rotateY(-90deg)" },
            { transform: "rotateY(0deg)" },
        ], { duration: 180, easing: "ease-out" });
        animation.current = current;
        current.finished.then(finish).catch(() => {});
        return () => { current.cancel(); animation.current?.cancel(); };
    }, [flipped]);
    const flip = async () => {
        if (turning.current || !surface.current) return;
        turning.current = true;
        didFlip.current = true;
        if (!reducedMotion()) {
            const current = surface.current.animate([
                { transform: "rotateY(0deg)" },
                { transform: "rotateY(90deg)" },
            ], { duration: 180, easing: "ease-in", fill: "forwards" });
            animation.current = current;
            try { await current.finished; } catch { turning.current = false; return; }
            current.cancel();
        }
        setFlipped(value => !value);
    };
    // A single opaque surface avoids overlapping glass/backface compositing.
    return <div ref={card} style={{ touchAction: onRemove && !flipped ? "pan-x" : undefined }}
        onTouchStart={event => {
            suppressClick.current = false;
            if (!onRemove || disabled || flipped || event.touches.length !== 1) return;
            swipe.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
        }}
        onTouchEnd={event => {
            const start = swipe.current;
            swipe.current = null;
            const end = event.changedTouches[0];
            if (!start || !end || !onRemove || disabled) return;
            if (start.y - end.clientY > 70 && Math.abs(start.x - end.clientX) < 45) {
                suppressClick.current = true;
                onRemove();
            }
        }}
        onTouchCancel={() => { swipe.current = null; }}
        onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}
        aria-busy={disabled || undefined} className={`group/table-card relative aspect-[3/4] min-w-0 [perspective:1000px] ${disabled ? "opacity-50" : "transition-[transform,filter] duration-150 hover:brightness-[0.98] dark:hover:brightness-110 motion-safe:hover:-translate-y-0.5 motion-reduce:transition-none"}`}>
        {onRemove && !flipped && <button type="button" disabled={disabled}
            aria-label={removeLabel ?? t("privateTables.remove", { code: title })}
            onClick={onRemove}
            className={`absolute top-1 right-1 z-30 flex cursor-pointer h-9 w-9 items-center justify-center rounded-full text-black/35 dark:text-white/35 opacity-0 transition-opacity group-hover/table-card:opacity-100 group-focus-within/table-card:opacity-100 [@media(hover:none)]:opacity-100 hover:text-black/65 dark:hover:text-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500`}
        ><X size={16} /></button>}
        <div ref={surface} className={`relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-[28px] bg-white dark:bg-[#1c1c1e] ${glassWithoutLightInsetShadow}`}>
            {!flipped ? <>
                <div aria-hidden="true" inert className="pointer-events-none min-h-0 flex-1 [&_section>div:first-child]:py-3 [&_section>div:first-child>div>div]:!w-[62%]">{children}</div>
                <div className="flex h-14 shrink-0 items-center justify-between gap-1 px-3 pb-2">
                    <span className="rounded-full bg-black/5 px-3 py-1.5 text-sm font-semibold dark:bg-white/10">{title}</span>
                    <Button ref={peopleButton} clear inline rounded className="relative z-20 cursor-pointer disabled:cursor-default h-11 min-w-11 !px-2 !text-black/60 dark:!text-white/60"
                        disabled={disabled} aria-label={peopleLabel} aria-expanded={flipped} onClick={flip}>
                        <Users size={17} /><span className="ml-1 text-sm">{participantCount}</span>
                    </Button>
                </div>
                <button type="button" className="absolute inset-0 z-10 cursor-pointer disabled:cursor-default rounded-[28px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-blue-500"
                    disabled={disabled} aria-label={enterLabel} onClick={onEnter} />
            </> : <>
                <div className="flex shrink-0 items-center justify-between gap-1 pl-4 pr-2 pt-1">
                    <h3 className="truncate text-sm font-semibold">{title}</h3>
                    <Button ref={backButton} clear inline rounded className="cursor-pointer disabled:cursor-default h-11 w-11 shrink-0 !px-0 !text-black/60 dark:!text-white/60"
                        disabled={disabled} aria-label={backLabel} onClick={flip}><RotateCcw size={18} /></Button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1" role="region" aria-label={peopleLabel} tabIndex={flipped ? 0 : -1}>{roster}</div>
                <div className="shrink-0 p-2">
                    <Button rounded tonal className="h-11 cursor-pointer disabled:cursor-default" disabled={disabled} aria-label={enterLabel} onClick={onEnter}>{t("groups.enter")}</Button>
                </div>
            </>}
        </div>
    </div>;
}
