"""
ClerkAuthVerifier
Author: Oliver Alonzo
Supported by ChatGPT (GPT-5)
Date: 2026-07-16
Version: 0.1

Verifies Clerk session JWTs and returns a Domino auth identity.
"""

import os
import json
import textwrap
from typing import Any

import jwt

from game_table.account.account import AuthProvider
from game_table.auth.verified_auth_identity import VerifiedAuthIdentity


class ClerkAuthVerifier:
    def __init__(
        self,
        jwt_key: str,
        authorized_parties: list[str] | None = None,
    ):
        if not jwt_key or not jwt_key.strip():
            raise ValueError("Clerk JWT key is required.")

        self._jwt_key = self._normalize_key(jwt_key)
        self._authorized_parties = authorized_parties or []

    def verify_token(self, token: str) -> VerifiedAuthIdentity:
        if not token or not token.strip():
            raise ValueError("Auth token is required.")

        stripped_token = token.strip()
        claims = jwt.decode(
            stripped_token,
            self._verification_key(stripped_token),
            algorithms=["RS256"],
            options={"verify_aud": False},
        )

        authorized_party = claims.get("azp")
        if self._authorized_parties and authorized_party not in self._authorized_parties:
            raise ValueError("Auth token is not from an authorized party.")

        subject = claims.get("sub")
        if not subject:
            raise ValueError("Auth token is missing subject.")

        return VerifiedAuthIdentity(AuthProvider.CLERK, subject)

    @staticmethod
    def from_environment() -> "ClerkAuthVerifier | None":
        jwt_key = os.environ.get("CLERK_JWT_KEY")
        if not jwt_key:
            return None

        raw_authorized_parties = os.environ.get("CLERK_AUTHORIZED_PARTIES", "")
        authorized_parties = [
            party.strip()
            for party in raw_authorized_parties.split(",")
            if party.strip()
        ]

        return ClerkAuthVerifier(
            jwt_key=jwt_key,
            authorized_parties=authorized_parties,
        )

    @staticmethod
    def _normalize_key(jwt_key: str) -> str | dict[str, Any]:
        key = jwt_key.strip().strip("'\"").replace("\\n", "\n")

        if key.startswith("{"):
            return json.loads(key)

        if "-----BEGIN PUBLIC KEY-----" in key:
            return key

        key_body = "".join(key.split())
        if key_body:
            wrapped_key = "\n".join(textwrap.wrap(key_body, 64))
            return (
                "-----BEGIN PUBLIC KEY-----\n"
                f"{wrapped_key}\n"
                "-----END PUBLIC KEY-----"
            )

        return key

    def _verification_key(self, token: str):
        if isinstance(self._jwt_key, str):
            return self._jwt_key

        jwk = self._select_jwk(token, self._jwt_key)
        return jwt.PyJWK(jwk).key

    @staticmethod
    def _select_jwk(token: str, key_data: dict[str, Any]) -> dict[str, Any]:
        if "keys" not in key_data:
            return key_data

        keys = key_data.get("keys") or []
        if not keys:
            raise ValueError("Clerk JWT key set is empty.")

        token_key_id = jwt.get_unverified_header(token).get("kid")
        if not token_key_id:
            return keys[0]

        for key in keys:
            if key.get("kid") == token_key_id:
                return key

        raise ValueError("Clerk JWT key set does not include this token key.")
