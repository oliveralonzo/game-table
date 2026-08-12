import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { buildSeatInitialLabels } from "game-table/utils/playerInitialLabels";
import { getRelativeSeatOffset } from "game-table/utils/seatLayoutUtils";

type TableState = "open" | "in_game" | "game_blocked";

type SeatView = {
    name: string | null;
    ready: boolean;
};

type SeatPermissions = {
    canClaimSeat: boolean;
    canUnassignSeat: boolean;
    canInteract: boolean;
};

function getSeatPermissions({
    claimed,
    isSelf,
    hasASeat,
    isHost,
    tableState,
}: {
    claimed: boolean;
    isSelf: boolean;
    hasASeat: boolean;
    isHost: boolean;
    tableState: TableState;
}): SeatPermissions {
    const canClaimSeat =
        !claimed &&
        !hasASeat &&
        (tableState === "open" || tableState === "game_blocked");

    const canUnassignSeat =
        claimed && (isHost || isSelf);

    return {
        canClaimSeat,
        canUnassignSeat,
        canInteract: canClaimSeat || canUnassignSeat,
    };
}

type Props = {
    seats: SeatView[];
    seatCount: number;
    initialLabels?: (string | null)[];
    playerIndex: number | null;
    isHost: boolean;
    tableState: TableState;
    onAssignSeat: (index: number) => void;
    onUnassignSeat: (index: number) => void;
    footerAction?: ReactNode;
};

export default function SeatsPanel({
    seats,
    seatCount,
    initialLabels,
    playerIndex,
    isHost,
    tableState,
    onAssignSeat,
    onUnassignSeat,
    footerAction,
}: Props) {
    const { t } = useTranslation();
    const hasASeat = playerIndex !== null;
    const seatButtonBaseClass =
        "group absolute z-0 h-[30%] w-[30%] touch-pan-y rounded-full ring-1 transition-[opacity,filter,transform,box-shadow] duration-300 ease-[cubic-bezier(0.2,0,0,1)] [container-type:size]";
    const emptySeatClass =
        "bg-gray-300 ring-black/30 shadow-none dark:bg-gray-300 dark:ring-white/25 dark:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.36)]";
    const unavailableSeatClass =
        "bg-gray-400 ring-black/25 shadow-none dark:bg-gray-400 dark:ring-white/15 dark:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.36),0_0_0_1px_rgba(255,255,255,0.18)]";
    const ownSeatClass =
        "bg-white ring-[#A97142] shadow-[inset_0_0_0_2px_rgba(169,113,66,0.85),0_2px_8px_rgba(0,0,0,0.12)] dark:bg-white dark:ring-[#A97142] dark:shadow-[inset_0_0_0_2px_rgba(169,113,66,0.85),0_2px_8px_rgba(0,0,0,0.28)]";
    const occupiedSeatClass =
        "bg-gray-100 ring-black/20 shadow-none dark:bg-gray-100 dark:ring-white/20 dark:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.28),0_0_0_1px_rgba(255,255,255,0.2)]";
    const seatInitialLabels = buildSeatInitialLabels(seats.slice(0, seatCount));
    const seatPositions = [
        {
            label: t("table.seat.bottom"),
            circleClass: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2",
            initialsStyle: {
                transform: "translate(-50%, calc(-50% + 0.5em))",
            },
        },
        {
            label: t("table.seat.right"),
            circleClass: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2",
            initialsStyle: {
                transform: "translate(calc(-50% + 0.5em), -50%) rotate(90deg)",
            },
        },
        {
            label: t("table.seat.top"),
            circleClass: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2",
            initialsStyle: {
                transform: "translate(-50%, calc(-50% - 0.5em))",
            },
        },
        {
            label: t("table.seat.left"),
            circleClass: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2",
            initialsStyle: {
                transform: "translate(calc(-50% - 0.5em), -50%) rotate(-90deg)",
            },
        },
    ] satisfies {
        label: string;
        circleClass: string;
        initialsStyle: CSSProperties;
    }[];

    return (
        <section className="flex h-full flex-col justify-between">
            {/*
                Previous seat selection kept for the branded rebuild.

                const visibleSeats = seats.slice(0, seatCount);
                const hasASeat = playerIndex !== null;
                const isFourPlayer = seatCount === 4;

                visibleSeats.map((seat, index) => {
                    const claimed = seat.name !== null;
                    const isSelf = playerIndex === index;
                    const { canClaimSeat, canUnassignSeat, canInteract } =
                        getSeatPermissions({
                            claimed,
                            isSelf,
                            hasASeat,
                            tableState,
                        });

                    return claimed ? seat.name : `Player ${index + 1}`;
                });
            */}

            <div className="flex flex-1 items-center py-8">
                <div className="flex w-full justify-center">
                    <div className="relative aspect-square w-[70%] sm:w-1/2">
                        {seatPositions.map((_, index) => {
                            const positionOffset = getRelativeSeatOffset(
                                seatCount,
                                0,
                                index
                            ) ?? index;
                            const {
                                label,
                                circleClass,
                                initialsStyle,
                            } = seatPositions[positionOffset];
                            const seat = seats[index];
                            const visible = index < seatCount;
                            const claimed = !!seat?.name;
                            const isSelf = playerIndex === index;
                            const { canInteract } = getSeatPermissions({
                                claimed,
                                isSelf,
                                hasASeat,
                                isHost,
                                tableState,
                            });
                            const initials = initialLabels?.[index] ?? seatInitialLabels[index]?.label ?? "";
                            const isUnavailableEmptySeat = !claimed && hasASeat;
                            const seatStateClass = isSelf
                                ? ownSeatClass
                                : claimed
                                    ? occupiedSeatClass
                                    : isUnavailableEmptySeat
                                        ? unavailableSeatClass
                                        : emptySeatClass;
                            const initialsClass = isSelf
                                ? "text-black"
                                : claimed
                                    ? "text-black/55 dark:text-black/70"
                                    : "text-black";
                            const interactionClass = canInteract
                                ? "cursor-pointer hover:scale-105 hover:ring-black/40 active:scale-95 dark:hover:ring-white/50"
                                : "cursor-default";
                            const showRemoveCue = claimed && canInteract;

                            return (
                                <button
                                    key={index}
                                    type="button"
                                    aria-label={label}
                                    aria-pressed={isSelf}
                                    aria-hidden={!visible}
                                    aria-disabled={!canInteract}
                                    tabIndex={visible && canInteract ? 0 : -1}
                                    className={`${seatButtonBaseClass} ${seatStateClass} ${circleClass} ${visible ? "opacity-100 blur-0" : "pointer-events-none opacity-0 blur-sm"} ${interactionClass}`}
                                    onClick={() => {
                                        if (!visible || !canInteract) return;
                                        if (claimed) {
                                            onUnassignSeat(index);
                                        } else {
                                            onAssignSeat(index);
                                        }
                                    }}
                                >
                                    {initials && (
                                        <span
                                            className={`pointer-events-none absolute left-1/2 top-1/2 text-[30cqw] font-medium leading-none ${initialsClass}`}
                                            style={initialsStyle}
                                        >
                                            {initials}
                                        </span>
                                    )}
                                    {showRemoveCue && (
                                        <span
                                            aria-hidden="true"
                                            className="pointer-events-none absolute inset-0 rounded-full bg-black/10 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 dark:bg-gray-500/20"
                                        />
                                    )}
                                </button>
                            );
                        })}
                        <div className="relative z-10 flex h-full w-full items-center justify-center rounded-2xl bg-[#A97142]">
                            <div className="h-[88%] w-[88%] rounded-2xl bg-white shadow-[0_0_25px_0_rgba(0,0,0,0.2)] dark:bg-gray-300" />
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex items-start justify-end gap-3">
                {footerAction}
            </div>
        </section>
    );
}
