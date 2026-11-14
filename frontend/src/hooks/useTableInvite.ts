import { useTable } from "game-table/context/TableState";
import { useEffect, useState } from "react";

import { tableInviteUrl } from "game-table/utils/tableRoute";
import { useBranding } from "game-table/context/BrandingContext";

type UseTableInviteArgs = {
    tableCode?: string | null;
    pageUrl?: string;
    pageShareText?: string;
    t: (key: string, options?: Record<string, unknown>) => string;
};

export function useTableInvite({ tableCode, pageUrl, pageShareText, t }: UseTableInviteArgs) {
    const { name } = useBranding();
    const { state } = useTable();
    const [inviteCopied, setInviteCopied] = useState(false);
    const [fallbackInviteUrl, setFallbackInviteUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!inviteCopied) return;

        const timeout = window.setTimeout(() => {
            setInviteCopied(false);
        }, 1600);

        return () => window.clearTimeout(timeout);
    }, [inviteCopied]);

    const handleInvite = async () => {
        if (!tableCode && !pageUrl) return;

        setFallbackInviteUrl(null);
        const table = pageUrl ? null : state.tableView;
        const host = table?.host_id ? table.members[table.host_id] : null;
        const username = host?.account_username ?? table?.host_username;
        const hostName = username ? `@${username}` : host?.name ?? table?.host_name;
        const groupName = table?.group_name;
        const context = groupName ? { key: t("table.inviteParam.group"), value: groupName }
            : hostName ? { key: t("table.inviteParam.host"), value: hostName } : undefined;
        const inviteUrl = pageUrl ? new URL(pageUrl, window.location.origin).href
            : tableInviteUrl(window.location.origin, tableCode!, table?.invite_token, context);
        const shareData: ShareData = {
            title: name,
            text: groupName ? t("table.dialog.inviteGroup", { group: groupName })
                : hostName ? t("table.dialog.inviteHost", { host: hostName })
                : pageShareText ?? t("table.dialog.inviteShareText"),
            url: inviteUrl,
        };

        if (
            typeof navigator.share === "function" &&
            (!navigator.canShare || navigator.canShare(shareData))
        ) {
            try {
                await navigator.share(shareData);
                return;
            } catch (error) {
                if (error instanceof DOMException && error.name === "AbortError") {
                    return;
                }
            }
        }

        try {
            await navigator.clipboard.writeText(inviteUrl);
            setInviteCopied(true);
        } catch {
            setFallbackInviteUrl(inviteUrl);
        }
    };

    const closeInviteFallback = () => {
        setFallbackInviteUrl(null);
    };

    return {
        inviteCopied,
        fallbackInviteUrl,
        handleInvite,
        closeInviteFallback,
    };
}
