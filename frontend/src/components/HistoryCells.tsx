export function formatHistoryDate(timestamp: number, language: string, timeZone?: string) {
    return new Intl.DateTimeFormat(language, {
        timeZone,
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(new Date(timestamp));
}

function formatParticipants(
    participants: { username: string | null; is_guest?: boolean }[],
    fallback: string,
    guestLabel?: string
) {
    if (participants.length === 0) {
        return {
            text: fallback,
            isPlaceholder: true,
        };
    }

    return {
        text: participants.map(participant => participant.username
            ? `@${participant.username}${participant.is_guest && guestLabel ? ` (${guestLabel})` : ""}`
            : fallback).join(", "),
        isPlaceholder: participants.every(participant => !participant.username),
    };
}

export function HistoryParticipantCell({
    participants,
    fallback,
    guestLabel,
}: {
    participants: { username: string | null; is_guest?: boolean }[];
    fallback: string;
    guestLabel?: string;
}) {
    const value = formatParticipants(participants, fallback, guestLabel);

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

