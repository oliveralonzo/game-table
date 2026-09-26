import type { FrontendGamePlugin } from "game-table/gamePlugin";
import type { NicknameChangeHandler } from "game-table/components/NicknameSettings";
import { useEffect, useState, type ReactNode } from "react";
import { Button, Glass } from "konsta/react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { useAuthSession } from "game-table/context/AuthSessionContext";
import { useTableSocket } from "game-table/context/TableSocket";
import AppLoadingScreen from "game-table/components/AppLoadingScreen";
import { useGroupsCache } from "game-table/context/GroupsCacheContext";
import { glassWithoutLightInsetShadow } from "game-table/styles/glass";
import GroupLobby from "game-table/pages/GroupLobby";

export default function GroupsList({ groupId, gamePlugin, displayName, onDisplayNameChange }: { groupId?: string; gamePlugin: FrontendGamePlugin; displayName: string; onDisplayNameChange: NicknameChangeHandler }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useTranslation();
    const { authUserId, getAuthToken, isAuthLoaded, isSignedIn } = useAuthSession();
    const { listGroups, groupConnectionVersion } = useTableSocket();
    const [retry, setRetry] = useState(0);
    const { groups, saveGroups } = useGroupsCache();
    const [errorUserId, setErrorUserId] = useState<string | null>(null);
    const failed = !!authUserId && errorUserId === authUserId;

    useEffect(() => {
        let current = true;
        setErrorUserId(null);
        if (!isAuthLoaded || !isSignedIn) return;
        const fail = () => { if (current) setErrorUserId(authUserId); };
        // Also bound token retrieval so a stalled auth request offers a retry.
        const timer = window.setTimeout(() => { fail(); current = false; }, 15000);
        getAuthToken().then(token => {
            if (!current) return;
            if (!token) { fail(); window.clearTimeout(timer); return; }
            listGroups(token, response => {
                window.clearTimeout(timer);
                if ("error" in response) fail();
                else if (current) { saveGroups(response.groups); setErrorUserId(null); }
            });
        }).catch(() => { window.clearTimeout(timer); fail(); });
        return () => { current = false; window.clearTimeout(timer); };
    }, [authUserId, getAuthToken, isAuthLoaded, isSignedIn, listGroups, groupConnectionVersion, retry, groupId, saveGroups]);

    const entryFailure = !groupId && isSignedIn && location.state?.groupOpenFailed
        && location.state?.authUserId === authUserId
        ? <Glass highlight={false} colors={{ shadowIos: glassWithoutLightInsetShadow }}
            className="relative mt-3 rounded-2xl p-3 pr-12 text-sm text-black dark:text-white">
            <p role="alert">{t("groups.list.openError")}</p>
            <Button type="button" clear rounded aria-label={t("join.action.dismiss")}
                title={t("join.action.dismiss")} className="absolute inset-y-1 right-1 w-10"
                onClick={() => navigate(`${location.pathname}${location.search}`, {
                    replace: true, state: { ...location.state, groupOpenFailed: false },
                })}>×</Button>
        </Glass>
        : null;
    const retryNotice = <Glass highlight={false} colors={{ shadowIos: glassWithoutLightInsetShadow }}
        className="mt-3 flex items-center justify-between gap-3 rounded-2xl p-3 text-sm">
        <span role="alert" className="text-black/55 dark:text-white/55">{t("groups.list.loadError")}</span>
        <Button clear rounded inline onClick={() => setRetry(value => value + 1)}>{t("groups.list.retry")}</Button>
    </Glass>;
    const renderList = (content: ReactNode) => <div className="w-full max-w-md">
        <Glass highlight={false} colors={{ shadowIos: glassWithoutLightInsetShadow }} className="overflow-hidden rounded-[28px]">
            {content}
        </Glass>
        {failed && groups !== null && retryNotice}
        {entryFailure}
    </div>;
    const selected = groups?.find(group => group.public_id === groupId || (location.pathname === "/" && group.id === groupId));
    useEffect(() => {
        if (!selected?.public_id || location.pathname !== "/") return;
        const activity = new URLSearchParams(location.search).get("view") === "stats" ? "/activity" : "";
        navigate(`/g/${selected.public_id}${activity}`, { replace: true });
    }, [selected?.public_id, location.pathname, location.search, navigate]);
    // A failed group entry belongs on the groups tab, not an intermediate page.
    if (groupId && isAuthLoaded && (!isSignedIn || (!selected && (failed || groups !== null)))) {
        return <Navigate to="/" replace state={{ homeTab: "groups", groupOpenFailed: isSignedIn, authUserId }} />;
    }
    if (isAuthLoaded && isSignedIn && selected) {
        return <>
            {failed && retryNotice}
            <GroupLobby key={selected.id} groupId={selected.id} groupName={selected.name} gamePlugin={gamePlugin} displayName={displayName} onDisplayNameChange={onDisplayNameChange} />
        </>;
    }
    const status = !isAuthLoaded ? "loading" : !isSignedIn ? "signIn"
        : groups === null ? (failed ? "loadError" : "loading")
        : groups.length === 0 ? "empty" : null;
    if (status === "loading" && groupId) return <AppLoadingScreen />;
    if (status === "signIn") return (
        <div className="w-full max-w-md">
            <p className="mb-5 px-1 text-sm text-black/55 dark:text-white/55">
                <Trans i18nKey="groups.list.signInPrompt" components={{
                    action: <Link to="/" state={{ homeTab: "you" }}
                        className="cursor-pointer underline underline-offset-2 hover:text-black dark:hover:text-white" />,
                }} />
            </p>
        </div>
    );
    if (status) return renderList(<section className="grid gap-3 px-5 py-6 text-center">
        <p role={status === "loadError" ? "alert" : "status"} className="text-black/55 dark:text-white/55">{t(`groups.list.${status}`)}</p>
        {status === "loadError" && <Button tonal rounded onClick={() => setRetry(value => value + 1)}>{t("groups.list.retry")}</Button>}
    </section>);
    return renderList(<>
        <ul className="divide-y divide-black/10 dark:divide-white/10">
        {groups?.map(group => <li key={group.id}>
            <Link to={`/g/${encodeURIComponent(group.public_id)}`}
                aria-label={t("groups.enterGroup", { name: group.name })}
                className="block px-5 py-5 text-inherit no-underline focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-black dark:focus-visible:outline-white active:opacity-70 sm:px-6">
                <h2 className="truncate text-xl font-semibold text-black dark:text-white">{group.name}</h2>
                <p className="mt-1 text-sm text-black/55 dark:text-white/55">{t("groups.members", { count: group.member_count })}</p>
            </Link>
        </li>)}
    </ul></>);
}
