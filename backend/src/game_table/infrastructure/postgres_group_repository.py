"""Read existing group data without bootstrapping or modifying the database."""

from typing import Callable

from psycopg import Connection
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from game_table.group.group import Group, GroupMembership
from game_table.group.group_member import GroupMember


class PostgresGroupRepository:
    def __init__(self, connection_factory: Callable[[], Connection]):
        self._connection_factory = connection_factory

    def get_by_id(self, group_id: str) -> Group | None:
        groups = self._read('g.id = %s', (group_id,))
        return groups[0] if groups else None

    def list_for_account(self, account_id: str) -> list[Group]:
        return self._read('''g.deleted_at IS NULL AND EXISTS (
            SELECT 1 FROM group_memberships current_member
            WHERE current_member.group_id = g.id
              AND current_member.account_id = %s
              AND current_member.left_at IS NULL
        )''', (account_id,))

    def list_members(self, group_id: str, requesting_account_id: str) -> list[GroupMember]:
        with self._connection_factory() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute('''
                    SELECT a.id AS account_id, a.username, a.table_nickname
                    FROM group_memberships m
                    JOIN accounts a ON a.id = m.account_id
                    JOIN groups g ON g.id = m.group_id
                    WHERE m.group_id = %s AND m.left_at IS NULL
                      AND g.deleted_at IS NULL
                      AND EXISTS (
                          SELECT 1 FROM group_memberships requester
                          WHERE requester.group_id = g.id
                            AND requester.account_id = %s AND requester.left_at IS NULL
                      )
                    ORDER BY lower(a.username), a.id
                ''', (group_id, requesting_account_id))
                return [GroupMember(**row) for row in cursor.fetchall()]

    def update_defaults(self, group_id: str, account_id: str, rules: dict, seat_count: int) -> bool:
        with self._connection_factory() as connection:
            row = connection.execute("""
                UPDATE groups g SET default_rules = %s, default_seat_count = %s
                WHERE g.id = %s AND g.deleted_at IS NULL AND EXISTS (
                    SELECT 1 FROM group_memberships m WHERE m.group_id = g.id
                    AND m.account_id = %s AND m.left_at IS NULL AND m.role IN ('owner', 'admin')
                ) RETURNING g.id
            """, (Jsonb(rules), seat_count, group_id, account_id)).fetchone()
            return row is not None

    def _read(self, condition: str, params: tuple) -> list[Group]:
        # One statement keeps group and membership data on the same snapshot.
        # The condition is internal SQL; caller values are always parameters.
        with self._connection_factory() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(f'''
                    SELECT g.id, g.name, g.public_id, g.created_at, g.deleted_at, g.default_rules, g.default_seat_count,
                           m.id AS membership_id, m.account_id, m.role,
                           m.joined_at, m.left_at
                    FROM groups g
                    LEFT JOIN group_memberships m ON m.group_id = g.id
                    WHERE {condition}
                    ORDER BY g.created_at, g.id, m.joined_at, m.id
                ''', params)
                rows = cursor.fetchall()
        grouped = {}
        for row in rows:
            if row['id'] not in grouped:
                grouped[row['id']] = {
                    'id': row['id'], 'name': row['name'], 'public_id': row.get('public_id'),
                    'created_at': row['created_at'], 'deleted_at': row['deleted_at'],
                    'memberships': [], 'default_rules': row.get('default_rules'), 'default_seat_count': row.get('default_seat_count', 4),
                }
            if row['membership_id'] is not None:
                grouped[row['id']]['memberships'].append(GroupMembership(
                    id=row['membership_id'], group_id=row['id'],
                    account_id=row['account_id'], role=row['role'],
                    joined_at=row['joined_at'], left_at=row['left_at'],
                ))
        return [Group(**values) for values in grouped.values()]
