// src/components/LobbyRoster.tsx
/**
 * LobbyRoster.tsx
 * Author: Oliver Alonzo
 * Supported by ChatGPT (GPT-5)
 * Date: 2025-08-12
 * Version: 1.0
 *
 * Read-only roster for the lobby.
 * - Shows everyone currently in the lobby with a role badge.
 * - If a person has a seat, also shows "Seat N".
 * - Subtle "You" chip for the current user.
 *
 * Props:
 *  - people: array of roster entries (already sorted by caller; e.g., host first)
 *  - seatCount?: number (optional; future styling hooks)
 *
 * Notes:
 * - This component is presentational only. No store access, no actions.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    Badge,
    Button,
    Glass,
    List,
    ListItem,
} from "konsta/react";
import { ChartNoAxesColumn, Circle, Eye, MoreHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { glassWithoutLightInsetShadow } from "game-table/styles/glass";
import { getNameInitials } from "game-table/utils/playerInitialLabels";

export type RosterPerson = {
    id: string;        // stable id (clientId or server id)
    name: string;
    accountUsername?: string | null;
    winPercentage?: number;
    isHost: boolean;
    hasSeat: boolean;
    seatIndex?: number; // 0-based when hasSeat === true
    initialLabel?: string;
    isSelf?: boolean;
    handViewerCount?: number;
    viewingHandNames?: string[];
};

export type RosterAction = {
    id: string;
    label: string;
    destructive?: boolean;
    disabled?: boolean;
    keepOpen?: boolean;
    pending?: boolean;
    onClick: () => void;
};

type Props = {
    people: RosterPerson[];
    seatCount?: number;
    title?: string | null;
    flush?: boolean;
    className?: string;
    showSeatLocation?: boolean;
    showHandViewStatus?: boolean;
    getActions?: (person: RosterPerson) => RosterAction[];
};

function getAvatarLabel(person: RosterPerson): string {
    return person.initialLabel ?? getNameInitials(person.name, "?");
}

function getAvatarClass(person: RosterPerson): string {
    if (person.isSelf) {
        return person.isHost
            ? "bg-white text-black ring-[#A97142] dark:bg-white dark:text-black dark:ring-[#A97142]"
            : "bg-white text-black ring-black/20 dark:bg-white dark:text-black dark:ring-white/25";
    }

    if (!person.hasSeat) {
        return person.isHost
            ? "bg-gray-300 text-black/65 ring-[#A97142] dark:bg-gray-300 dark:text-black/70 dark:ring-[#A97142]"
            : "bg-gray-300 text-black/65 ring-black/20 dark:bg-gray-300 dark:text-black/70 dark:ring-white/25";
    }

    if (person.isHost) {
        return "bg-gray-100 text-black/70 ring-[#A97142] dark:bg-gray-100 dark:text-black/70 dark:ring-[#A97142]";
    }

    return "bg-gray-100 text-black/70 ring-black/20 dark:bg-gray-100 dark:text-black/70 dark:ring-white/20";
}

export default function LobbyRoster({
    people,
    title = "People in Lobby",
    flush = false,
    className = "",
    showSeatLocation = true,
    showHandViewStatus = false,
    getActions,
}: Props) {
    const { t } = useTranslation();
    const [openActionId, setOpenActionId] = useState<string | null>(null);
    const [actionMenuPosition, setActionMenuPosition] = useState<{
        top: number;
        left: number;
        maxHeight: number;
    } | null>(null);
    const actionButtonRefs = useRef<Record<string, HTMLElement | null>>({});
    const actionMenuRef = useRef<HTMLDivElement | null>(null);
    const seatPositionLabels = [
        t("table.roster.seat.bottom"),
        t("table.roster.seat.right"),
        t("table.roster.seat.top"),
        t("table.roster.seat.left"),
    ];
    const openActionsPerson = openActionId
        ? people.find((person) => person.id === openActionId)
        : undefined;
    const openActions = openActionsPerson
        ? getActions?.(openActionsPerson) ?? []
        : [];
    const getViewportBounds = () => {
        const visualViewport = window.visualViewport;

        return {
            top: visualViewport?.offsetTop ?? 0,
            left: visualViewport?.offsetLeft ?? 0,
            width: visualViewport?.width ?? window.innerWidth,
            height: visualViewport?.height ?? window.innerHeight,
        };
    };
    const updateActionMenuPosition = (personId: string) => {
        const rect = actionButtonRefs.current[personId]?.getBoundingClientRect();
        const person = people.find((candidate) => candidate.id === personId);
        if (!rect || !person) return;

        const actions = getActions?.(person) ?? [];
        const viewport = getViewportBounds();
        const viewportTop = viewport.top;
        const viewportLeft = viewport.left;
        const viewportRight = viewportLeft + viewport.width;
        const viewportBottom = viewportTop + viewport.height;
        const menuWidth = 220;
        const margin = 12;
        const gap = 8;
        const estimatedMenuHeight = Math.max(48, actions.length * 46 + 8);
        const maxHeight = Math.max(48, viewport.height - margin * 2);
        const availableBelow = viewportBottom - rect.bottom - gap - margin;
        const availableAbove = rect.top - viewportTop - gap - margin;
        const shouldOpenAbove = availableBelow < estimatedMenuHeight && availableAbove > availableBelow;
        const unclampedTop = shouldOpenAbove
            ? rect.top - gap - Math.min(estimatedMenuHeight, maxHeight)
            : rect.bottom + gap;
        const top = Math.min(
            viewportBottom - margin - Math.min(estimatedMenuHeight, maxHeight),
            Math.max(viewportTop + margin, unclampedTop)
        );
        const left = Math.min(
            viewportRight - menuWidth - margin,
            Math.max(viewportLeft + margin, rect.right - menuWidth)
        );

        setActionMenuPosition({ top, left, maxHeight });
    };

    useEffect(() => {
        if (!openActionId) return;

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node;
            const actionButton = actionButtonRefs.current[openActionId];

            if (actionButton?.contains(target)) return;
            if (actionMenuRef.current?.contains(target)) return;

            setOpenActionId(null);
            setActionMenuPosition(null);
        };

        document.addEventListener("pointerdown", handlePointerDown);

        return () => document.removeEventListener("pointerdown", handlePointerDown);
    }, [openActionId]);

    useEffect(() => {
        if (!openActionId) return;

        const reposition = () => updateActionMenuPosition(openActionId);
        const visualViewport = window.visualViewport;

        reposition();
        window.addEventListener("resize", reposition);
        visualViewport?.addEventListener("resize", reposition);
        visualViewport?.addEventListener("scroll", reposition);

        return () => {
            window.removeEventListener("resize", reposition);
            visualViewport?.removeEventListener("resize", reposition);
            visualViewport?.removeEventListener("scroll", reposition);
        };
    }, [openActionId, people, getActions]);

    const openActionMenu = (personId: string) => {
        if (openActionId === personId) {
            setOpenActionId(null);
            setActionMenuPosition(null);
            return;
        }

        setOpenActionId(personId);
        updateActionMenuPosition(personId);
    };

    return (
        <section className={`${flush ? "" : "mt-4"} ${className}`}>
            {title && (
                <h2 className="mb-2 px-safe-4 text-[22px] font-bold leading-tight tracking-normal text-black dark:text-white">
                    {title}
                </h2>
            )}
            <List
                inset
                nested={false}
                outline
                strong
                className="m-0"
            >
                {people.map((p) => {
                    const avatarLabel = getAvatarLabel(p);
                    const avatarClass = getAvatarClass(p);
                    const handViewerCount = p.handViewerCount ?? 0;
                    const viewingHandNames = p.viewingHandNames ?? [];
                    const viewingHandNamesLabel = viewingHandNames.join(", ");
                    const seatSubtitle = showSeatLocation
                        ? p.hasSeat && typeof p.seatIndex === "number"
                            ? (
                                <span className="inline-flex items-center gap-1.5">
                                    <span
                                        aria-hidden="true"
                                        className="h-[11px] w-[11px] rounded-full bg-current"
                                    />
                                    {seatPositionLabels[p.seatIndex] ?? t("table.roster.seat.seated")}
                                </span>
                            )
                            : (
                                <span className="inline-flex items-center gap-1.5 text-black/35 dark:text-white/35">
                                    <Circle size={11} strokeWidth={2.5} />
                                    <span aria-hidden="true">&nbsp;</span>
                                </span>
                            )
                        : null;
                    const handViewSubtitle = showHandViewStatus
                        ? p.hasSeat && handViewerCount > 0
                            ? (
                                <span
                                    className="inline-flex items-center gap-1.5"
                                    title={t("table.roster.handViewers", {
                                        count: handViewerCount,
                                    })}
                                    aria-label={t("table.roster.handViewers", {
                                        count: handViewerCount,
                                    })}
                                >
                                    <Eye size={13} strokeWidth={2.2} />
                                    <span className="tabular-nums">{handViewerCount}</span>
                                </span>
                            )
                            : !p.hasSeat && viewingHandNames.length > 0
                                ? (
                                    <span
                                        className="inline-flex min-w-0 items-center gap-1.5"
                                        title={t("table.roster.viewingHand", {
                                            name: viewingHandNamesLabel,
                                        })}
                                        aria-label={t("table.roster.viewingHand", {
                                            name: viewingHandNamesLabel,
                                        })}
                                    >
                                        <Eye size={13} strokeWidth={2.2} className="shrink-0" />
                                        <span className="min-w-0 truncate">{viewingHandNamesLabel}</span>
                                    </span>
                                )
                                : null
                        : null;
                    const actions = getActions?.(p) ?? [];
                    const hasActions = actions.length > 0;
                    const showTrailing = hasActions;
                    const accountUsernameLabel = p.accountUsername
                        ? `@${p.accountUsername}`
                        : null;
                    const showSubtitleRow = showSeatLocation || showHandViewStatus || !!accountUsernameLabel;

                    return (
                        <li
                            key={p.id}
                            className="border-b border-black/10 last:border-b-0 dark:border-white/10"
                        >
                            <div className="flex min-h-14 items-center justify-between gap-3 px-safe-4 py-2.5">
                                <div
                                    aria-hidden="true"
                                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm tabular-nums ring-1 ${p.isSelf ? "font-bold" : "font-medium"} ${avatarClass}`}
                                >
                                    {avatarLabel}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className={`truncate text-sm text-black dark:text-white ${p.isSelf ? "font-semibold" : "font-normal"}`}>
                                        {p.name}
                                        {p.isSelf ? (
                                            <Badge
                                                small
                                                colors={{
                                                    bg: "bg-black/10 dark:bg-white/10",
                                                    text: "text-black/55 dark:text-white/65",
                                                }}
                                                className="ml-2 align-middle"
                                            >
                                                {t("table.roster.you")}
                                            </Badge>
                                        ) : null}
                                    </div>
                                    {showSubtitleRow ? (
                                        <div className="mt-0.5 min-h-[1.25rem] text-sm text-black/45 dark:text-white/45">
	                                            <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
	                                                {accountUsernameLabel ? (
	                                                    <>
	                                                        <span className="min-w-0 truncate font-medium text-black/40 dark:text-white/45">
	                                                            {accountUsernameLabel}
	                                                        </span>
	                                                        {p.winPercentage !== undefined ? (
	                                                            <span
	                                                                className="inline-flex items-center gap-1 font-medium tabular-nums text-black/40 dark:text-white/45"
	                                                                title={t("table.roster.winPercentageLabel", {
	                                                                    percentage: Math.round(p.winPercentage * 100),
	                                                                })}
	                                                                aria-label={t("table.roster.winPercentageLabel", {
	                                                                    percentage: Math.round(p.winPercentage * 100),
	                                                                })}
	                                                            >
	                                                                <ChartNoAxesColumn aria-hidden="true" size={13} strokeWidth={2.2} />
	                                                                {t("table.roster.winPercentage", {
	                                                                    percentage: Math.round(p.winPercentage * 100),
	                                                                })}
	                                                            </span>
	                                                        ) : null}
	                                                    </>
	                                                ) : null}
	                                                {showSeatLocation ? (
	                                                    <span>
	                                                        {seatSubtitle}
                                                    </span>
                                                ) : null}
	                                                {showHandViewStatus ? (
	                                                    handViewSubtitle ?? (
	                                                        <span aria-hidden="true">&nbsp;</span>
	                                                    )
	                                                ) : null}
	                                            </span>
                                        </div>
                                    ) : null}
                                </div>
                                {showTrailing && (
                                    <div className="flex shrink-0 items-center gap-1">
                                        {hasActions ? (
                                            <Button
                                                ref={(element) => {
                                                    actionButtonRefs.current[p.id] = element;
                                                }}
                                                type="button"
                                                inline
                                                rounded
                                                clear
                                                aria-label={t("table.action.memberActions")}
                                                title={t("table.action.memberActions")}
                                                onClick={() => openActionMenu(p.id)}
                                                className="h-10 w-10 p-0 text-black/55 transition-opacity hover:opacity-70 active:opacity-55 dark:text-white/60 [--color-ios-hover-highlight:transparent]"
                                            >
                                                <MoreHorizontal size={20} strokeWidth={2.2} />
                                            </Button>
                                        ) : null}
                                    </div>
                                )}
                            </div>
                        </li>
                    );
                })}
            </List>
            {openActionId && actionMenuPosition && openActions.length > 0 && createPortal(
                <div
                    ref={actionMenuRef}
                    className="fixed z-50 w-[220px] overflow-visible"
                    style={{
                        top: actionMenuPosition.top,
                        left: actionMenuPosition.left,
                    }}
                    onPointerDownCapture={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                >
                    <Glass
                        highlight={false}
                        colors={{
                            shadowIos: glassWithoutLightInsetShadow,
                        }}
                        className="overflow-y-auto rounded-2xl p-1 [--color-ios-hover-highlight:transparent]"
                        style={{ maxHeight: actionMenuPosition.maxHeight }}
                    >
                        <List nested className="m-0">
                            {openActions.map((action) => (
                                <ListItem
                                    key={action.id}
                                    title={action.label}
                                    link={!action.disabled}
                                    chevron={false}
                                    onClick={() => {
                                        if (action.disabled) return;
                                        if (!action.keepOpen) {
                                            setOpenActionId(null);
                                            setActionMenuPosition(null);
                                        }
                                        action.onClick();
                                    }}
                                    strongTitle={false}
                                    className={`transition-opacity hover:opacity-70 active:opacity-55 ${action.disabled ? "pointer-events-none opacity-45" : ""} ${action.pending ? "animate-roster-heartbeat" : ""}`}
                                    colors={{
                                        activeBgIos: "",
                                        ...(action.destructive
                                            ? { primaryTextIos: "text-red-600 dark:text-red-400" }
                                            : {}),
                                    }}
                                />
                            ))}
                        </List>
                    </Glass>
                </div>,
                document.body
            )}
        </section>
    );
}
