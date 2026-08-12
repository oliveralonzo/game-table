import { useEffect, useState } from "react";

import { tableInviteUrl } from "game-table/utils/tableRoute";
import { useBranding } from "game-table/context/BrandingContext";

type UseTableInviteArgs = {
    tableCode?: string | null;
    t: (key: string, options?: Record<string, unknown>) => string;
};

export function useTableInvite({ tableCode, t }: UseTableInviteArgs) {
    const { name } = useBranding();
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
        if (!tableCode) return;

        setFallbackInviteUrl(null);
        const inviteUrl = tableInviteUrl(window.location.origin, tableCode);
        const shareData: ShareData = {
            title: name,
            text: t("table.dialog.inviteShareText"),
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
