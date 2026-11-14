import { useTranslation } from "react-i18next";

export type RatingChanges = Record<string, { before: number; after: number; change?: number }>;

export function formatRatingChange(change: RatingChanges[string], language: string) {
    const delta = change.change ?? change.after - change.before;
    return (delta || 0).toLocaleString(language, {
        signDisplay: "always",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

export function formatHistoryDate(timestamp: number, language: string, timeZone?: string) {
    return new Intl.DateTimeFormat(language, {
        timeZone,
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(new Date(timestamp));
}

function formatParticipants(
    participants: { username: string | null; display_name?: string | null; account_id?: string | null; is_guest?: boolean; forfeited?: boolean }[],
    fallback: string,
    guestLabel: string | undefined,
    forfeitLabel: string,
    language: string,
    ratingChanges?: RatingChanges
) {
    if (participants.length === 0) {
        return {
            text: fallback,
            isPlaceholder: true,
        };
    }

    return {
        text: participants.map(participant => {
            if (participant.forfeited) return forfeitLabel;
            const name = participant.display_name || (participant.username ? `@${participant.username}` : "");
            if (!name) return fallback;
            const change = participant.account_id ? ratingChanges?.[participant.account_id] : undefined;
            if (change) return `${name} · ${formatRatingChange(change, language)}`;
            return `${name}${(participant.is_guest || (!participant.account_id && !participant.username)) ? ` (${guestLabel || fallback})` : ""}`;
        }).join(", "),
        isPlaceholder: participants.every(participant => !participant.username && !participant.display_name),
    };
}

export function HistoryParticipantCell({
    participants,
    fallback,
    guestLabel,
    ratingChanges,
}: {
    participants: { username: string | null; display_name?: string | null; account_id?: string | null; is_guest?: boolean; forfeited?: boolean }[];
    fallback: string;
    guestLabel?: string;
    ratingChanges?: RatingChanges;
}) {
    const { t, i18n } = useTranslation();
    const value = formatParticipants(participants, fallback, guestLabel, t("account.history.forfeit"), i18n.language, ratingChanges);

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

