"""
AccountRepository protocol
Author: Oliver Alonzo
Supported by ChatGPT (GPT-5)
Date: 2026-07-16
Version: 0.1

Storage boundary for persistent accounts.

Responsibilities:
- Define the account queries required by application services.
- Hide database/storage mechanics from account workflows.

Design:
- Protocol only; production implementation lives outside the domain.
- Implementations translate storage rows into Account objects.
"""

from typing import Protocol

from game_table.account.account import Account, AuthProvider


class AccountRepository(Protocol):
    def get_by_id(self, account_id: str) -> Account | None:
        ...

    def get_by_auth_identity(
        self,
        auth_provider: AuthProvider,
        auth_subject: str,
    ) -> Account | None:
        ...

    def get_by_username_key(self, username_key: str) -> Account | None:
        ...

    def save(self, account: Account) -> None:
        ...

    def delete(self, account_id: str) -> None:
        ...
