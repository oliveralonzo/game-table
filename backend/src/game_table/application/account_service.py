"""
AccountService
Author: Oliver Alonzo
Supported by ChatGPT (GPT-5)
Date: 2026-07-16
Version: 0.1

Application service for persistent account workflows.

Responsibilities:
- Find accounts by verified auth identity.
- Create accounts after auth has been verified elsewhere.
- Enforce username uniqueness through a repository.
- Rename usernames without changing account/auth identity.

Design:
- Depends on an AccountRepository protocol.
- Production should use a persistent repository.
- Tests may provide a fake repository.
"""

from time import time
from typing import Callable
from uuid import uuid4

from game_table.account.account import Account, AuthProvider
from game_table.account.account_repository import AccountRepository


class AccountService:
    """
    Application boundary for account workflows.
    """

    def __init__(
        self,
        repository: AccountRepository,
        account_id_factory: Callable[[], str] | None = None,
        clock_ms: Callable[[], int] | None = None,
    ):
        self._repository = repository
        self._account_id_factory = account_id_factory or self._generate_account_id
        self._clock_ms = clock_ms or self._now_ms

    def find_by_auth_identity(
        self,
        auth_provider: AuthProvider | str,
        auth_subject: str,
    ) -> Account | None:
        return self._repository.get_by_auth_identity(
            AuthProvider(auth_provider),
            auth_subject.strip(),
        )

    def get_account(self, account_id: str) -> Account:
        account = self._repository.get_by_id(account_id)

        if account is None:
            raise ValueError("Account does not exist.")

        return account

    def is_username_available(self, username: str) -> bool:
        username_key = Account.username_key(username)
        return self._repository.get_by_username_key(username_key) is None

    def create_account(
        self,
        auth_provider: AuthProvider | str,
        auth_subject: str,
        username: str,
    ) -> Account:
        provider = AuthProvider(auth_provider)
        clean_auth_subject = auth_subject.strip()

        if self._repository.get_by_auth_identity(provider, clean_auth_subject):
            raise ValueError("Account already exists for auth identity.")

        clean_username = Account.clean_username(username)
        username_key = Account.username_key(clean_username)

        if self._repository.get_by_username_key(username_key):
            raise ValueError("Username is already taken.")

        now = self._clock_ms()
        account = Account(
            account_id=self._account_id_factory(),
            auth_provider=provider,
            auth_subject=clean_auth_subject,
            username=clean_username,
            rating=None,
            created_at=now,
            updated_at=now,
        )
        self._repository.save(account)
        return account

    def rename_username(self, account_id: str, username: str) -> Account:
        account = self.get_account(account_id)
        clean_username = Account.clean_username(username)
        username_key = Account.username_key(clean_username)
        existing = self._repository.get_by_username_key(username_key)

        if existing is not None and existing.id != account.id:
            raise ValueError("Username is already taken.")

        if clean_username == account.username:
            return account

        renamed = Account(
            account_id=account.id,
            auth_provider=account.auth_provider,
            auth_subject=account.auth_subject,
            username=clean_username,
            rating=account.rating,
            created_at=account.created_at,
            updated_at=self._clock_ms(),
            table_nickname=account.table_nickname,
        )
        self._repository.save(renamed)
        return renamed

    def update_table_nickname(self, account_id: str, table_nickname: str | None) -> Account:
        account = self.get_account(account_id)
        clean_table_nickname = Account.clean_table_nickname(table_nickname)

        if clean_table_nickname == account.table_nickname:
            return account

        updated = Account(
            account_id=account.id,
            auth_provider=account.auth_provider,
            auth_subject=account.auth_subject,
            username=account.username,
            rating=account.rating,
            created_at=account.created_at,
            updated_at=self._clock_ms(),
            table_nickname=clean_table_nickname,
        )
        self._repository.save(updated)
        return updated

    def delete_account(self, account_id: str) -> None:
        self.get_account(account_id)
        self._repository.delete(account_id)

    @staticmethod
    def _generate_account_id() -> str:
        return f"acct_{uuid4().hex}"

    @staticmethod
    def _now_ms() -> int:
        return int(time() * 1000)
