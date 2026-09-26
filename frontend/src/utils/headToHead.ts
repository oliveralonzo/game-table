import type { LeaderboardEntry } from "game-table/components/LeaderboardContent";

// Negative means a ranks ahead of b. Names only stabilize otherwise tied rows.
export function compareHeadToHeadScore(a: LeaderboardEntry, b: LeaderboardEntry): number {
    const left = a.head_to_head ?? { ahead: 0, tied: 0, behind: 0 };
    const right = b.head_to_head ?? { ahead: 0, tied: 0, behind: 0 };
    return right.ahead - left.ahead || left.behind - right.behind;
}

export function compareHeadToHead(a: LeaderboardEntry, b: LeaderboardEntry): number {
    return Number(b.games_played >= 10) - Number(a.games_played >= 10)
        || compareHeadToHeadScore(a, b) || a.username.localeCompare(b.username);
}
