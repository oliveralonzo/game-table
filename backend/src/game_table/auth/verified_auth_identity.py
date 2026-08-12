"""
VerifiedAuthIdentity
Author: Oliver Alonzo
Supported by ChatGPT (GPT-5)
Date: 2026-07-16
Version: 0.1

Represents an already-verified external auth identity.
"""

from game_table.account.account import AuthProvider


class VerifiedAuthIdentity:
    def __init__(self, provider: AuthProvider | str, subject: str):
        if not subject or not subject.strip():
            raise ValueError("Auth subject is required.")

        self._provider = AuthProvider(provider)
        self._subject = subject.strip()

    @property
    def provider(self) -> AuthProvider:
        return self._provider

    @property
    def subject(self) -> str:
        return self._subject
