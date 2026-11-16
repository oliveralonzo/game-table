import { useEffect, useState } from "react";
import { Dialog } from "konsta/react";
import { createPortal } from "react-dom";
import { ChartNoAxesColumnIncreasing, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTableSocket } from "game-table/context/TableSocket";
import RatingDetailsCard, { type RatingProfile } from "game-table/components/RatingDetailsCard";

export default function PlayerRatingBadge({ rating, reliability, username, refreshing = false }: { rating?: number; reliability?: number; username?: string | null; refreshing?: boolean }) {
    const { t } = useTranslation();
    const { emit } = useTableSocket();
    const [details, setDetails] = useState<{ username: string; profile: RatingProfile }>();
    const [opened, setOpened] = useState(false);
    useEffect(() => {
        if (!opened) return;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpened(false);
        };
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [opened]);
    const label = rating?.toFixed(2);
    const className = `inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-normal tabular-nums ${refreshing ? "opacity-50" : "opacity-80"}`;
    if (rating == null || reliability == null) return (
        <span className={className}
            aria-label={label ? t("table.label.playerRating", { rating: label }) : t("table.label.unrated")}>
            <ChartNoAxesColumnIncreasing size={12} aria-hidden="true" />
            {label ?? "—"}
        </span>
    );
    const profile = { rating, reliability };
    const openDetails = () => {
        setOpened(true);
        if (!username) return;
        emit("domino:rating_profiles", { usernames: [username], include_career_high: true },
            (result: { profiles?: Record<string, RatingProfile> }) => {
                const profile = result?.profiles?.[username];
                if (profile) setDetails({ username, profile });
            });
    };
    return <>
        <button type="button" className={`${className} flex-col !gap-0.5`} aria-haspopup="dialog" aria-busy={refreshing || undefined}
            aria-label={`${t("table.label.playerRating", { rating: label })}, ${t("table.label.ratingConfidence")} ${reliability}%`}
            onClick={event => { event.stopPropagation(); openDetails(); }}>
            <span className="inline-flex items-center gap-1">
                <ChartNoAxesColumnIncreasing size={12} aria-hidden="true" />
                {label}
            </span>
            <span aria-hidden="true" className="h-0.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
                <span className="block h-full rounded-full bg-primary/40"
                    style={{ width: `${Math.max(0, Math.min(100, reliability))}%` }} />
            </span>
        </button>
        {opened && createPortal(<Dialog opened backdrop role="dialog" aria-modal="true"
            aria-label={username ? `@${username} · ${t("table.label.rating")}` : t("table.label.rating")}
            style={{ width: "24rem", maxWidth: "calc(100% - 2rem)" }}
            onBackdropClick={(event: MouseEvent) => { event.stopPropagation(); setOpened(false); }}
            onClick={event => event.stopPropagation()}
            content={<>
                <header className="mb-3 flex items-center justify-between gap-3">
                    {username && <h2 className="m-0 min-w-0 truncate font-semibold">@{username}</h2>}
                    <button type="button" autoFocus aria-label={t("table.label.ratingClose")}
                        onClick={() => setOpened(false)}
                        className="ml-auto inline-flex size-8 shrink-0 items-center justify-center rounded-full opacity-65 hover:opacity-100">
                        <X size={18} aria-hidden="true" />
                    </button>
                </header>
                <RatingDetailsCard profile={details && details.username === username ? details.profile : profile} />
            </>} />, document.body)}
    </>;
}
