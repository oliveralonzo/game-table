import type { LeaderboardEntry } from "game-table/components/LeaderboardContent";

type HeadToHeadRecord = NonNullable<LeaderboardEntry["head_to_head"]>;

export function opponentCount(record: HeadToHeadRecord): number {
    return record.ahead + record.tied + record.behind;
}

export function formatOpponentsAhead(record: HeadToHeadRecord, language?: string): string {
    const total = opponentCount(record);
    return total ? new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 0 })
        .format(record.ahead / total) : "—";
}

// Compare exact fractions; equal fractions share a matchup rank.
export function compareHeadToHeadScore(a: LeaderboardEntry, b: LeaderboardEntry): number {
    const left = a.head_to_head ?? { ahead: 0, tied: 0, behind: 0 };
    const right = b.head_to_head ?? { ahead: 0, tied: 0, behind: 0 };
    const leftTotal = opponentCount(left);
    const rightTotal = opponentCount(right);
    return Number(rightTotal > 0) - Number(leftTotal > 0)
        || right.ahead * leftTotal - left.ahead * rightTotal;
}

export function compareHeadToHead(a: LeaderboardEntry, b: LeaderboardEntry): number {
    return Number(b.games_played >= 10) - Number(a.games_played >= 10)
        || compareHeadToHeadScore(a, b)
        || b.win_percentage - a.win_percentage
        || a.username.localeCompare(b.username);
}
