/**
 * JoinScreen.tsx
 * Pure local UI (no session, no server, no lobby wiring)
 */

import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useTable } from "game-table/context/TableState";
import { useTableSocket } from "game-table/context/TableSocket";
import { useAuthSession } from "game-table/context/AuthSessionContext";
import Logo from "game-table/components/Logo";
import AccountScreen from "game-table/pages/AccountScreen";
import OpenTablesList from "game-table/components/OpenTablesList";
import LeaderboardScreen from "game-table/pages/LeaderboardScreen";
import { useSession } from "game-table/context/SessionContext";
import type { FrontendGamePlugin } from "game-table/gamePlugin";
import {
    backendErrorToJoinKey,
    resolveBackendErrorCode,
} from "game-table/i18n/backendErrors";
import { encodeTableCodePath, normalizeTableCode } from "game-table/utils/tableRoute";
import { glassWithoutLightInsetShadow } from "game-table/styles/glass";
import PlatformSettingsPanel from "game-table/components/PlatformSettingsPanel";
import NicknameSettings from "game-table/components/NicknameSettings";
import { ArrowLeft, ChartNoAxesColumn, Settings, UserRound } from "lucide-react";
import {
    App as KonstaApp,
    Button,
    Glass,
    Popover,
    Segmented,
    SegmentedButton,
} from "konsta/react";

/* ----------------------------- Code helpers ------------------------------ */

function generateCode(): string {
    const CONSONANTS = "BCDFGJKLMNPRSTV";
    const VOWELS = "AEIU";

    const rnd = (n: number) => {
        try {
            const a = new Uint32Array(1);
            crypto.getRandomValues(a);
            return a[0] % n;
        } catch {
            return Math.floor(Math.random() * n);
        }
    };

    const pick = (s: string) => s.charAt(rnd(s.length));

    const letters =
        pick(CONSONANTS) + pick(VOWELS) + pick(CONSONANTS) + pick(VOWELS);

    let digits = "";
    for (let i = 0; i < 4; i++) digits += String(rnd(10));

    return `${letters}-${digits}`;
}

type LookupStatus = "idle" | "checking" | "found" | "missing";

type Props = {
    gamePlugin: FrontendGamePlugin;
    urlTableCode?: string;
};

type JoinRouteState = {
    intent?: "join" | "create";
};

type JoinScreenPage = "join" | "leaderboard" | "account";
type UrlEntryPhase = "resolving" | "manual";

function hasAccountQuery(search: string): boolean {
    return new URLSearchParams(search).get("account") === "1";
}

function accountUrl(): string {
    return `${window.location.origin}${window.location.pathname}?account=1`;
}

function ButtonSpinner() {
    return (
        <svg
            className="h-4 w-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
        >
            <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
            />
            <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
        </svg>
    );
}

function UrlEntryLoading({ label }: { label: string }) {
    return (
        <div className="grid min-h-48 place-items-center px-6 py-8 text-center text-black dark:text-white">
            <div className="grid gap-4">
                <div className="text-2xl font-semibold tracking-normal">
                    {label}
                </div>
                <div className="mx-auto h-1.5 w-24 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
                    <div className="h-full w-1/2 animate-[loading-slide_1.05s_ease-in-out_infinite] rounded-full bg-black dark:bg-white" />
                </div>
            </div>
        </div>
    );
}

/* -------------------------------- Screen --------------------------------- */

export default function JoinScreen({ gamePlugin, urlTableCode }: Props) {

    const { t } = useTranslation();
    const SettingsPanel = gamePlugin.SettingsPanel;
    const navigate = useNavigate();
    const location = useLocation();
    const { state, dispatch } = useTable();
    const { displayName, setDisplayName } = useSession();
    const { getAuthToken, isAuthLoaded, isSignedIn, signOut } = useAuthSession();
    const clerkEnabled = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
    const accountsEnabled = gamePlugin.features.accounts && clerkEnabled;
    const {
        createTable,
        getAccount,
        joinTable,
        lookupTable,
        updateAccountTableNickname,
    } = useTableSocket();

    const [inputName, setInputName] = useState(displayName);
    const [committedName, setCommittedName] = useState(displayName);
    const [inputCode, setInputCode] = useState("");
    const routeState = location.state as JoinRouteState | null;
    const [mode, setMode] = useState<"join" | "create">(
        routeState?.intent === "create" ? "create" : "join"
    );
    const [lookupStatus, setLookupStatus] = useState<LookupStatus>("idle");
    const [accountMemberName, setAccountMemberName] = useState<string | null>(null);
    const [accountUsername, setAccountUsername] = useState<string | null>(null);
    const [hasResolvedAccountNickname, setHasResolvedAccountNickname] = useState(!accountsEnabled);
    const [hasAccountNickname, setHasAccountNickname] = useState(false);
    const [isAccountNicknameAvailableForTable, setIsAccountNicknameAvailableForTable] = useState(true);
    const [openTableAccountNames, setOpenTableAccountNames] = useState<Record<string, string>>({});
    const [joiningCode, setJoiningCode] = useState<string | null>(null);
    const [nameErrorKey, setNameErrorKey] = useState<string | null>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [urlEntryPhase, setUrlEntryPhase] = useState<UrlEntryPhase>("resolving");
    const [requiresManualUrlSubmit, setRequiresManualUrlSubmit] = useState(false);
    const [page, setPage] = useState<JoinScreenPage>(() => (
        hasAccountQuery(location.search) ? "account" : "join"
    ));
    const hasEditedJoinNameRef = useRef(false);
    const requestedAccountNicknameRef = useRef<string | null>(null);
    const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
    const normalizedUrlTableCode = normalizeTableCode(urlTableCode);
    const isUrlMode = normalizedUrlTableCode.length > 0;

    const isCreateMode = mode === "create";
    const canUseAccountMemberName = !isCreateMode && !!accountMemberName;
    const hasNameError = !!nameErrorKey;
    const canUseSavedAccountNickname =
        isUrlMode &&
        hasAccountNickname &&
        isAccountNicknameAvailableForTable &&
        !requiresManualUrlSubmit &&
        !hasNameError;
    const nameOk = canUseAccountMemberName || inputName.trim().length > 0;
    const codeOk = inputCode.trim().length > 0;
    const lookupCode = isUrlMode
        ? normalizedUrlTableCode
        : !isCreateMode
            ? inputCode.trim()
            : "";
    const canSubmit = isUrlMode
        ? isCreateMode
            ? nameOk && !hasNameError && codeOk && lookupStatus !== "idle" && lookupStatus !== "checking"
            : nameOk && !hasNameError && codeOk && lookupStatus === "found"
        : codeOk && (isCreateMode || lookupStatus === "found");
    const isResolvingUrlEntry =
        isUrlMode && page === "join" && urlEntryPhase !== "manual";

    const openTables = state.tableList;
    const activeTopTool = isSettingsOpen
        ? "settings"
        : page === "leaderboard"
            ? "leaderboard"
            : page === "account"
                ? "account"
                : null;

    useEffect(() => {
        if (!accountsEnabled && (page === "account" || page === "leaderboard")) {
            setPage("join");
        }
    }, [accountsEnabled, page]);

    useEffect(() => {
        if (!accountsEnabled) {
            setHasResolvedAccountNickname(true);
            return;
        }

        if (!isAuthLoaded) return;

        if (!isSignedIn) {
            setAccountUsername(null);
            setHasResolvedAccountNickname(true);
            return;
        }

        let isCurrent = true;
        getAuthToken().then((token) => {
            if (!isCurrent) return;

            if (!token) {
                setHasResolvedAccountNickname(true);
                return;
            }

            getAccount(token, (response) => {
                if (!isCurrent) return;

                setHasResolvedAccountNickname(true);

                if ("error" in response || !response.account) {
                    setAccountUsername(null);
                    return;
                }

                const nickname = response.account.table_nickname ?? "";
                setAccountUsername(response.account.username);
                requestedAccountNicknameRef.current = nickname.trim();
                if (!hasEditedJoinNameRef.current) {
                    setInputName(nickname);
                    setCommittedName(nickname);
                }
                setDisplayName(nickname);
                setHasAccountNickname(nickname.trim().length > 0);
                setIsAccountNicknameAvailableForTable(true);
            });
        });

        return () => {
            isCurrent = false;
        };
    }, [accountsEnabled, getAccount, getAuthToken, isAuthLoaded, isSignedIn, setDisplayName]);

    useEffect(() => {
        if (hasAccountQuery(location.search)) {
            setPage("account");
        }
    }, [location.search]);

    useEffect(() => {
        if (!isUrlMode) return;

        hasEditedJoinNameRef.current = false;
        setUrlEntryPhase("resolving");
        setRequiresManualUrlSubmit(false);
        setIsAccountNicknameAvailableForTable(true);
        setMode(routeState?.intent === "create" ? "create" : "join");
        setInputCode(normalizedUrlTableCode);
    }, [isUrlMode, normalizedUrlTableCode, routeState?.intent]);

    useEffect(() => {
        if (!lookupCode) {
            setLookupStatus("idle");
            setAccountMemberName(null);
            return;
        }

        let isCurrent = true;
        setLookupStatus("checking");

        const timeoutId = window.setTimeout(() => {
            lookupTable(lookupCode, (response) => {
                if (!isCurrent) return;

                if ("error" in response) {
                    setLookupStatus("missing");
                    setAccountMemberName(null);
                    return;
                }

                setLookupStatus(response.joinable ? "found" : "missing");
                setAccountMemberName(response.account_member_name ?? null);
            });
        }, 250);

        return () => {
            isCurrent = false;
            window.clearTimeout(timeoutId);
        };
    }, [lookupCode, lookupTable]);

    useEffect(() => {
        if (!isUrlMode || page !== "join") return;
        if (nameErrorKey) {
            setUrlEntryPhase("manual");
            return;
        }
        if (requiresManualUrlSubmit) {
            setUrlEntryPhase("manual");
            return;
        }
        if (!hasResolvedAccountNickname || lookupStatus === "idle" || lookupStatus === "checking") {
            setUrlEntryPhase("resolving");
            return;
        }
        if (lookupStatus === "missing" && !isCreateMode) {
            setUrlEntryPhase("manual");
            return;
        }
        setUrlEntryPhase("manual");
    }, [
        canUseAccountMemberName,
        canUseSavedAccountNickname,
        hasAccountNickname,
        hasResolvedAccountNickname,
        isAccountNicknameAvailableForTable,
        isCreateMode,
        isUrlMode,
        lookupStatus,
        nameErrorKey,
        page,
        requiresManualUrlSubmit,
    ]);

    useEffect(() => {
        if (isUrlMode || page !== "join" || openTables.length === 0) {
            setOpenTableAccountNames({});
            return;
        }

        let isCurrent = true;
        const nextNames: Record<string, string> = {};

        openTables.forEach((table) => {
            lookupTable(table.table_code, (response) => {
                if (!isCurrent || "error" in response) return;

                if (response.account_member_name) {
                    nextNames[table.table_code] = response.account_member_name;
                } else {
                    delete nextNames[table.table_code];
                }

                setOpenTableAccountNames({ ...nextNames });
            });
        });

        return () => {
            isCurrent = false;
        };
    }, [isUrlMode, lookupTable, openTables, page]);

    function handleJoinWithError(code: string) {
        if (!canUseAccountMemberName) {
            commitNicknamePreference(inputName);
        }
        setJoiningCode(code);
        joinTable(
            code,
            canUseAccountMemberName ? accountMemberName! : inputName.trim(),
            (message, errorCode) => {
                setJoiningCode(null);
                const resolvedCode = resolveBackendErrorCode(errorCode, message);

                if (resolvedCode === "TABLE_NOT_FOUND") {
                    setLookupStatus("missing");
                    return;
                }

                if (resolvedCode === "NAME_TAKEN" || resolvedCode === "NAME_REQUIRED") {
                    setUrlEntryPhase("manual");
                    setRequiresManualUrlSubmit(true);
                    setIsAccountNicknameAvailableForTable(false);
                    setNameErrorKey(backendErrorToJoinKey(errorCode, message));
                    return;
                }

                alert(t("join.dialog.joinFailed", {
                    message: t(backendErrorToJoinKey(errorCode, message)),
                }));
            },
            (tableCode) => {
                setJoiningCode(null);
                navigate(encodeTableCodePath(tableCode), { replace: true });
            }
        );
    }

    function handleJoinFromList(code: string) {
        if (joiningCode) return;

        setJoiningCode(code);
        lookupTable(code, (response) => {
            if ("error" in response) {
                setJoiningCode(null);
                alert(t("join.dialog.joinFailed", {
                    message: t(backendErrorToJoinKey(response.code, response.message)),
                }));
                return;
            }

            if (!response.joinable) {
                setJoiningCode(null);
                navigate(encodeTableCodePath(code), {
                    state: { intent: "join" },
                });
                return;
            }

            if (!response.account_member_name) {
                setJoiningCode(null);
                navigate(encodeTableCodePath(code), {
                    state: { intent: "join" },
                });
                return;
            }

            joinTable(
                code,
                response.account_member_name,
                (message, errorCode) => {
                    setJoiningCode(null);
                    alert(t("join.dialog.joinFailed", {
                        message: t(backendErrorToJoinKey(errorCode, message)),
                    }));
                },
                (tableCode) => {
                    setJoiningCode(null);
                    navigate(encodeTableCodePath(tableCode), { replace: true });
                }
            );
        });
    }

    function handleJoin() {
        if (!canSubmit || joiningCode) return;
        setRequiresManualUrlSubmit(false);

        if (!isUrlMode) {
            if (canUseAccountMemberName) {
                handleJoinWithError(inputCode.trim());
                return;
            }

            navigate(encodeTableCodePath(inputCode), {
                state: { intent: "join" },
            });
            return;
        }

        handleJoinWithError(inputCode.trim());
    }

    function handleCreate() {
        if (!canSubmit || joiningCode) return;
        setRequiresManualUrlSubmit(false);

        const code = inputCode.trim();
        const name = inputName.trim();

        if (!isUrlMode) {
            navigate(encodeTableCodePath(code), {
                state: { intent: "create" },
            });
            return;
        }

        setJoiningCode(code);
        commitNicknamePreference(name);
        createTable(code, name, (message, errorCode) => {
            const resolvedCode = resolveBackendErrorCode(errorCode, message);

            if (resolvedCode === "TABLE_ALREADY_EXISTS") {
                const shouldJoin = confirm(
                    t("join.dialog.tableAlreadyExistsJoin")
                );
                if (shouldJoin) {
                    joinTable(
                        code,
                        name,
                        (joinMsg, joinCode) => {
                            setJoiningCode(null);
                            const resolvedJoinCode = resolveBackendErrorCode(joinCode, joinMsg);
                            if (resolvedJoinCode === "NAME_TAKEN" || resolvedJoinCode === "NAME_REQUIRED") {
                                setUrlEntryPhase("manual");
                                setRequiresManualUrlSubmit(true);
                                setIsAccountNicknameAvailableForTable(false);
                                setNameErrorKey(backendErrorToJoinKey(joinCode, joinMsg));
                                return;
                            }

                            alert(t("join.dialog.joinFailed", {
                                message: t(backendErrorToJoinKey(joinCode, joinMsg)),
                            }));
                        },
                        (tableCode) => {
                            setJoiningCode(null);
                            navigate(encodeTableCodePath(tableCode), { replace: true })
                        }
                    );
                } else {
                    setJoiningCode(null);
                }
            } else {
                setJoiningCode(null);
                if (resolvedCode === "NAME_TAKEN" || resolvedCode === "NAME_REQUIRED") {
                    setUrlEntryPhase("manual");
                    setRequiresManualUrlSubmit(true);
                    setIsAccountNicknameAvailableForTable(false);
                    setNameErrorKey(backendErrorToJoinKey(errorCode, message));
                    return;
                }

                alert(t("join.dialog.createFailed", {
                    message: t(backendErrorToJoinKey(errorCode, message)),
                }));
            }
        }, (tableCode) => {
            setJoiningCode(null);
            navigate(encodeTableCodePath(tableCode), { replace: true });
        });
    }

    function handleCreateFromMissingCode() {
        setMode("create");
        if (!isUrlMode) {
            setLookupStatus("idle");
        }
    }

    function handleExitUrlMode() {
        setInputCode("");
        setLookupStatus("idle");
        navigate("/");
    }

    function handleDraftNameChange(name: string) {
        hasEditedJoinNameRef.current = true;
        setInputName(name);
        setNameErrorKey(null);
    }

    function saveAccountNicknamePreference(
        name: string,
        onSuccess?: () => void,
        onError?: (message: string, code?: string) => void,
    ) {
        if (requestedAccountNicknameRef.current === name) {
            onSuccess?.();
            return;
        }
        requestedAccountNicknameRef.current = name;

        getAuthToken().then((token) => {
            if (!token) {
                requestedAccountNicknameRef.current = null;
                if (isSignedIn) {
                    onError?.("Sign in again to continue.");
                } else {
                    onSuccess?.();
                }
                return;
            }

            updateAccountTableNickname(token, name, (response) => {
                if ("error" in response) {
                    requestedAccountNicknameRef.current = null;
                    onError?.(response.message, response.code);
                    return;
                }

                const savedNickname = response.account?.table_nickname ?? name;
                requestedAccountNicknameRef.current = savedNickname.trim();
                setHasAccountNickname(savedNickname.trim().length > 0);
                onSuccess?.();
            });
        });
    }

    function commitNicknamePreference(
        name: string,
        onSuccess?: () => void,
        onError?: (message: string, code?: string) => void,
    ) {
        const trimmedName = name.trim();
        if (!trimmedName) return;

        setInputName(trimmedName);
        setCommittedName(trimmedName);
        setDisplayName(trimmedName);
        saveAccountNicknamePreference(trimmedName, onSuccess, onError);
    }

    async function handleSignOut() {
        await signOut();
        setAccountUsername(null);
        setHasAccountNickname(false);
    }

    function handleSettingsClick() {
        setIsSettingsOpen((open) => !open);
    }

    function handleAccountClick() {
        setIsSettingsOpen(false);
        setPage("account");
        if (!hasAccountQuery(location.search)) {
            navigate(`${location.pathname}?account=1`, { replace: true });
        }
    }

    function handleLeaderboardClick() {
        setIsSettingsOpen(false);
        setPage("leaderboard");
        if (hasAccountQuery(location.search)) {
            navigate("/", { replace: true });
        }
    }

    function handleAccountBack() {
        setPage("join");
        if (hasAccountQuery(location.search)) {
            navigate(location.pathname, { replace: true });
        }
    }

    function handleLeaderboardBack() {
        setPage("join");
    }

    return (
        <KonstaApp theme="ios" safeAreas={false} className="min-h-[100svh]">
            <div className={`relative min-h-[100svh] flex flex-col items-center bg-transparent ${
                (page === "account" || page === "leaderboard") && accountsEnabled
                    ? "justify-start px-4 pb-4 pt-20"
                    : "justify-center p-4"
            }`}>
                <div className="absolute top-0 left-0 z-10 p-4">
                    <Logo />
                </div>
                <div className="absolute top-0 right-0 z-10 flex items-start gap-2 p-4">
                    <Segmented
                        rounded
                        strong
                        className={`h-11 w-auto ${activeTopTool
                            ? "[&>span:last-child]:opacity-100 [&>span:last-child]:blur-0"
                            : "[&>span:last-child]:!transition-[opacity,filter] [&>span:last-child]:opacity-0 [&>span:last-child]:blur-sm"
                            }`}
                    >
                        <SegmentedButton
                            ref={settingsButtonRef}
                            type="button"
                            active={activeTopTool === "settings"}
                            aria-label={t("table.tool.settings")}
                            aria-pressed={activeTopTool === "settings"}
                            title={t("table.tool.settings")}
                            onClick={handleSettingsClick}
                            className="relative h-full aspect-square px-0"
                        >
                            <Settings size={20} strokeWidth={2} />
                        </SegmentedButton>
                        {accountsEnabled ? (
                            <>
                                <SegmentedButton
                                    type="button"
                                    active={activeTopTool === "leaderboard"}
                                    aria-label={t("leaderboard.tool")}
                                    aria-pressed={activeTopTool === "leaderboard"}
                                    title={t("leaderboard.tool")}
                                    onClick={handleLeaderboardClick}
                                    className="relative h-full aspect-square px-0"
                                >
                                    <ChartNoAxesColumn size={20} strokeWidth={2} />
                                </SegmentedButton>
                                <SegmentedButton
                                    type="button"
                                    active={activeTopTool === "account"}
                                    aria-label={t("account.title")}
                                    aria-pressed={activeTopTool === "account"}
                                    title={t("account.title")}
                                    onClick={handleAccountClick}
                                    className="relative h-full aspect-square px-0"
                                >
                                    <UserRound size={20} strokeWidth={2} />
                                </SegmentedButton>
                            </>
                        ) : null}
                    </Segmented>
                    <Popover
                        opened={isSettingsOpen}
                        target={settingsButtonRef.current}
                        onBackdropClick={() => setIsSettingsOpen(false)}
                        className="!w-auto !max-w-none !overflow-visible !bg-transparent !shadow-none"
                    >
                        <Glass
                            highlight={false}
                            colors={{
                                shadowIos: glassWithoutLightInsetShadow,
                            }}
                            className="w-[22rem] max-w-[calc(100vw-2rem)] rounded-[28px] p-4"
                        >
                            <PlatformSettingsPanel
                                displayName={inputName}
                                onDisplayNameDraftChange={handleDraftNameChange}
                                onDisplayNameChange={(name: string, onSuccess?: () => void) => {
                                    handleDraftNameChange(name);
                                    onSuccess?.();
                                }}
                                showProfile={false}
                                routed
                            />
                        </Glass>
                    </Popover>
                </div>

                <Glass
                    highlight={false}
                    colors={{
                        shadowIos: glassWithoutLightInsetShadow,
                    }}
                    className={`rounded-[28px] ${
                        (page === "account" || page === "leaderboard") && accountsEnabled
                            ? "w-fit max-w-[calc(100vw-2rem)] p-3 sm:p-4"
                            : "w-full max-w-md p-5 sm:p-6"
                    }`}
                >
                    {page === "account" && accountsEnabled ? (
                        <AccountScreen
                            onBack={handleAccountBack}
                            afterAuthUrl={accountUrl()}
                        />
                    ) : page === "leaderboard" && accountsEnabled ? (
                        <LeaderboardScreen onBack={handleLeaderboardBack} />
                    ) : (
                        isResolvingUrlEntry ? (
                            <UrlEntryLoading
                                label={isCreateMode
                                    ? t("join.status.creatingTable")
                                    : t("join.status.joiningTable")}
                            />
                        ) : (
                        <form className="grid gap-5" onSubmit={(e) => e.preventDefault()}>
                            {isUrlMode ? (
                                <div className="grid gap-3">
                                    <Button
                                        type="button"
                                        clear
                                        rounded
                                        aria-label={t("join.action.back")}
                                        title={t("join.action.back")}
                                        onClick={handleExitUrlMode}
                                        className="!w-10 h-10"
                                    >
                                        <ArrowLeft size={20} strokeWidth={2.2} />
                                    </Button>

                                    <div className="grid gap-1 px-1">
                                        <span className="text-xs font-medium leading-5 text-black/55 dark:text-white/55">
                                            {isCreateMode
                                                ? t("join.status.creatingTable")
                                                : t("join.status.joiningTable")}
                                        </span>
                                        <div className="text-3xl font-semibold tracking-normal text-black dark:text-white">
                                            {normalizedUrlTableCode}
                                        </div>
                                    </div>

                                    <NicknameSettings
                                        value={committedName}
                                        onDraftChange={handleDraftNameChange}
                                        onChange={(
                                            name: string,
                                            onSuccess?: () => void,
                                            onError?: (message: string, code?: string) => void,
                                        ) => {
                                            commitNicknamePreference(name, onSuccess, onError);
                                        }}
                                        showGenerator={!accountUsername}
                                        compact
                                    />
                                    {nameErrorKey && (
                                        <span className="px-1 text-xs text-red-500">
                                            {t(nameErrorKey)}
                                        </span>
                                    )}
                                </div>
	                            ) : (
	                                <Segmented
                                    strong
                                    rounded
                                    className="w-full"
                                >
                                    <SegmentedButton
                                        type="button"
                                        active={mode === "join"}
                                        onClick={() => setMode("join")}
                                    >
                                        {t("join.mode.join")}
                                    </SegmentedButton>
                                    <SegmentedButton
                                        type="button"
                                        active={mode === "create"}
                                        onClick={() => setMode("create")}
                                    >
                                        {t("join.mode.create")}
                                    </SegmentedButton>
	                                </Segmented>
                            )}

                            {isUrlMode && accountsEnabled && (
                                <div className="px-1 text-sm text-black/55 dark:text-white/55">
                                    {accountUsername
                                        ? t("join.identity.account", { username: accountUsername })
                                        : t("join.identity.guest")}
                                    <span className="mx-1.5 text-black/25 dark:text-white/25">·</span>
                                    <button
                                        type="button"
                                        className={`font-medium underline underline-offset-2 ${
                                            accountUsername
                                                ? "text-black/55 dark:text-white/55"
                                                : "text-primary"
                                        }`}
                                        onClick={accountUsername ? handleSignOut : handleAccountClick}
                                    >
                                        {accountUsername
                                            ? t("account.action.signOut")
                                            : t("account.mode.signIn")}
                                    </button>
                                </div>
                            )}

                            <div className="grid gap-3">
                                {!isUrlMode && (
                                    <label className="grid gap-1.5">
                                        <span className="px-1 py-0.5 text-xs font-medium leading-5 text-black/55 dark:text-white/55">
                                            {t("join.field.tableCode")}
                                        </span>
                                        <div className={isCreateMode ? "grid grid-cols-[minmax(0,1fr)_auto] gap-2" : "grid"}>
                                            <input
                                                type="text"
                                                value={inputCode}
                                                onChange={(e) =>
                                                    setInputCode(
                                                        e.target.value
                                                            .toUpperCase()
                                                            .replace(/\s+/g, "-")
                                                    )
                                                }
                                                placeholder={t("join.placeholder.code")}
                                                inputMode="text"
                                                autoComplete="off"
                                                spellCheck={false}
                                                className="h-12 min-w-0 rounded-2xl bg-ios-light-surface-2 px-4 text-[17px] text-black outline-none ring-1 ring-black/10 transition focus:ring-2 focus:ring-primary dark:bg-ios-dark-surface-2 dark:text-white dark:ring-white/15"
                                            />

                                            {isCreateMode && (
                                                <Button
                                                    type="button"
                                                    tonal
                                                    rounded
                                                    disabled={!!inputCode.trim()}
                                                    onClick={() => setInputCode(generateCode())}
                                                    title={t("join.action.generate")}
                                                    className="h-12 min-w-28 px-4 font-semibold"
                                                >
                                                    {t("join.action.generate")}
                                                </Button>
                                            )}
                                        </div>
                                        {!isCreateMode && lookupStatus === "missing" && (
                                            <span className="px-1 text-xs text-red-500">
                                                {t("join.status.tableNotFound")}
                                                <span className="mx-1 text-black/30 dark:text-white/30">
                                                    ·
                                                </span>
                                                <button
                                                    type="button"
                                                    className="font-medium text-primary underline underline-offset-2"
                                                    onClick={handleCreateFromMissingCode}
                                                >
                                                    {t("join.action.create")}
                                                </button>
                                            </span>
                                        )}
                                        {!isCreateMode && lookupStatus === "found" && accountMemberName && (
                                            <span className="px-1 text-xs font-medium text-primary">
                                                {t("join.status.alreadyInTable")}
                                            </span>
                                        )}
                                    </label>
                                )}
                            </div>

                            {isUrlMode && lookupStatus === "missing" && !isCreateMode && (
                                <p className="px-1 text-sm text-red-500">
                                    {t("join.status.tableNotFound")}
                                    {!isCreateMode && (
                                        <>
                                            <span className="mx-1 text-black/30 dark:text-white/30">
                                                ·
                                            </span>
                                            <button
                                                type="button"
                                                className="font-medium text-primary underline underline-offset-2"
                                                onClick={handleCreateFromMissingCode}
                                            >
                                                {t("join.action.create")}
                                            </button>
                                        </>
                                    )}
                                </p>
                            )}

                            <div className="flex justify-end">
                                <Button
                                    type="button"
                                    inline
                                    rounded
                                    disabled={!canSubmit || !!joiningCode}
                                    aria-disabled={!canSubmit || !!joiningCode}
                                    onClick={isCreateMode ? handleCreate : handleJoin}
                                    className="h-11 px-4 font-semibold"
                                >
                                    {joiningCode === inputCode.trim() ? (
                                        <span className="inline-flex items-center justify-center">
                                            <ButtonSpinner />
                                        </span>
                                    ) : isCreateMode
                                        ? t("join.action.create")
                                        : t("join.action.join")}
                                </Button>
                            </div>
                        </form>
                        )
                    )}
                </Glass>

                {page === "join" && state.lastTableEvent && (
                    <Glass
                        highlight={false}
                        colors={{
                            shadowIos: glassWithoutLightInsetShadow,
                        }}
                        className="relative max-w-md w-full mt-3 rounded-2xl p-3 pr-12 text-sm text-black dark:text-white"
                    >
                        <span className="pr-3">
                            {t(
                                state.lastTableEvent.type === "removed"
                                    ? "join.status.tableRemoved"
                                    : state.lastTableEvent.type === "replaced"
                                    ? "join.status.tableReplaced"
                                    : "join.status.tableClosed",
                                { code: state.lastTableEvent.table_code }
                            )}
                        </span>

                        <Button
                            type="button"
                            clear
                            rounded
                            aria-label={t("join.action.dismiss")}
                            title={t("join.action.dismiss")}
                            onClick={() =>
                                dispatch({
                                    type: "SET_LAST_TABLE_EVENT",
                                    payload: null,
                                })
                            }
                            className="absolute inset-y-1 right-1 w-10"
                        >
                            ×
                        </Button>
                    </Glass>
                )}

                {page === "join" && !isUrlMode && (
                    <OpenTablesList
                        tables={openTables}
                        onJoin={handleJoinFromList}
                        enableJoin
                        joiningCode={joiningCode}
                        accountMemberNamesByCode={openTableAccountNames}
                    />
                )}
            </div>
        </KonstaApp>
    );
}
