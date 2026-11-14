import { useTranslation } from "react-i18next";

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
    forfeitLabel: string
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
            return `${name}${(participant.is_guest || (!participant.account_id && !participant.username)) ? ` (${guestLabel || fallback})` : ""}`;
        }).join(", "),
        isPlaceholder: participants.every(participant => !participant.username && !participant.display_name),
    };
}

export function HistoryParticipantCell({
    participants,
    fallback,
    guestLabel,
}: {
    participants: { username: string | null; display_name?: string | null; account_id?: string | null; is_guest?: boolean; forfeited?: boolean }[];
    fallback: string;
    guestLabel?: string;
}) {
    const { t } = useTranslation();
    const value = formatParticipants(participants, fallback, guestLabel, t("account.history.forfeit"));

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

