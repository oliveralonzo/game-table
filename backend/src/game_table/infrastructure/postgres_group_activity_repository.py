"""Read group history and access rights on one database snapshot."""
from typing import Callable
from psycopg import Connection
from psycopg.rows import dict_row
from game_table.group.group_activity import GroupActivitySnapshot


class PostgresGroupActivityRepository:
    def __init__(self, connection_factory: Callable[[], Connection]):
        self._connection_factory = connection_factory

    def read(self, group_id, account_id, start, end):
        with self._connection_factory() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute("""
                    SELECT g.created_at,
                        (SELECT MIN(COALESCE(h.started_at, h.completed_at))
                         FROM game_history h WHERE h.group_id = g.id) AS first_played_at,
                        COALESCE((SELECT jsonb_agg(to_jsonb(member)) FROM (
                            SELECT a.id AS account_id, a.username
                            FROM accounts a WHERE EXISTS (
                                SELECT 1 FROM group_memberships m
                                WHERE m.group_id = g.id AND m.account_id = a.id
                                  AND (%s::bigint IS NULL OR m.joined_at < %s)
                            ) ORDER BY a.username, a.id
                        ) member), '[]'::jsonb) AS members,
                        COALESCE((SELECT jsonb_agg(to_jsonb(game) ORDER BY game.completed_at, game.id) FROM (
                            SELECT h.id, h.started_at, h.completed_at, h.team_scores,
                                   h.team_player_counts, h.winning_team_index,
                                COALESCE((SELECT jsonb_agg(jsonb_build_object(
                                    'account_id', r.account_id, 'username', a.username,
                                    'team_index', r.team_index, 'seat_index', r.seat_index,
                                    'group_participation', r.group_participation
                                ) ORDER BY r.seat_index)
                                FROM account_game_results r
                                JOIN accounts a ON a.id = r.account_id
                                WHERE r.game_history_id = h.id), '[]'::jsonb) AS participants
                            FROM game_history h WHERE h.group_id = g.id
                              AND (%s::bigint IS NULL OR COALESCE(h.started_at, h.completed_at) >= %s)
                              AND (%s::bigint IS NULL OR COALESCE(h.started_at, h.completed_at) < %s)
                        ) game), '[]'::jsonb) AS games
                    FROM groups g WHERE g.id = %s AND g.deleted_at IS NULL
                      AND EXISTS (SELECT 1 FROM group_memberships requester
                          WHERE requester.group_id = g.id AND requester.account_id = %s
                            AND requester.left_at IS NULL)
                """, (end, end, start, start, end, end, group_id, account_id))
                row = cursor.fetchone()
        return GroupActivitySnapshot(**row) if row else None
