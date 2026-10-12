export type InitialLabel = {
    label: string;
    isDuplicate: boolean;
};

type SeatWithName = {
    name: string | null;
    badge_label?: string | null;
};

type MemberWithName = {
    id: string;
    name: string | null;
    badge_label?: string | null;
};

export const DISPLAY_NAME_MAX_LENGTH = 24;

export function getBadgeOptions(name?: string | null): string[] {
    const letters = name?.trim().split(/\s+/).filter(Boolean)
        .map(word => Array.from(word)[0].toUpperCase()) ?? [];
    if (!letters.length) return [];
    return [...new Set([letters[0], ...letters.slice(1).map(letter => letters[0] + letter)])]
        .filter(label => Array.from(label).length <= 2);
}

export function getNameInitials(name?: string | null, fallback = ""): string {
    return getBadgeOptions(name)[0] ?? fallback;
}

export function getSavedBadge(name: string): string | undefined {
    if (typeof window === "undefined") return undefined;
    try {
        const label = JSON.parse(localStorage.getItem("game-table:badges") ?? "{}")[name.trim()];
        return getBadgeOptions(name).includes(label) ? label : undefined;
    } catch { return undefined; }
}

export function saveBadge(name: string, label: string) {
    try {
        const labels = JSON.parse(localStorage.getItem("game-table:badges") ?? "{}");
        localStorage.setItem("game-table:badges", JSON.stringify({ ...labels, [name.trim()]: label }));
    } catch { /* Storage may be unavailable in private browsing. */ }
}

function buildInitialLabels(items: SeatWithName[]): (InitialLabel | null)[] {
    const labels = items.map((item) => {
        if (!item.name) return null;

        return {
            wordInitials: getBadgeOptions(item.name).includes(item.badge_label ?? "")
                ? item.badge_label! : getNameInitials(item.name),
        };
    });
    const wordInitialCounts = new Map<string, number>();

    labels.forEach((label) => {
        if (!label?.wordInitials) return;
        wordInitialCounts.set(
            label.wordInitials,
            (wordInitialCounts.get(label.wordInitials) ?? 0) + 1
        );
    });

    const seen = new Map<string, number>();
    const usedLabels = new Set(labels.flatMap(label => label?.wordInitials ? [label.wordInitials] : []));

    return labels.map((label) => {
        if (!label?.wordInitials) return null;

        const hasDuplicateWordInitials =
            (wordInitialCounts.get(label.wordInitials) ?? 0) > 1;

        if (!hasDuplicateWordInitials) {
            return { label: label.wordInitials, isDuplicate: false };
        }

        let nextIndex = (seen.get(label.wordInitials) ?? 0) + 1;
        while (usedLabels.has(`${label.wordInitials}${nextIndex}`)) nextIndex++;
        seen.set(label.wordInitials, nextIndex);
        usedLabels.add(`${label.wordInitials}${nextIndex}`);

        return {
            label: `${label.wordInitials}${nextIndex}`,
            isDuplicate: true,
        };
    });
}

export function buildSeatInitialLabels(seats: SeatWithName[]): (InitialLabel | null)[] {
    return buildInitialLabels(seats);
}

export function buildInitialLabelsById(members: MemberWithName[]): Record<string, InitialLabel> {
    const labels = buildInitialLabels(members);

    return Object.fromEntries(
        members.flatMap((member, index) => {
            const label = labels[index];
            return label ? [[member.id, label]] : [];
        })
    );
}
