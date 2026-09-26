"""Public account details for a current group member."""
from dataclasses import dataclass


@dataclass(frozen=True)
class GroupMember:
    account_id: str
    username: str
    table_nickname: str | None
