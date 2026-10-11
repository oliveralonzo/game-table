import PostGameDialog from "game-table/components/PostGameDialog";
import { useTableSocket } from "game-table/context/TableSocket";
import { useTable } from "game-table/context/TableState";
import UnseatConfirmationDialog from 'game-table/components/UnseatConfirmationDialog';
import EndGameConfirmationDialog from 'game-table/components/EndGameConfirmationDialog';
import {
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import Logo from "game-table/components/Logo";
import ReactionBar from "game-table/components/ReactionBar";
import ViewerReactions from "game-table/components/ViewerReactions";
import LeaderboardScreen from "game-table/pages/LeaderboardScreen";
import { REACTIONS } from "game-table/config/reactions";
import type { ReactionEvent, ViewerReactionView } from "game-table/types/activity";
import { glassWithoutLightInsetShadow } from "game-table/styles/glass";
import { refreshSafariThemeColor } from "game-table/hooks/useSystemDarkClass";
import { MessageCircle, Settings, Users } from "lucide-react";
import TableLifecycleAction from "game-table/components/TableLifecycleAction";
import {
    App as KonstaApp,
    Navbar,
    Badge,
    Button,
    Glass,
    Popup,
    Segmented,
    SegmentedButton,
    Sheet,
} from "konsta/react";

export type TableTool = "people" | "chat" | "settings";
export type TableToolRenderContext = {
    setContentTranslucent: (translucent: boolean) => void;
    openLeaderboard?: () => void;
};

const tableTools: {
    id: TableTool;
    icon: typeof Users;
}[] = [
    { id: "people", icon: Users },
    { id: "chat", icon: MessageCircle },
    { id: "settings", icon: Settings },
];

const mobileSheetClassName = "max-h-[85svh] overflow-y-auto p-4 pb-6";
const mobileSheetTranslucentClassName = "opacity-45 backdrop-blur-0";

function useIsMobileLayout() {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const query = window.matchMedia("(max-width: 639px)");
        const update = () => setIsMobile(query.matches);

        update();
        query.addEventListener("change", update);

        return () => query.removeEventListener("change", update);
    }, []);

    return isMobile;
}

type Props = {
    children: ReactNode;
    memberCount: number;
    chatUnreadCount?: number;
    renderToolContent: (tool: TableTool, context: TableToolRenderContext) => ReactNode;
    reactions: ViewerReactionView[];
    onEmitReaction: (reaction: string) => void;
    onRemoveReaction: (reaction: ReactionEvent) => void;
    desktopAccessory?: ReactNode;
    mobileAccessory?: ReactNode;
    fullBleed?: boolean;
    desktopToolsAtBottom?: boolean;
    mainClassName?: string;
    contentClassName?: string;
    onBottomChromeInsetChange?: (inset: number) => void;
    onActiveToolChange?: (tool: TableTool | null) => void;
    obscureBottomChrome?: boolean;
    enabledTools?: TableTool[];
    accountsEnabled?: boolean;
    lifecycleAction?: ReactNode;
    showReactions?: boolean;
    fixedChrome?: boolean;
};

export default function TableFrame({
    children,
    memberCount,
    chatUnreadCount = 0,
    renderToolContent,
    reactions,
    onEmitReaction,
    onRemoveReaction,
    desktopAccessory,
    mobileAccessory,
    fullBleed = false,
    desktopToolsAtBottom = false,
    mainClassName = "w-full max-w-xl",
    contentClassName = "",
    onBottomChromeInsetChange,
    onActiveToolChange,
    obscureBottomChrome = false,
    enabledTools = tableTools.map(({ id }) => id),
    accountsEnabled = false,
    lifecycleAction,
    showReactions = true,
    fixedChrome = false,
}: Props) {
    const { t } = useTranslation();
    const [activeTool, setActiveTool] = useState<TableTool | null>(null);
    const { state: progressState } = useTable();
    const { respondPostGame } = useTableSocket();
    const progressId = progressState.tableView?.post_game_transition?.seating_blocked
        ? progressState.tableView.post_game_transition.id
        : progressState.tableView?.end_game_confirmation?.status === 'pending' ? progressState.tableView.end_game_confirmation.id : null;
    const seenProgressId = useRef<string | null>(null);
    useEffect(() => {
        if (!progressId || seenProgressId.current === progressId) return;
        seenProgressId.current = progressId;
        setActiveTool(current => current ?? 'people');
    }, [progressId]);
    const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
    const [isContentTranslucent, setIsContentTranslucent] = useState(false);
    const [suppressHighlightSlide, setSuppressHighlightSlide] = useState(false);
    const [desktopPanelMaxHeight, setDesktopPanelMaxHeight] = useState<number | null>(null);
    const frameRef = useRef<HTMLDivElement | null>(null);
    const desktopReactionRef = useRef<HTMLDivElement | null>(null);
    const desktopActionRef = useRef<HTMLDivElement | null>(null);
    const mobileFullBleedChromeRef = useRef<HTMLDivElement | null>(null);
    const desktopToolAreaRef = useRef<HTMLDivElement | null>(null);
    const isMobileLayout = useIsMobileLayout();
    const visibleTableTools = tableTools.filter(({ id }) => enabledTools.includes(id));

    useEffect(() => {
        if (!activeTool || !suppressHighlightSlide) return;

        const timeout = window.setTimeout(() => {
            setSuppressHighlightSlide(false);
        }, 220);

        return () => window.clearTimeout(timeout);
    }, [activeTool, suppressHighlightSlide]);

    useEffect(() => {
        if (!isLeaderboardOpen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsLeaderboardOpen(false);
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [isLeaderboardOpen]);

    useEffect(() => {
        setIsContentTranslucent(false);
        onActiveToolChange?.(activeTool);
        refreshSafariThemeColor();
    }, [activeTool, onActiveToolChange]);

    useEffect(() => {
        if (activeTool) return;
        setIsContentTranslucent(false);
        const timeout = window.setTimeout(refreshSafariThemeColor, 450);

        return () => window.clearTimeout(timeout);
    }, [activeTool]);

    useEffect(() => {
        if (isMobileLayout || !activeTool) return;

        const handlePointerDown = (event: PointerEvent) => {
            // A personal decision overlays the tool panel; answering it should
            // return to the same People or Chat panel.
            if (event.target instanceof Element && event.target.closest('.k-dialog')) return;
            if (desktopToolAreaRef.current?.contains(event.target as Node)) {
                return;
            }

            setActiveTool(null);
        };

        document.addEventListener("pointerdown", handlePointerDown);

        return () => document.removeEventListener("pointerdown", handlePointerDown);
    }, [activeTool, isMobileLayout]);

    useEffect(() => {
        if (isMobileLayout) {
            setDesktopPanelMaxHeight(null);
            return;
        }

        const measure = () => {
            const frameRect = frameRef.current?.getBoundingClientRect();
            const toolAreaRect = desktopToolAreaRef.current?.getBoundingClientRect();

            if (!frameRect || !toolAreaRect) {
                setDesktopPanelMaxHeight(null);
                return;
            }

            const panelTop = toolAreaRect.bottom + 12;
            const panelBottomMargin = 16;
            const availableHeight = desktopToolsAtBottom
                ? toolAreaRect.top - 12 - Math.max(0, frameRect.top) - 16
                : Math.min(window.visualViewport?.height ?? window.innerHeight,
                    fixedChrome ? window.innerHeight : frameRect.bottom) - panelTop - panelBottomMargin;
            setDesktopPanelMaxHeight(Math.max(0, Math.floor(availableHeight)));
        };

        measure();
        const observer = new ResizeObserver(measure);
        if (frameRef.current) observer.observe(frameRef.current);
        if (desktopToolAreaRef.current) observer.observe(desktopToolAreaRef.current);
        window.addEventListener("resize", measure);
        window.visualViewport?.addEventListener("resize", measure);
        window.visualViewport?.addEventListener("scroll", measure);

        return () => {
            observer.disconnect();
            window.removeEventListener("resize", measure);
            window.visualViewport?.removeEventListener("resize", measure);
            window.visualViewport?.removeEventListener("scroll", measure);
        };
    }, [activeTool, desktopAccessory, isMobileLayout, fixedChrome, desktopToolsAtBottom]);

    useEffect(() => {
        if (!onBottomChromeInsetChange) return;

        const measure = () => {
            const frameRect = frameRef.current?.getBoundingClientRect();
            if (!frameRect) return;

            const measuredElements = isMobileLayout
                ? [mobileFullBleedChromeRef.current]
                : [desktopReactionRef.current, desktopToolsAtBottom ? desktopToolAreaRef.current : desktopActionRef.current];

            const bottomInset = measuredElements.reduce((maxInset, element) => {
                if (!element) return maxInset;

                const rect = element.getBoundingClientRect();
                return Math.max(maxInset, frameRect.bottom - rect.top);
            }, 0);

            onBottomChromeInsetChange(Math.ceil(bottomInset));
        };

        measure();

        const observer = new ResizeObserver(measure);
        const observedElements: (Element | null)[] = [
            frameRef.current,
            desktopReactionRef.current,
            desktopActionRef.current,
            desktopToolAreaRef.current,
            mobileFullBleedChromeRef.current,
        ];

        observedElements.forEach((element) => {
            if (element) observer.observe(element);
        });
        window.addEventListener("resize", measure);
        window.visualViewport?.addEventListener("resize", measure);
        window.visualViewport?.addEventListener("scroll", measure);

        return () => {
            observer.disconnect();
            window.removeEventListener("resize", measure);
            window.visualViewport?.removeEventListener("resize", measure);
            window.visualViewport?.removeEventListener("scroll", measure);
        };
    }, [isMobileLayout, onBottomChromeInsetChange, desktopToolsAtBottom]);

    const selectTool = (tool: TableTool) => {
        setIsContentTranslucent(false);
        setActiveTool((currentTool) => {
            if (currentTool === tool) {
                setSuppressHighlightSlide(false);
                return null;
            }

            setSuppressHighlightSlide(currentTool === null);
            return tool;
        });
    };

    const toolSwitcher = (
        <Segmented
            rounded
            strong
            className={`h-11 w-auto ${activeTool
                ? `${suppressHighlightSlide
                    ? "[&>span:last-child]:!transition-[opacity,filter]"
                    : "[&>span:last-child]:!transition-[transform,opacity,filter]"
                } [&>span:last-child]:opacity-100 [&>span:last-child]:blur-0`
                : "[&>span:last-child]:!transition-[opacity,filter] [&>span:last-child]:opacity-0 [&>span:last-child]:blur-sm"
                }`}
        >
            {visibleTableTools.map(({ id, icon: Icon }) => {
                const active = activeTool === id;
                const label = t(`table.tool.${id}`);
                const badgeVisibilityClass = active
                    ? "opacity-0"
                    : "opacity-100";

                return (
                    <SegmentedButton
                        key={id}
                        type="button"
                        active={active}
                        aria-label={label}
                        aria-pressed={active}
                        title={label}
                        onClick={() => selectTool(id)}
                        className="relative h-full aspect-square px-0"
                    >
                        <Icon size={20} strokeWidth={2} />
                        {id === "people" && memberCount > 0 && (
                            <Badge
                                small
                                colors={{
                                    bg: "bg-ios-light-surface-2 dark:bg-ios-dark-surface-2",
                                    text: "text-black dark:text-white",
                                }}
                                className={`pointer-events-none absolute right-1 top-1 min-w-4 ring-1 ring-black/10 transition-opacity dark:ring-white/15 ${badgeVisibilityClass}`}
                            >
                                {memberCount}
                            </Badge>
                        )}
                        {id === "chat" && chatUnreadCount > 0 && (
                            <Badge
                                small
                                className={`pointer-events-none absolute right-1 top-1 min-w-4 transition-opacity ${badgeVisibilityClass}`}
                            >
                                {chatUnreadCount}
                            </Badge>
                        )}
                    </SegmentedButton>
                );
            })}
        </Segmented>
    );
    const openLeaderboard = () => {
        setIsLeaderboardOpen(true);
    };
    const renderActiveToolContent = () => {
        if (!activeTool) return null;

        return renderToolContent(activeTool, {
            setContentTranslucent: setIsContentTranslucent,
            openLeaderboard: accountsEnabled ? openLeaderboard : undefined,
        });
    };
    const translucentGlassColors = {
        shadowIos: glassWithoutLightInsetShadow,
        bgIos: isContentTranslucent
            ? "bg-ios-light-glass/5 dark:bg-ios-dark-glass/5"
            : "bg-ios-light-glass dark:bg-ios-dark-glass",
    };
    const sheetColors = isContentTranslucent
        ? {
            bgIos: "bg-ios-light-surface-1/5 dark:bg-ios-dark-surface-1/5",
        }
        : undefined;
    const sheetClassName = `${activeTool === "chat"
        ? "h-[85svh] overflow-hidden p-4 pb-6"
        : activeTool === "people" ? "flex max-h-[85svh] flex-col overflow-hidden p-4 pb-6" : mobileSheetClassName
        } ${isContentTranslucent ? mobileSheetTranslucentClassName : ""}`;
    const sheetBackdrop = !isContentTranslucent;
    const shouldHideMobileChrome = isMobileLayout && !!activeTool;
    const bottomChromeVisibilityClass = obscureBottomChrome || shouldHideMobileChrome
        ? "pointer-events-none opacity-0"
        : "opacity-100";
    const reactionChromeVisibilityClass = obscureBottomChrome || (isMobileLayout && !!activeTool)
        ? "pointer-events-none opacity-0"
        : "opacity-100";
    const overlayChromeVisibilityClass = obscureBottomChrome
        ? "pointer-events-none opacity-0"
        : "opacity-100";
    const chromePosition = fixedChrome ? "fixed" : "absolute";
    const desktopTools = (
                    <div
                        ref={desktopToolAreaRef}
                        className={`${desktopToolsAtBottom ? `${chromePosition} bottom-4 right-4 z-10 domino-desktop-tools` : "relative"} w-max transition-opacity ${overlayChromeVisibilityClass}`}
                    >
                        {toolSwitcher}

                        {desktopAccessory && !activeTool && (
                            <div
                                className={`absolute right-0 ${desktopToolsAtBottom ? "bottom-full mb-3" : "top-full mt-3"} overflow-visible`}
                                style={{
                                    maxHeight: desktopPanelMaxHeight
                                        ? `${desktopPanelMaxHeight}px`
                                        : undefined,
                                }}
                            >
                                {desktopAccessory}
                            </div>
                        )}

                        {activeTool && (
                            <Glass
                                highlight={false}
                                colors={translucentGlassColors}
                                className={`absolute right-0 ${desktopToolsAtBottom ? "bottom-full mb-3" : "top-full mt-3"} box-border flex min-h-0 w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[28px] p-4 transition-colors ${isContentTranslucent ? "opacity-45 backdrop-blur-0" : ""}`}
                                style={{
                                    height: activeTool === "chat"
                                        ? (desktopPanelMaxHeight
                                            ? `${Math.min(desktopPanelMaxHeight, 512)}px`
                                            : "min(32rem, calc(100svh - 6rem))")
                                        : undefined,
                                    maxHeight: desktopPanelMaxHeight
                                        ? `${desktopPanelMaxHeight}px`
                                        : "calc(100svh - 6rem)",
                                }}
                            >
                                <div className={`min-h-0 flex-1 ${activeTool === "people" ? "flex flex-col overflow-hidden" : activeTool === "chat" ? "overflow-hidden" : "overflow-y-auto"}`}>
                                    {renderActiveToolContent()}
                                </div>
                            </Glass>
                        )}
                    </div>
    );
    return (
        <KonstaApp theme="ios" safeAreas={false} className="min-h-[100svh]">
            <div
                ref={frameRef}
                className={`relative bg-transparent ${fullBleed ? "flex h-[100svh] flex-col overflow-hidden" : "min-h-[100svh] overflow-visible p-4 pt-20"}`}
            >
                <Navbar
                    className={`${fixedChrome ? "!fixed" : "!absolute"} left-0 !z-10 ${fullBleed ? "[&>div:first-child]:hidden" : ""}`}
                    bgClassName={fullBleed ? "hidden" : undefined}
                    innerClassName="items-start"
                >
                    <Logo />

                {isMobileLayout && (
                    <div className="flex flex-col items-end gap-2">
                        {lifecycleAction ?? <TableLifecycleAction />}
                        {mobileAccessory}
                    </div>
                )}

                {!isMobileLayout && !desktopToolsAtBottom && desktopTools}

                </Navbar>
                {!isMobileLayout && desktopToolsAtBottom && desktopTools}

                {!isMobileLayout && (
                    <div ref={desktopReactionRef} className={`${chromePosition} bottom-4 left-4 z-10 h-11 transition-opacity ${reactionChromeVisibilityClass}`}>
                        {showReactions && <ReactionBar
                            reactions={REACTIONS}
                            onEmit={onEmitReaction}
                        />}
                    </div>
                )}

                {!isMobileLayout && (
                    <div ref={desktopActionRef} className={`${chromePosition} ${desktopToolsAtBottom ? "top-4 left-4" : "bottom-4 right-4"} z-10 transition-opacity ${overlayChromeVisibilityClass}`}>
                        {lifecycleAction ?? <TableLifecycleAction />}
                    </div>
                )}

                {isMobileLayout && !fullBleed && (
                    <>
                        <div
                            className={`${chromePosition} bottom-4 left-4 right-4 z-10 flex items-center justify-between gap-3 overflow-visible transition-opacity ${bottomChromeVisibilityClass}`}
                        >
                            <div className="h-11 shrink-0">
                                {showReactions && <ReactionBar
                                    reactions={REACTIONS}
                                    onEmit={onEmitReaction}
                                />}
                            </div>
                            <div className={`${fullBleed ? "h-full" : ""} shrink-0`}>
                                {toolSwitcher}
                            </div>
                        </div>
                        <Sheet
                            opened={!!activeTool}
                            backdrop={!!activeTool && sheetBackdrop}
                            colors={sheetColors}
                            onBackdropClick={() => setActiveTool(null)}
                            className={sheetClassName}
                        >
                            <div className={activeTool === "chat" ? "flex h-full min-h-0 flex-col" : activeTool === "people" ? "flex min-h-0 flex-1 flex-col" : ""}>
                                <div className="mb-2 flex justify-end px-safe-4">
                                    <Button
                                        type="button"
                                        inline
                                        clear
                                        rounded
                                        onClick={() => setActiveTool(null)}
                                        className="h-9 px-2"
                                    >
                                        {t("table.action.done")}
                                    </Button>
                                </div>
                                <div className={activeTool === "people" ? "flex min-h-0 flex-1 flex-col overflow-hidden" : activeTool === "chat" ? "min-h-0 flex-1" : ""}>
                                    {renderActiveToolContent()}
                                </div>
                            </div>
                        </Sheet>
                    </>
                )}

                <main
                    className={`relative z-[1] ${fullBleed ? "min-h-0 flex-1" : "mx-auto"} ${mainClassName}`}
                >
                    <div className={contentClassName}>
                        {children}
                    </div>
                </main>

                {isMobileLayout && fullBleed && (
                    <>
                        <div
                            ref={mobileFullBleedChromeRef}
                            className={`absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between gap-3 overflow-visible px-2 py-2 transition-opacity sm:px-4 ${bottomChromeVisibilityClass}`}
                        >
                            <div className="h-11 shrink-0">
                                {showReactions && <ReactionBar
                                    reactions={REACTIONS}
                                    onEmit={onEmitReaction}
                                />}
                            </div>
                            <div className="shrink-0">
                                {toolSwitcher}
                            </div>
                        </div>
                        <Sheet
                            opened={!!activeTool}
                            backdrop={!!activeTool && sheetBackdrop}
                            colors={sheetColors}
                            onBackdropClick={() => setActiveTool(null)}
                            className={sheetClassName}
                        >
                            <div className={activeTool === "chat" ? "flex h-full min-h-0 flex-col" : activeTool === "people" ? "flex min-h-0 flex-1 flex-col" : ""}>
                                <div className="mb-2 flex justify-end px-safe-4">
                                    <Button
                                        type="button"
                                        inline
                                        clear
                                        rounded
                                        onClick={() => setActiveTool(null)}
                                        className="h-9 px-2"
                                    >
                                        {t("table.action.done")}
                                    </Button>
                                </div>
                                <div className={activeTool === "people" ? "flex min-h-0 flex-1 flex-col overflow-hidden" : activeTool === "chat" ? "min-h-0 flex-1" : ""}>
                                    {renderActiveToolContent()}
                                </div>
                            </div>
                        </Sheet>
                    </>
                )}

                {progressState.tableView?.post_game_transition && progressState.selfMemberId ? <PostGameDialog
                    transition={progressState.tableView.post_game_transition}
                    selfId={progressState.selfMemberId}
                    onRespond={respondPostGame}
                    memberNames={Object.fromEntries(Object.entries(progressState.tableView.members).map(([id, member]) => [id, member.name]))}
                /> : null}
                <EndGameConfirmationDialog />
                <UnseatConfirmationDialog />
                <ViewerReactions
                    reactions={reactions}
                    onRemoveReaction={onRemoveReaction}
                />

                {accountsEnabled && isLeaderboardOpen ? (
                    <Popup
                        opened
                        onBackdropClick={() => setIsLeaderboardOpen(false)}
                        role="dialog"
                        aria-modal="true"
                        aria-label={t("leaderboard.title")}
                        className="!h-auto !w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] max-h-[calc(100svh-2rem)] overflow-y-auto rounded-[28px] p-3 !transition-none sm:!w-fit sm:p-4"
                    >
                        <LeaderboardScreen onBack={() => setIsLeaderboardOpen(false)} />
                    </Popup>
                ) : null}
            </div>
        </KonstaApp>
    );
}
