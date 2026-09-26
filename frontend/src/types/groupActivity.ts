import type { LeaderboardEntry } from "game-table/components/LeaderboardContent";

export type GroupHighlight = { value: number | null; usernames: string[] };
export type GroupHistoryEntry = {
    id: string; date: number; score: string;
    winners: { username: string | null; is_guest: boolean }[];
    others: { username: string | null; is_guest: boolean }[];
};
export type GroupActivity = {
    group_id: string; season: string; current_season: string; seasons: string[];
    players: LeaderboardEntry[]; teams: LeaderboardEntry[];
    highlights: Record<"best_percentage" | "most_wins" | "win_streak", GroupHighlight> & { head_to_head?: GroupHighlight & { records: { username: string; ahead: number; tied: number; behind: number }[] } };
    history: { entries: GroupHistoryEntry[]; page: number; total_pages: number; total_games: number };
};
export const groupActivityKey = (groupId: string, season: string, page: number) => JSON.stringify([groupId, season, page]);
