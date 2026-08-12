"""
Account domain
Author: Oliver Alonzo
Supported by ChatGPT (GPT-5)
Date: 2026-07-16
Version: 0.1

Represents a persistent Domino account.

Responsibilities:
- Hold the stable Domino account identity.
- Hold the external auth subject used to find the account.
- Hold account values loaded from persistence.

Design:
- Persistent domain object.
- Auth token verification belongs outside this object.
- Username uniqueness belongs to the account repository/service.
- Rating defaults, rating ranges, and rating history belong to the rating domain.
"""

from enum import Enum
import re


class AuthProvider(str, Enum):
    CLERK = "clerk"


class Account:
    """
    Persistent account identity for ratings, leaderboards, and history.
    """

    MIN_USERNAME_LENGTH = 3
    MAX_USERNAME_LENGTH = 16
    USERNAME_PATTERN = re.compile(r"^[a-zA-Z0-9_]+$")

    def __init__(
        self,
        account_id: str,
        auth_provider: AuthProvider | str,
        auth_subject: str,
        username: str,
        rating: int | None,
        created_at: int,
        updated_at: int,
        table_nickname: str | None = None,
    ):
        if not account_id or not account_id.strip():
            raise ValueError("Account ID is required.")

        if not auth_subject or not auth_subject.strip():
            raise ValueError("Auth subject is required.")

        self._auth_provider = AuthProvider(auth_provider)
        self._id = account_id.strip()
        self._auth_subject = auth_subject.strip()
        self._username = self.clean_username(username)
        self._table_nickname = self.clean_table_nickname(table_nickname)
        self._rating = rating
        self._created_at = created_at
        self._updated_at = updated_at

    @property
    def id(self) -> str:
        return self._id

    @property
    def auth_provider(self) -> AuthProvider:
        return self._auth_provider

    @property
    def auth_subject(self) -> str:
        return self._auth_subject

    @property
    def username(self) -> str:
        return self._username

    @property
    def table_nickname(self) -> str | None:
        return self._table_nickname

    @property
    def rating(self) -> int | None:
        return self._rating

    @property
    def created_at(self) -> int:
        return self._created_at

    @property
    def updated_at(self) -> int:
        return self._updated_at

    def to_dict(self) -> dict:
        return {
            "id": self._id,
            "auth_provider": self._auth_provider.value,
            "auth_subject": self._auth_subject,
            "username": self._username,
            "table_nickname": self._table_nickname,
            "rating": self._rating,
            "created_at": self._created_at,
            "updated_at": self._updated_at,
        }

    @classmethod
    def clean_username(cls, username: str) -> str:
        clean_username = username.strip()

        if not clean_username:
            raise ValueError("Username is required.")

        if len(clean_username) < cls.MIN_USERNAME_LENGTH:
            raise ValueError(
                f"Username must be at least {cls.MIN_USERNAME_LENGTH} characters."
            )

        if len(clean_username) > cls.MAX_USERNAME_LENGTH:
            raise ValueError(
                f"Username cannot exceed {cls.MAX_USERNAME_LENGTH} characters."
            )

        if not cls.USERNAME_PATTERN.fullmatch(clean_username):
            raise ValueError(
                "Username may only contain letters, numbers, and underscores."
            )

        return clean_username

    @classmethod
    def username_key(cls, username: str) -> str:
        return cls.clean_username(username).casefold()

    @staticmethod
    def clean_table_nickname(table_nickname: str | None) -> str | None:
        if table_nickname is None:
            return None

        clean_nickname = table_nickname.strip()
        return clean_nickname or None
