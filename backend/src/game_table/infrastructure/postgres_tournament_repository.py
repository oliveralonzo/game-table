"""Persistent tournaments with membership checked in every database operation."""
from dataclasses import asdict
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from game_table.tournament.tournament import Tournament


class PostgresTournamentRepository:
    def __init__(self, connection_factory):
        self.connection_factory = connection_factory

    def create(self, tournament):
        values = asdict(tournament)
        values['rules'] = Jsonb(values['rules'])
        with self.connection_factory() as connection:
            return connection.execute("""
                INSERT INTO tournaments (id, group_id, created_by, created_at, scheduled_at, rules, status)
                SELECT %(id)s, g.id, %(created_by)s, %(created_at)s, %(scheduled_at)s, %(rules)s, %(status)s
                FROM groups g WHERE g.id = %(group_id)s AND g.deleted_at IS NULL
                AND EXISTS (SELECT 1 FROM group_memberships m WHERE m.group_id = g.id
                    AND m.account_id = %(created_by)s AND m.left_at IS NULL AND m.role IN ('owner', 'admin'))
                RETURNING id
            """, values).fetchone() is not None

    def delete(self, tournament_id, account_id):
        with self.connection_factory() as connection:
            return connection.execute("""
                DELETE FROM tournaments t USING groups g
                WHERE t.id = %s AND t.status = 'scheduled'
                    AND g.id = t.group_id AND g.deleted_at IS NULL
                    AND EXISTS (SELECT 1 FROM group_memberships m WHERE m.group_id = g.id
                        AND m.account_id = %s AND m.left_at IS NULL AND m.role IN ('owner', 'admin'))
                RETURNING t.id
            """, (tournament_id, account_id)).fetchone() is not None

    def _read(self, condition, params, account_id):
        with self.connection_factory() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute("""
                    SELECT t.* FROM tournaments t JOIN groups g ON g.id = t.group_id
                    WHERE g.deleted_at IS NULL AND EXISTS (
                        SELECT 1 FROM group_memberships m WHERE m.group_id = g.id
                        AND m.account_id = %s AND m.left_at IS NULL)
                    AND """ + condition + ' ORDER BY t.scheduled_at, t.id', (account_id, *params))
                return [Tournament(**row) for row in cursor.fetchall()]

    def list_for_group(self, group_id, account_id):
        return self._read('t.group_id = %s', (group_id,), account_id)

    def get_by_id(self, tournament_id, account_id):
        rows = self._read('t.id = %s', (tournament_id,), account_id)
        return rows[0] if rows else None

    def set_attendance_intent(self, tournament_id, account_id, attending, updated_at):
        if type(attending) is bool:
            attending = 'yes' if attending else 'no'
        with self.connection_factory() as connection:
            return connection.execute("""
                INSERT INTO tournament_attendance_intents (tournament_id, account_id, response, updated_at)
                SELECT t.id, %s, %s, %s FROM tournaments t JOIN groups g ON g.id = t.group_id
                WHERE t.id = %s AND t.status = 'scheduled' AND g.deleted_at IS NULL
                AND EXISTS (SELECT 1 FROM group_memberships m WHERE m.group_id = t.group_id
                    AND m.account_id = %s AND m.left_at IS NULL)
                ON CONFLICT (tournament_id, account_id) DO UPDATE
                SET response = EXCLUDED.response, updated_at = EXCLUDED.updated_at
                RETURNING tournament_id
            """, (account_id, attending, updated_at, tournament_id, account_id)).fetchone() is not None

    def attendance_for_group(self, group_id, account_id):
        with self.connection_factory() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute("""
                    SELECT t.id,
                        count(a.account_id) FILTER (WHERE a.response = 'yes') AS attendance_intent_count,
                        count(a.account_id) FILTER (WHERE a.response = 'maybe') AS attendance_maybe_count,
                        coalesce(bool_or(a.account_id = %s AND a.response = 'yes'), false) AS attendance_intent,
                        max(a.response) FILTER (WHERE a.account_id = %s) AS attendance_response
                    FROM tournaments t JOIN groups g ON g.id = t.group_id
                    LEFT JOIN tournament_attendance_intents a ON a.tournament_id = t.id
                        AND EXISTS (SELECT 1 FROM group_memberships attendee
                            WHERE attendee.group_id = t.group_id AND attendee.account_id = a.account_id
                            AND attendee.left_at IS NULL)
                    WHERE t.group_id = %s AND g.deleted_at IS NULL
                        AND EXISTS (SELECT 1 FROM group_memberships requester WHERE requester.group_id = t.group_id
                            AND requester.account_id = %s AND requester.left_at IS NULL)
                    GROUP BY t.id
                """, (account_id, account_id, group_id, account_id))
                return {row['id']: {key: row[key] for key in ('attendance_intent_count', 'attendance_maybe_count', 'attendance_intent', 'attendance_response')}
                        for row in cursor.fetchall()}

    def attendance_roster(self, tournament_id, account_id):
        with self.connection_factory() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute("""
                    SELECT a.id AS account_id, a.username,
                        coalesce(nullif(a.table_nickname, ''), a.username) AS name,
                        a.badge_label, intent.response, a.id = %s AS is_self
                    FROM tournament_attendance_intents intent
                    JOIN tournaments t ON t.id = intent.tournament_id
                    JOIN groups g ON g.id = t.group_id
                    JOIN accounts a ON a.id = intent.account_id
                    WHERE t.id = %s AND g.deleted_at IS NULL AND intent.response IN ('yes', 'maybe', 'no')
                    AND EXISTS (SELECT 1 FROM group_memberships m WHERE m.group_id = t.group_id
                        AND m.account_id = a.id AND m.left_at IS NULL)
                    AND EXISTS (SELECT 1 FROM group_memberships requester WHERE requester.group_id = t.group_id
                        AND requester.account_id = %s AND requester.left_at IS NULL)
                    ORDER BY lower(coalesce(nullif(a.table_nickname, ''), a.username)), a.id
                """, (account_id, tournament_id, account_id))
                return cursor.fetchall()
