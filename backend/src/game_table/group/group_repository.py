"""Read boundary for groups. Writes and their transaction rules follow separately."""

from typing import Protocol

from .group import Group
from .group_member import GroupMember


class GroupRepository(Protocol):
    def update_defaults(self, group_id: str, account_id: str, rules: dict, seat_count: int, *, authorized: bool = False) -> bool: ...

    def get_by_id(self, group_id: str) -> Group | None: ...

    def list_for_account(self, account_id: str) -> list[Group]: ...

    def list_members(self, group_id: str, requesting_account_id: str, *, authorized: bool = False) -> list[GroupMember]: ...
