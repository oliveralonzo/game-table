"""
PostgresAccountRepository
Author: Oliver Alonzo
Supported by ChatGPT (GPT-5)
Date: 2026-07-16
Version: 0.1

Postgres-backed account repository.

Responsibilities:
- Translate Account objects to/from Postgres rows.
- Execute account lookup and save queries.
- Keep SQL/storage details out of AccountService.

Design:
- Receives a psycopg connection factory from application wiring.
- Compatible with Neon because Neon exposes normal Postgres.
"""

from typing import Any, Callable

from psycopg import Connection
from psycopg.rows import dict_row

from game_table.account.account import Account, AuthProvider


class PostgresAccountRepository:
    def __init__(self, connection_factory: Callable[[], Connection]):
        self._connection_factory = connection_factory

    def get_by_id(self, account_id: str) -> Account | None:
        return self._fetch_one(
            """
            SELECT *
            FROM accounts
            WHERE id = %s
            """,
            (account_id,),
        )

    def get_by_auth_identity(
        self,
        auth_provider: AuthProvider,
        auth_subject: str,
    ) -> Account | None:
        return self._fetch_one(
            """
            SELECT *
            FROM accounts
            WHERE auth_provider = %s
              AND auth_subject = %s
            """,
            (auth_provider.value, auth_subject),
        )

    def get_by_username_key(self, username_key: str) -> Account | None:
        return self._fetch_one(
            """
            SELECT *
            FROM accounts
            WHERE username_key = %s
            """,
            (username_key,),
        )

    def save(self, account: Account) -> None:
        with self._connection_factory() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO accounts (
                        id,
                        auth_provider,
                        auth_subject,
                        username,
                        username_key,
                        table_nickname,
                        rating,
                        created_at,
                        updated_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE SET
                        username = EXCLUDED.username,
                        username_key = EXCLUDED.username_key,
                        table_nickname = EXCLUDED.table_nickname,
                        rating = EXCLUDED.rating,
                        updated_at = EXCLUDED.updated_at
                    """,
                    (
                        account.id,
                        account.auth_provider.value,
                        account.auth_subject,
                        account.username,
                        Account.username_key(account.username),
                        account.table_nickname,
                        account.rating,
                        account.created_at,
                        account.updated_at,
                    ),
                )

    def delete(self, account_id: str) -> None:
        with self._connection_factory() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    DELETE FROM accounts
                    WHERE id = %s
                    """,
                    (account_id,),
                )

    def _fetch_one(
        self,
        query: str,
        params: tuple[Any, ...],
    ) -> Account | None:
        with self._connection_factory() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(query, params)
                row = cursor.fetchone()

        if row is None:
            return None

        return self._account_from_row(row)

    @staticmethod
    def _account_from_row(row: dict[str, Any]) -> Account:
        return Account(
            account_id=row["id"],
            auth_provider=row["auth_provider"],
            auth_subject=row["auth_subject"],
            username=row["username"],
            rating=row["rating"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            table_nickname=row.get("table_nickname"),
        )
