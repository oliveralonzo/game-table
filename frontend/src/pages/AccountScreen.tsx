import { useEffect, useState } from "react";
import {
    SignIn,
    SignOutButton,
    SignUp,
    useAuth,
    useUser,
} from "@clerk/react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import {
    Button,
    Segmented,
    SegmentedButton,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
} from "konsta/react";
import { useTranslation } from "react-i18next";
import { useSession } from "game-table/context/SessionContext";
import { useTableSocket } from "game-table/context/TableSocket";
import { generateNickname } from "game-table/utils/nicknameGenerator";
import { getNameInitials } from "game-table/utils/playerInitialLabels";

type AccountView = {
    id: string;
    username: string;
    table_nickname: string | null;
    rating: number | null;
};

type AccountAck =
    | { account: AccountView | null }
    | { error: string; code?: string; message: string };

type AccountHistoryEntry = {
    game_history_id: string;
    completed_at: number;
    table_code: string;
    rounds_played: number;
    team_scores: number[];
    team_player_count: number | null;
    winning_team_index: number;
    seat_index: number;
    team_index: number;
    won: boolean;
    points_for: number;
    points_against: number;
    teammates: AccountHistoryParticipant[];
    opponents: AccountHistoryParticipant[];
};

type AccountHistoryParticipant = {
    account_id: string;
    username: string;
    seat_index: number;
    team_index: number;
};

type AccountHistoryAck =
    | {
        history: AccountHistoryEntry[];
        page: number;
        page_size: number;
        has_more: boolean;
        games_played: number;
        games_won: number;
    }
    | { error: string; code?: string; message: string };

type UsernameAvailabilityAck =
    | { username: string; username_key: string; available: boolean }
    | { error: string; code?: string; message: string };

type UsernameAvailabilityState =
    | { status: "idle" }
    | { status: "checking"; username: string }
    | { status: "available"; username: string }
    | { status: "taken"; username: string }
    | { status: "error"; username: string; message: string };

type Props = {
    onBack: () => void;
    afterAuthUrl: string;
};

const HISTORY_PAGE_SIZE = 10;

const clerkAuthAppearance = {
    elements: {
        rootBox: {
            width: "100%",
            maxWidth: "100%",
        },
        cardBox: {
            width: "100%",
            maxWidth: "100%",
        },
        card: {
            width: "100%",
            maxWidth: "100%",
            boxSizing: "border-box",
        },
        footerAction: {
            display: "none",
        },
        footerActionLink: {
            display: "none",
        },
    },
};

function AccountProfileSkeleton() {
    return (
        <div className="grid gap-5" aria-hidden="true">
            <section className="grid justify-items-center gap-4 px-2 text-center">
                <div className="h-16 w-16 rounded-full bg-ios-light-surface-2 ring-1 ring-black/10 dark:bg-ios-dark-surface-2 dark:ring-white/15" />
                <div className="grid w-full justify-items-center gap-2">
                    <div className="h-6 w-36 rounded-full bg-ios-light-surface-2 dark:bg-ios-dark-surface-2" />
                    <div className="h-4 w-24 rounded-full bg-ios-light-surface-2 dark:bg-ios-dark-surface-2" />
                </div>
            </section>

            <section className="grid gap-2">
                <div className="grid grid-cols-2 gap-2">
                    <div className="h-10 rounded-full bg-ios-light-surface-2 dark:bg-ios-dark-surface-2" />
                    <div className="h-10 rounded-full bg-ios-light-surface-2 dark:bg-ios-dark-surface-2" />
                </div>
            </section>

            <div className="h-11 rounded-full bg-ios-light-surface-2 dark:bg-ios-dark-surface-2" />

            <section className="grid gap-2">
                <div className="h-3 w-16 rounded-full bg-ios-light-surface-2 dark:bg-ios-dark-surface-2" />
                <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-2xl bg-ios-light-surface-2 px-4 py-3 dark:bg-ios-dark-surface-2">
                        <div className="mx-auto h-7 w-10 rounded-full bg-black/10 dark:bg-white/10" />
                        <div className="mx-auto mt-2 h-3 w-20 rounded-full bg-black/10 dark:bg-white/10" />
                    </div>
                    <div className="rounded-2xl bg-ios-light-surface-2 px-4 py-3 dark:bg-ios-dark-surface-2">
                        <div className="mx-auto h-7 w-10 rounded-full bg-black/10 dark:bg-white/10" />
                        <div className="mx-auto mt-2 h-3 w-20 rounded-full bg-black/10 dark:bg-white/10" />
                    </div>
                </div>
                <div className="h-10 rounded-full bg-ios-light-surface-2 dark:bg-ios-dark-surface-2" />
            </section>

            <section className="grid gap-2">
                <div className="h-3 w-20 rounded-full bg-black/10 dark:bg-white/10" />
                <div className="h-10 rounded-full bg-black/5 dark:bg-white/5" />
            </section>
        </div>
    );
}

function ClerkAuthSkeleton() {
    return (
        <div
            className="grid min-h-[25rem] gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/10 dark:bg-ios-dark-surface-2 dark:ring-white/10"
            aria-hidden="true"
        >
            <div className="grid gap-2">
                <div className="h-6 w-28 rounded-full bg-black/10 dark:bg-white/10" />
                <div className="h-4 w-44 max-w-full rounded-full bg-black/10 dark:bg-white/10" />
            </div>
            <div className="h-11 rounded-xl bg-black/10 dark:bg-white/10" />
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
                <div className="h-px bg-black/10 dark:bg-white/10" />
                <div className="h-3 w-10 rounded-full bg-black/10 dark:bg-white/10" />
                <div className="h-px bg-black/10 dark:bg-white/10" />
            </div>
            <div className="grid gap-2">
                <div className="h-3 w-20 rounded-full bg-black/10 dark:bg-white/10" />
                <div className="h-11 rounded-xl bg-black/10 dark:bg-white/10" />
            </div>
            <div className="grid gap-2">
                <div className="h-3 w-24 rounded-full bg-black/10 dark:bg-white/10" />
                <div className="h-11 rounded-xl bg-black/10 dark:bg-white/10" />
            </div>
            <div className="h-10 rounded-xl bg-black/10 dark:bg-white/10" />
            <div className="mx-auto h-3 w-32 rounded-full bg-black/10 dark:bg-white/10" />
        </div>
    );
}

function formatHistoryDate(timestamp: number, language: string) {
    return new Intl.DateTimeFormat(language, {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(new Date(timestamp));
}

function formatParticipants(
    participants: AccountHistoryParticipant[],
    fallback: string
) {
    if (participants.length === 0) {
        return {
            text: fallback,
            isPlaceholder: true,
        };
    }

    return {
        text: participants.map((participant) => `@${participant.username}`).join(", "),
        isPlaceholder: false,
    };
}

function HistoryParticipantCell({
    participants,
    fallback,
}: {
    participants: AccountHistoryParticipant[];
    fallback: string;
}) {
    const value = formatParticipants(participants, fallback);

    return (
        <div
            className={`truncate font-medium ${
                value.isPlaceholder
                    ? "italic text-black/35 dark:text-white/35"
                    : "text-black/70 dark:text-white/70"
            }`}
        >
            {value.text}
        </div>
    );
}

function AccountHistorySkeleton({ t }: { t: (key: string) => string }) {
    return (
        <div
            className="min-w-0 max-w-full overflow-x-auto overflow-y-hidden rounded-2xl bg-ios-light-surface-2 [scrollbar-width:none] dark:bg-ios-dark-surface-2 [&::-webkit-scrollbar]:hidden"
            aria-hidden="true"
        >
            <Table style={{ width: "max-content", minWidth: "100%" }}>
                <TableHead>
                    <TableRow header>
                        <TableCell header scope="col" className="whitespace-nowrap !pl-3 !pr-6">
                            {t("account.history.column.result")}
                        </TableCell>
                        <TableCell header scope="col" className="whitespace-nowrap !pl-2 !pr-6 text-right">
                            {t("account.history.column.score")}
                        </TableCell>
                        <TableCell header scope="col" className="whitespace-nowrap !pl-2 !pr-6">
                            {t("account.history.column.teammates")}
                        </TableCell>
                        <TableCell header scope="col" className="whitespace-nowrap !pl-2 !pr-6">
                            {t("account.history.column.opponents")}
                        </TableCell>
                        <TableCell header scope="col" className="whitespace-nowrap !pl-2 !pr-3 text-right">
                            {t("account.history.column.date")}
                        </TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {Array.from({ length: 4 }).map((_, index) => (
                        <TableRow key={index}>
                            <TableCell className="!pl-3 !pr-6">
                                <div className="h-4 w-14 rounded-full bg-black/10 dark:bg-white/10" />
                            </TableCell>
                            <TableCell className="!pl-2 !pr-6">
                                <div className="ml-auto h-4 w-12 rounded-full bg-black/10 dark:bg-white/10" />
                            </TableCell>
                            <TableCell className="!pl-2 !pr-6">
                                <div className="h-4 w-24 rounded-full bg-black/10 dark:bg-white/10" />
                            </TableCell>
                            <TableCell className="!pl-2 !pr-6">
                                <div className="h-4 w-28 rounded-full bg-black/10 dark:bg-white/10" />
                            </TableCell>
                            <TableCell className="!pl-2 !pr-3">
                                <div className="ml-auto h-4 w-20 rounded-full bg-black/10 dark:bg-white/10" />
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

export default function AccountScreen({ onBack, afterAuthUrl }: Props) {
    const { t, i18n } = useTranslation();
    const { isLoaded, isSignedIn, getToken } = useAuth();
    const { user } = useUser();
    const { displayName, setDisplayName } = useSession();
    const {
        checkUsernameAvailability,
        createAccount,
        deleteAccount,
        getAccount,
        listAccountHistory,
        renameUsername,
        updateAccountTableNickname,
    } = useTableSocket();
    const [authMode, setAuthMode] = useState<"signIn" | "signUp">("signIn");
    const [account, setAccount] = useState<AccountView | null>(null);
    const [username, setUsername] = useState("");
    const [usernameAvailability, setUsernameAvailability] =
        useState<UsernameAvailabilityState>({ status: "idle" });
    const [usernameDraft, setUsernameDraft] = useState("");
    const [usernameEditError, setUsernameEditError] = useState<string | null>(null);
    const [displayNameDraft, setDisplayNameDraft] = useState(displayName);
    const [isEditingName, setIsEditingName] = useState(false);
    const [isEditingUsername, setIsEditingUsername] = useState(false);
    const [isAccountLoading, setIsAccountLoading] = useState(false);
    const [hasCheckedAccount, setHasCheckedAccount] = useState(false);
    const [accountCheckFailed, setAccountCheckFailed] = useState(false);
    const [isCreatingAccount, setIsCreatingAccount] = useState(false);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);
    const [deleteUsernameDraft, setDeleteUsernameDraft] = useState("");
    const [history, setHistory] = useState<AccountHistoryEntry[]>([]);
    const [historyPage, setHistoryPage] = useState(1);
    const [historyHasMore, setHistoryHasMore] = useState(false);
    const [gamesPlayed, setGamesPlayed] = useState(0);
    const [gamesWon, setGamesWon] = useState(0);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const [accountView, setAccountView] =
        useState<"profile" | "history">("profile");
    const [status, setStatus] = useState<string | null>(null);
    const deleteUsernameMatches =
        account !== null && deleteUsernameDraft.trim() === account.username;
    const shouldShowAccountSkeleton =
        isSignedIn && (!hasCheckedAccount || isAccountLoading || isCreatingAccount);
    const cleanUsername = username.trim();
    const canCreateAccount =
        usernameAvailability.status === "available" &&
        usernameAvailability.username === cleanUsername &&
        !isCreatingAccount;
    const usernameAvailabilityMessage =
        usernameAvailability.status !== "idle" && usernameAvailability.username === cleanUsername
            ? usernameAvailability.status === "checking"
                ? t("account.status.usernameChecking")
                : usernameAvailability.status === "available"
                    ? t("account.status.usernameAvailable")
                    : usernameAvailability.status === "taken"
                        ? t("account.status.usernameTaken")
                        : usernameAvailability.status === "error"
                            ? usernameAvailability.message
                            : null
            : null;
    const screenTitle =
        accountView === "history"
            ? t("account.history.fullTitle")
            : isLoaded && isSignedIn && hasCheckedAccount && !account && !accountCheckFailed
            ? t("account.createUsernameTitle")
            : t("account.title");

    useEffect(() => {
        if (!isLoaded) {
            return;
        }

        if (!isSignedIn) {
            setAccount(null);
            setHasCheckedAccount(false);
            setAccountCheckFailed(false);
            setIsAccountLoading(false);
            setIsCreatingAccount(false);
            setIsConfirmingDelete(false);
            setIsDeletingAccount(false);
            setDeleteUsernameDraft("");
            setHistory([]);
            setHistoryPage(1);
            setHistoryHasMore(false);
            setGamesPlayed(0);
            setGamesWon(0);
            setIsHistoryLoading(false);
            setAccountView("profile");
            setStatus(null);
            return;
        }

        let isCurrent = true;
        setIsAccountLoading(true);
        setHasCheckedAccount(false);
        setAccountCheckFailed(false);

        getToken().then((token) => {
            if (!isCurrent) return;

            if (!token) {
                setIsAccountLoading(false);
                setHasCheckedAccount(true);
                setAccountCheckFailed(true);
                setStatus(t("account.status.signInAgain"));
                return;
            }

            getAccount(token, (response: AccountAck) => {
                if (!isCurrent) return;

                setIsAccountLoading(false);
                setHasCheckedAccount(true);

                if ("error" in response) {
                    setAccount(null);
                    setAccountCheckFailed(true);
                    setStatus(response.message);
                    return;
                }

                setAccountCheckFailed(false);
                setAccount(response.account);
                setUsernameDraft(response.account?.username ?? "");
                setDisplayName(response.account?.table_nickname ?? "");
                setDisplayNameDraft(response.account?.table_nickname ?? "");
                setIsEditingUsername(false);
                setIsConfirmingDelete(false);
                setIsDeletingAccount(false);
                setDeleteUsernameDraft("");
                setAccountView("profile");
                setStatus(null);
            });
        });

        return () => {
            isCurrent = false;
        };
    }, [getAccount, getToken, isLoaded, isSignedIn, t]);

    useEffect(() => {
        if (!isLoaded || !isSignedIn || !account) {
            setHistory([]);
            setHistoryPage(1);
            setHistoryHasMore(false);
            setGamesPlayed(0);
            setGamesWon(0);
            setIsHistoryLoading(false);
            return;
        }

        let isCurrent = true;
        setIsHistoryLoading(true);

        getToken().then((token) => {
            if (!isCurrent) return;

            if (!token) {
                setIsHistoryLoading(false);
                return;
            }

            listAccountHistory(
                token,
                historyPage,
                HISTORY_PAGE_SIZE,
                (response: AccountHistoryAck) => {
                    if (!isCurrent) return;

                    setIsHistoryLoading(false);
                    if ("error" in response) {
                        setStatus(response.message);
                        return;
                    }

                    setHistory(response.history);
                    setHistoryHasMore(response.has_more);
                    setGamesPlayed(response.games_played);
                    setGamesWon(response.games_won);
                }
            );
        });

        return () => {
            isCurrent = false;
        };
    }, [account, getToken, historyPage, isLoaded, isSignedIn, listAccountHistory]);

    useEffect(() => {
        if (!isSignedIn || account) {
            setUsernameAvailability({ status: "idle" });
            return;
        }

        const usernameToCheck = username.trim();
        if (!usernameToCheck) {
            setUsernameAvailability({ status: "idle" });
            return;
        }

        let isCurrent = true;
        setUsernameAvailability({ status: "checking", username: usernameToCheck });

        const timeoutId = window.setTimeout(() => {
            checkUsernameAvailability(usernameToCheck, (response: UsernameAvailabilityAck) => {
                if (!isCurrent) return;

                if ("error" in response) {
                    setUsernameAvailability({
                        status: "error",
                        username: usernameToCheck,
                        message: response.message,
                    });
                    return;
                }

                setUsernameAvailability({
                    status: response.available ? "available" : "taken",
                    username: usernameToCheck,
                });
            });
        }, 350);

        return () => {
            isCurrent = false;
            window.clearTimeout(timeoutId);
        };
    }, [account, checkUsernameAvailability, isSignedIn, username]);

    async function handleCreateAccount() {
        if (!canCreateAccount) return;

        setStatus(null);
        setIsCreatingAccount(true);
        const token = await getToken();
        if (!token) {
            setStatus(t("account.status.signInAgain"));
            setIsCreatingAccount(false);
            return;
        }

        createAccount(token, cleanUsername, (response: AccountAck) => {
            if ("error" in response) {
                setStatus(response.message);
                setIsCreatingAccount(false);
                return;
            }

            setAccount(response.account);
            setUsernameDraft(response.account?.username ?? "");
            setIsEditingUsername(false);
            setHasCheckedAccount(true);
            setIsCreatingAccount(false);
            setStatus(null);
        });
    }

    async function handleRenameUsername() {
        setStatus(null);
        setUsernameEditError(null);
        const token = await getToken();
        if (!token) {
            setUsernameEditError(t("account.status.signInAgain"));
            return;
        }

        renameUsername(token, usernameDraft, (response: AccountAck) => {
            if ("error" in response) {
                setUsernameEditError(response.message);
                return;
            }

            setAccount(response.account);
            setUsernameDraft(response.account?.username ?? "");
            setIsEditingUsername(false);
            setUsernameEditError(null);
            setStatus(t("account.status.usernameUpdated"));
        });
    }

    async function handleDeleteAccount() {
        if (!account) return;
        if (!deleteUsernameMatches) {
            setStatus(t("account.status.enterUsernameToConfirm"));
            return;
        }

        setStatus(null);
        setIsDeletingAccount(true);
        const token = await getToken();
        if (!token || !user) {
            setStatus(t("account.status.signInAgain"));
            setIsDeletingAccount(false);
            return;
        }

        deleteAccount(token, (response) => {
            if ("error" in response) {
                setStatus(response.message);
                setIsDeletingAccount(false);
                return;
            }

            user.delete()
                .then(() => {
                    setAccount(null);
                    setUsername("");
                    setUsernameDraft("");
                    setDeleteUsernameDraft("");
                    setIsEditingName(false);
                    setIsEditingUsername(false);
                    setIsConfirmingDelete(false);
                    setIsDeletingAccount(false);
                    setStatus(null);
                    window.location.assign("/");
                })
                .catch(() => {
                    setAccount(null);
                    setUsername("");
                    setUsernameDraft("");
                    setDeleteUsernameDraft("");
                    setIsEditingName(false);
                    setIsEditingUsername(false);
                    setIsConfirmingDelete(false);
                    setIsDeletingAccount(false);
                    setStatus(t("account.status.signInDeleteFailed"));
                });
        });
    }

    function handleCancelRename() {
        setUsernameDraft(account?.username ?? "");
        setIsEditingUsername(false);
        setUsernameEditError(null);
        setStatus(null);
    }

    function handleStartNameEdit() {
        setDisplayNameDraft(displayName);
        setIsEditingName(true);
        setIsEditingUsername(false);
        setIsConfirmingDelete(false);
        setStatus(null);
    }

    async function handleSaveName() {
        if (!account) return;

        setStatus(null);
        const token = await getToken();
        if (!token) {
            setStatus(t("account.status.signInAgain"));
            return;
        }

        updateAccountTableNickname(token, displayNameDraft, (response: AccountAck) => {
            if ("error" in response) {
                setStatus(response.message);
                return;
            }

            setAccount(response.account);
            const nickname = response.account?.table_nickname ?? "";
            setDisplayName(nickname);
            setDisplayNameDraft(nickname);
            setIsEditingName(false);
            setStatus(t("account.status.nicknameUpdated"));
        });
    }

    function handleCancelName() {
        setDisplayNameDraft(displayName);
        setIsEditingName(false);
        setStatus(null);
    }

    function handleGenerateName() {
        setDisplayNameDraft(generateNickname(i18n.language));
        setStatus(null);
    }

    function handleStartUsernameEdit() {
        if (!account) return;

        setUsernameDraft(account.username);
        setIsEditingUsername(true);
        setIsEditingName(false);
        setIsConfirmingDelete(false);
        setUsernameEditError(null);
        setStatus(null);
    }

    function handleStartDeleteAccount() {
        setDeleteUsernameDraft("");
        setIsConfirmingDelete(true);
        setIsEditingName(false);
        setIsEditingUsername(false);
        setStatus(null);
    }

    function handleCancelDeleteAccount() {
        setDeleteUsernameDraft("");
        setIsConfirmingDelete(false);
        setIsDeletingAccount(false);
        setStatus(null);
    }

    function handleBack() {
        if (accountView !== "profile") {
            setAccountView("profile");
            return;
        }

        onBack();
    }

    return (
        <section
            className={`mx-auto grid gap-5 ${
                accountView !== "profile"
                    ? "w-[min(42rem,calc(100vw-4rem))] max-w-full"
                    : "w-[min(28rem,calc(100vw-4rem))]"
            }`}
        >
            <div className="flex items-center justify-between gap-3">
                <Button
                    type="button"
                    clear
                    rounded
                    aria-label={t("join.action.back")}
                    title={t("join.action.back")}
                    onClick={handleBack}
                    className="!h-10 !w-10 transition-colors hover:bg-primary/10"
                >
                    <ArrowLeft size={20} strokeWidth={2.2} />
                </Button>
                <h1 className="min-w-0 flex-1 text-center text-xl font-semibold tracking-normal text-black dark:text-white">
                    {screenTitle}
                </h1>
                <span aria-hidden="true" className="h-10 w-10" />
            </div>

            {!isSignedIn ? (
                <div className="grid gap-4">
                    <Segmented strong rounded className="w-full">
                        <SegmentedButton
                            type="button"
                            active={authMode === "signIn"}
                            onClick={() => setAuthMode("signIn")}
                        >
                            {t("account.mode.signIn")}
                        </SegmentedButton>
                        <SegmentedButton
                            type="button"
                            active={authMode === "signUp"}
                            onClick={() => setAuthMode("signUp")}
                        >
                            {t("account.mode.signUp")}
                        </SegmentedButton>
                    </Segmented>

                    <div className="game-table-clerk-auth min-w-0 overflow-hidden rounded-2xl">
                        {!isLoaded ? (
                            <ClerkAuthSkeleton />
                        ) : authMode === "signIn" ? (
                            <SignIn
                                routing="hash"
                                forceRedirectUrl={afterAuthUrl}
                                appearance={clerkAuthAppearance}
                            />
                        ) : (
                            <SignUp
                                routing="hash"
                                forceRedirectUrl={afterAuthUrl}
                                appearance={clerkAuthAppearance}
                            />
                        )}
                    </div>
                </div>
            ) : (
                <div className="grid gap-4 text-sm text-black/65 dark:text-white/70">
                    {shouldShowAccountSkeleton ? (
                        <AccountProfileSkeleton />
                    ) : accountCheckFailed ? (
                        <div className="rounded-2xl bg-ios-light-surface-2 px-4 py-5 text-sm font-medium text-red-600 dark:bg-ios-dark-surface-2 dark:text-red-300">
                            {status ?? t("join.backendErrors.UNKNOWN")}
                        </div>
                    ) : account ? (
                        accountView === "history" ? (
                            <div className="grid min-w-0 max-w-full gap-3">
                                {isHistoryLoading ? (
                                    <AccountHistorySkeleton t={t} />
                                ) : history.length === 0 ? (
                                    <div className="rounded-2xl bg-ios-light-surface-2 px-4 py-3 text-sm text-black/55 dark:bg-ios-dark-surface-2 dark:text-white/55">
                                        {t("account.history.empty")}
                                    </div>
                                ) : (
                                    <div className="min-w-0 max-w-full overflow-x-auto overflow-y-hidden rounded-2xl bg-ios-light-surface-2 [scrollbar-width:none] dark:bg-ios-dark-surface-2 [&::-webkit-scrollbar]:hidden">
                                        <Table style={{ width: "max-content", minWidth: "100%" }}>
                                            <TableHead>
                                                <TableRow header>
                                                    <TableCell header scope="col" className="whitespace-nowrap !pl-3 !pr-6">
                                                        {t("account.history.column.result")}
                                                    </TableCell>
                                                    <TableCell header scope="col" className="whitespace-nowrap !pl-2 !pr-6 text-right">
                                                        {t("account.history.column.score")}
                                                    </TableCell>
                                                    <TableCell header scope="col" className="whitespace-nowrap !pl-2 !pr-6">
                                                        {t("account.history.column.teammates")}
                                                    </TableCell>
                                                    <TableCell header scope="col" className="whitespace-nowrap !pl-2 !pr-6">
                                                        {t("account.history.column.opponents")}
                                                    </TableCell>
                                                    <TableCell header scope="col" className="whitespace-nowrap !pl-2 !pr-3 text-right">
                                                        {t("account.history.column.date")}
                                                    </TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {history.map((entry) => (
                                                    <TableRow key={entry.game_history_id}>
                                                        <TableCell className="whitespace-nowrap !pl-3 !pr-6">
                                                            <div
                                                                className={`font-semibold ${
                                                                    entry.won
                                                                        ? "text-green-700 dark:text-green-400"
                                                                        : "text-black/70 dark:text-white/70"
                                                                }`}
                                                        >
                                                            {entry.won ? t("account.history.win") : t("account.history.loss")}
                                                        </div>
                                                        </TableCell>
                                                        <TableCell className="whitespace-nowrap !pl-2 !pr-6 text-right font-semibold tabular-nums text-black dark:text-white">
                                                            {entry.points_for}-{entry.points_against}
                                                        </TableCell>
                                                        <TableCell className="whitespace-nowrap !pl-2 !pr-6">
                                                            <HistoryParticipantCell
                                                                participants={entry.teammates}
                                                                fallback={
                                                                    entry.team_player_count === 1
                                                                        ? t("account.history.noPartnerFallback")
                                                                        : t("account.history.guestFallback")
                                                                }
                                                            />
                                                        </TableCell>
                                                        <TableCell className="whitespace-nowrap !pl-2 !pr-6">
                                                            <HistoryParticipantCell
                                                                participants={entry.opponents}
                                                                fallback={t("account.history.guestFallback")}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="whitespace-nowrap !pl-2 !pr-3 text-right text-xs font-medium text-black/45 dark:text-white/45">
                                                            {formatHistoryDate(entry.completed_at, i18n.language)}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                                {history.length > 0 && (historyPage > 1 || historyHasMore) ? (
                                    <div className="flex items-center justify-end gap-2">
                                        <span className="mr-1 text-xs font-medium text-black/45 dark:text-white/45">
                                            {t("account.history.page", { page: historyPage })}
                                        </span>
                                        <Button
                                            type="button"
                                            rounded
                                            outline
                                            aria-label={t("account.history.previous")}
                                            title={t("account.history.previous")}
                                            disabled={historyPage === 1 || isHistoryLoading}
                                            onClick={() => setHistoryPage((current) => Math.max(1, current - 1))}
                                            className="!h-9 !w-9 px-0"
                                        >
                                            <ChevronLeft size={18} strokeWidth={2.2} />
                                        </Button>
                                        <Button
                                            type="button"
                                            rounded
                                            outline
                                            aria-label={t("account.history.next")}
                                            title={t("account.history.next")}
                                            disabled={!historyHasMore || isHistoryLoading}
                                            onClick={() => setHistoryPage((current) => current + 1)}
                                            className="!h-9 !w-9 px-0"
                                        >
                                            <ChevronRight size={18} strokeWidth={2.2} />
                                        </Button>
                                    </div>
                                ) : null}
                            </div>
                        ) : (
	                        <div className="grid gap-5">
	                            <section className="grid justify-items-center gap-4 px-2 text-center">
	                                <div
	                                    aria-hidden="true"
	                                    className="grid h-16 w-16 place-items-center rounded-full bg-white text-xl font-semibold tabular-nums text-black ring-1 ring-[#A97142] dark:bg-white dark:text-black dark:ring-[#A97142]"
	                                >
	                                    {getNameInitials(displayName || account.username, "?")}
	                                </div>
	                                <div className="min-w-0 max-w-full">
	                                    <div
	                                        className={`truncate text-xl font-semibold ${
	                                            displayName
	                                                ? "text-black dark:text-white"
	                                                : "text-black/35 dark:text-white/35"
	                                        }`}
	                                    >
	                                        {displayName || t("account.placeholder.chooseNickname")}
	                                    </div>
	                                    <div className="mt-0.5 truncate text-sm font-medium text-black/45 dark:text-white/45">
	                                        @{account.username}
	                                    </div>
	                                </div>
	                            </section>

                                <section className="grid gap-2">
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button
                                            type="button"
                                            rounded
                                            outline
                                            className="h-10 px-3 text-sm font-semibold transition-colors hover:bg-primary/10"
                                            onClick={handleStartNameEdit}
                                        >
                                            {t("account.action.editNickname")}
                                        </Button>
                                        <Button
                                            type="button"
                                            rounded
                                            outline
                                            className="h-10 px-3 text-sm font-semibold transition-colors hover:bg-primary/10"
                                            onClick={handleStartUsernameEdit}
                                        >
                                            {t("account.action.editUsername")}
                                        </Button>
                                    </div>

                                    {isEditingName ? (
                                        <div className="grid gap-2 pt-1">
                                            <span className="px-1 text-xs font-medium leading-5 text-black/55 dark:text-white/55">
                                                {t("account.label.nickname")}
                                            </span>
                                            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                                                <input
                                                    type="text"
                                                    value={displayNameDraft}
                                                    onChange={(event) => setDisplayNameDraft(event.target.value)}
                                                    placeholder={t("account.placeholder.nickname")}
                                                    autoComplete="name"
                                                    className="h-11 min-w-0 rounded-2xl bg-white px-3 text-[16px] text-black outline-none ring-1 ring-black/10 transition focus:ring-2 focus:ring-primary dark:bg-black/20 dark:text-white dark:ring-white/15"
                                                />
                                                <Button
                                                    type="button"
                                                    tonal
                                                    rounded
                                                    title={t("join.action.generate")}
                                                    className="h-11 min-w-24 px-3 font-semibold transition-colors hover:bg-primary/25"
                                                    onClick={handleGenerateName}
                                                >
                                                    {t("join.action.generate")}
                                                </Button>
                                            </div>
                                            <div className="flex justify-end gap-2">
                                                <Button type="button" small rounded outline onClick={handleCancelName} className="transition-colors hover:bg-primary/10">
                                                    {t("account.action.cancel")}
                                                </Button>
                                                <Button type="button" small rounded onClick={handleSaveName} className="transition-opacity hover:opacity-80">
                                                    {t("account.action.save")}
                                                </Button>
                                            </div>
                                        </div>
                                    ) : null}

                                    {isEditingUsername ? (
                                        <div className="grid gap-2 pt-1">
                                            <span className="px-1 text-xs font-medium leading-5 text-black/55 dark:text-white/55">
                                                {t("account.label.username")}
                                            </span>
                                            <input
                                                type="text"
                                                value={usernameDraft}
                                                onChange={(event) => {
                                                    setUsernameDraft(event.target.value);
                                                    setUsernameEditError(null);
                                                }}
                                                placeholder={t("account.placeholder.username")}
                                                autoComplete="username"
                                                className="h-11 min-w-0 rounded-2xl bg-white px-3 text-[16px] text-black outline-none ring-1 ring-black/10 transition focus:ring-2 focus:ring-primary dark:bg-black/20 dark:text-white dark:ring-white/15"
                                            />
                                            <span
                                                className={`min-h-4 px-1 text-xs ${
                                                    usernameEditError
                                                        ? "text-red-500"
                                                        : "invisible"
                                                }`}
                                            >
                                                {usernameEditError ?? " "}
                                            </span>
                                            <div className="flex justify-end gap-2">
                                                <Button type="button" small rounded outline onClick={handleCancelRename} className="transition-colors hover:bg-primary/10">
                                                    {t("account.action.cancel")}
                                                </Button>
                                                <Button type="button" small rounded onClick={handleRenameUsername} className="transition-opacity hover:opacity-80">
                                                    {t("account.action.save")}
                                                </Button>
                                            </div>
                                        </div>
	                                    ) : null}
	                                </section>

                                <SignOutButton>
                                    <Button
                                        type="button"
                                        rounded
                                        outline
                                        colors={{
                                            textIos: "text-red-600 dark:text-red-400",
                                            outlineBgIos: "bg-transparent hover:bg-red-500/10 active:bg-red-500/15 dark:hover:bg-red-400/10 dark:active:bg-red-400/15",
                                            outlineBorderIos: "border-red-600/60 dark:border-red-400/60",
                                        }}
                                        className="h-11 font-semibold"
                                    >
                                        {t("account.action.signOut")}
                                    </Button>
                                </SignOutButton>

                                <section className="grid gap-2">
                                    <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-black/35 dark:text-white/35">
                                        {t("account.section.history")}
                                    </h2>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="rounded-2xl bg-ios-light-surface-2 px-4 py-3 text-center dark:bg-ios-dark-surface-2">
                                            <div className="text-2xl font-semibold tabular-nums text-black dark:text-white">
                                                {isHistoryLoading ? "..." : gamesPlayed}
                                            </div>
                                            <div className="mt-0.5 text-xs font-medium text-black/45 dark:text-white/45">
                                                {t("account.history.gamesPlayed")}
                                            </div>
                                        </div>
                                        <div className="rounded-2xl bg-ios-light-surface-2 px-4 py-3 text-center dark:bg-ios-dark-surface-2">
                                            <div className="text-2xl font-semibold tabular-nums text-black dark:text-white">
                                                {isHistoryLoading ? "..." : gamesWon}
                                            </div>
                                            <div className="mt-0.5 text-xs font-medium text-black/45 dark:text-white/45">
                                                {t("account.history.gamesWon")}
                                            </div>
                                        </div>
                                    </div>

                                    <Button
                                        type="button"
                                        rounded
                                        outline
                                        className="h-10 px-3 text-sm font-semibold transition-colors hover:bg-primary/10"
                                        onClick={() => setAccountView("history")}
                                    >
                                        {t("account.history.viewFull")}
                                    </Button>
                                </section>

                                <section className="grid gap-2">
                                    <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-black/35 dark:text-white/35">
                                        {t("account.section.danger")}
                                    </h2>
                                    {isConfirmingDelete ? (
                                        <div className="grid gap-2">
                                            <span className="px-1 text-xs font-medium leading-5 text-black/55 dark:text-white/55">
                                                {t("account.status.deleteConfirm")}
                                            </span>
                                            <input
                                                type="text"
                                                value={deleteUsernameDraft}
                                                onChange={(event) => setDeleteUsernameDraft(event.target.value)}
                                                placeholder={account.username}
                                                autoComplete="off"
                                                disabled={isDeletingAccount}
                                                className="h-11 min-w-0 rounded-2xl bg-white px-3 text-[16px] text-black outline-none ring-1 ring-black/10 transition focus:ring-2 focus:ring-red-500/45 disabled:opacity-60 dark:bg-black/20 dark:text-white dark:ring-white/15"
                                            />
                                            <button
                                                type="button"
                                                disabled={!deleteUsernameMatches || isDeletingAccount}
                                                className={`h-10 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/45 ${
                                                    deleteUsernameMatches && !isDeletingAccount
                                                        ? "text-red-600 hover:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-400/10"
                                                        : "text-red-600/40 dark:text-red-400/40"
                                                }`}
                                                onClick={handleDeleteAccount}
                                            >
                                                {isDeletingAccount ? t("account.action.deleting") : t("account.action.deleteAccount")}
                                            </button>
                                            <button
                                                type="button"
                                                disabled={isDeletingAccount}
                                                className="justify-self-center rounded-full px-4 py-1.5 text-sm font-semibold text-black/55 transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15 disabled:opacity-60 dark:text-white/55 dark:hover:bg-white/10 dark:focus-visible:ring-white/20"
                                                onClick={handleCancelDeleteAccount}
                                            >
                                                {t("account.action.cancel")}
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            className="h-10 cursor-pointer rounded-full px-4 text-sm font-medium text-black/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:text-white/55 dark:focus-visible:ring-white/25"
                                            onClick={handleStartDeleteAccount}
                                        >
                                            {t("account.action.deleteAccount")}
                                        </button>
                                    )}
                                </section>
                            </div>
                        )
		                    ) : (
	                        <div className="grid gap-3">
	                            <label className="grid gap-1.5">
	                                <span className="px-1 text-xs font-medium leading-5 text-black/55 dark:text-white/55">
	                                    {t("account.label.username")}
                                </span>
	                                <input
	                                    type="text"
	                                    value={username}
                                    onChange={(event) => setUsername(event.target.value)}
                                    placeholder={t("account.placeholder.username")}
                                    autoComplete="username"
	                                    className="h-12 min-w-0 rounded-2xl bg-ios-light-surface-2 px-4 text-[17px] text-black outline-none ring-1 ring-black/10 transition focus:ring-2 focus:ring-primary dark:bg-ios-dark-surface-2 dark:text-white dark:ring-white/15"
	                                />
                                    <span
                                        className={`min-h-4 px-1 text-xs ${
                                            usernameAvailabilityMessage
                                                ? usernameAvailability.status === "available"
                                                    ? "font-medium text-primary"
                                                    : usernameAvailability.status === "taken" || usernameAvailability.status === "error"
                                                        ? "text-red-500"
                                                        : "text-black/55 dark:text-white/55"
                                                : "invisible"
                                        }`}
                                    >
                                        {usernameAvailabilityMessage ?? " "}
                                    </span>
	                            </label>
	                            <div className="flex justify-end">
	                                <Button
	                                    type="button"
	                                    rounded
	                                    disabled={!canCreateAccount}
	                                    onClick={handleCreateAccount}
	                                    className="transition-opacity hover:opacity-80 disabled:hover:opacity-50"
	                                >
                                    {t("account.action.create")}
                                </Button>
                            </div>
                        </div>
                    )}

                    {status ? (
                        <p className="px-1 text-xs text-black/55 dark:text-white/55">
                            {status}
                        </p>
                    ) : null}
                </div>
            )}
        </section>
    );
}
