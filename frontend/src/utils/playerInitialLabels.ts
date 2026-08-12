export type InitialLabel = {
    label: string;
    isDuplicate: boolean;
};

type SeatWithName = {
    name: string | null;
};

type MemberWithName = {
    id: string;
    name: string | null;
};

export function getNameInitials(name?: string | null, fallback = ""): string {
    return name
        ?.trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0].toUpperCase())
        .join("") || fallback;
}

function buildInitialLabels(items: SeatWithName[]): (InitialLabel | null)[] {
    const labels = items.map((item) => {
        if (!item.name) return null;

        return {
            wordInitials: getNameInitials(item.name),
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

    return labels.map((label) => {
        if (!label?.wordInitials) return null;

        const hasDuplicateWordInitials =
            (wordInitialCounts.get(label.wordInitials) ?? 0) > 1;

        if (!hasDuplicateWordInitials) {
            return { label: label.wordInitials, isDuplicate: false };
        }

        const nextIndex = (seen.get(label.wordInitials) ?? 0) + 1;
        seen.set(label.wordInitials, nextIndex);

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
