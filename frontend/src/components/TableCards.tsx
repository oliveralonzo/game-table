import { useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import TableCard, { NewTableCard } from "game-table/components/TableCard";
import type { SavedTable } from "game-table/context/SavedTablesContext";

type Preview = Pick<SavedTable, "table_code" | "seats" | "members" | "seat_count"> & { host_id?: string | null };
export default function TableCards<T extends Preview>({ tables, getKey, isClosing, onClosed, onEnter, onRemove, canRemove, removeLabel, isPending,
    creating, onCreate, disabled = false, className = "" }: {
    tables: T[]; getKey: (table: T) => string; isClosing: (table: T) => boolean;
    onClosed: (table: T) => void; onEnter: (table: T) => void; onRemove?: (table: T) => void;
    canRemove?: (table: T) => boolean; removeLabel?: string;
    isPending?: (table: T) => boolean; creating: boolean; onCreate: () => void; disabled?: boolean; className?: string;
}) {
    const { t } = useTranslation();
    const tableGrid = useRef<HTMLDivElement | null>(null);
    const cardPositions = useRef(new Map<string, { left: number; top: number }>());
    const layoutAnimations = useRef<Animation[]>([]);
    useLayoutEffect(() => {
        const nextPositions = new Map();
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        for (const element of Array.from(tableGrid.current?.children ?? []) as HTMLElement[]) {
            const key = element.dataset.cardKey;
            if (!key)
                continue;
            const next = { left: element.offsetLeft, top: element.offsetTop };
            const previous = cardPositions.current.get(key);
            nextPositions.set(key, next);
            if (!reduceMotion && previous && (previous.left !== next.left || previous.top !== next.top)) {
                layoutAnimations.current.push(element.animate([
                    { transform: `translate(${previous.left - next.left}px, ${previous.top - next.top}px)` },
                    { transform: "translate(0, 0)" },
                ], { duration: 320, easing: "cubic-bezier(0.2, 0, 0, 1)" }));
            }
        }
        cardPositions.current = nextPositions;
        layoutAnimations.current = layoutAnimations.current.filter(animation => animation.playState !== "finished");
    });
    useLayoutEffect(() => () => {
        layoutAnimations.current.forEach(animation => animation.cancel());
    }, []);
    return <div ref={tableGrid} className={`relative grid grid-cols-2 gap-3 ${className}`}>
        {tables.map(table => <div key={getKey(table)} data-card-key={getKey(table)} className="min-w-0">
            <TableCard table={table} pending={isPending?.(table)} closing={isClosing(table)} onClosed={() => onClosed(table)}
                onEnter={() => onEnter(table)} onRemove={onRemove && (!canRemove || canRemove(table)) ? () => onRemove(table) : undefined} removeLabel={removeLabel} />
        </div>)}
        {creating && <div data-card-key="pending" className="min-w-0"><TableCard pending
            table={{ table_code: "…", seats: [null, null, null, null], seat_count: 4, members: [] }} onEnter={() => {}} /></div>}
        <div data-card-key="add" className="min-w-0"><NewTableCard label={t("privateTables.create")} disabled={creating || disabled} onCreate={onCreate} /></div>
    </div>;
}
