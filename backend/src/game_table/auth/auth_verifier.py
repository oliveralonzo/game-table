"""
AuthVerifier protocol.
"""

from typing import Protocol

from game_table.auth.verified_auth_identity import VerifiedAuthIdentity


class AuthVerifier(Protocol):
    def verify_token(self, token: str) -> VerifiedAuthIdentity:
        ...
