"""Group values loaded from storage; authorization and database access live outside.

Times use Unix milliseconds, matching the existing Alpha schema. Memberships
represent join/leave periods, not table connections or online presence.
"""

from dataclasses import dataclass
from enum import Enum
from typing import ClassVar


class GroupRole(str, Enum):
    OWNER = 'owner'
    ADMIN = 'admin'
    MEMBER = 'member'


@dataclass(frozen=True)
class GroupMembership:
    id: str
    group_id: str
    account_id: str
    role: GroupRole
    joined_at: int
    left_at: int | None = None

    def __post_init__(self):
        if not all(value.strip() for value in (self.id, self.group_id, self.account_id)):
            raise ValueError('Membership, group, and account IDs are required.')
        object.__setattr__(self, 'role', GroupRole(self.role))
        if self.left_at is not None and self.left_at < self.joined_at:
            raise ValueError('Membership cannot end before it begins.')

    @property
    def is_current(self) -> bool:
        return self.left_at is None

    def includes(self, timestamp: int) -> bool:
        """Periods include joining time and exclude leaving time."""
        return self.joined_at <= timestamp and (
            self.left_at is None or timestamp < self.left_at
        )


@dataclass(frozen=True)
class Group:
    id: str
    name: str
    created_at: int
    memberships: tuple[GroupMembership, ...]
    deleted_at: int | None = None

    public_id: str | None = None
    default_rules: dict | None = None
    default_seat_count: int = 4

    MAX_MEMBERS: ClassVar[int] = 66

    def __post_init__(self):
        if not self.id.strip() or not self.name.strip():
            raise ValueError('Group ID and name are required.')
        object.__setattr__(self, 'memberships', tuple(self.memberships))
        if self.deleted_at is not None and self.deleted_at < self.created_at:
            raise ValueError('Group cannot be deleted before it is created.')
        membership_ids = set()
        current_accounts = set()
        for membership in self.memberships:
            if membership.group_id != self.id:
                raise ValueError('Membership belongs to another group.')
            if membership.id in membership_ids:
                raise ValueError('Membership IDs must be unique.')
            membership_ids.add(membership.id)
            if membership.is_current:
                if membership.account_id in current_accounts:
                    raise ValueError('Account already has a current membership.')
                current_accounts.add(membership.account_id)
        if len(current_accounts) > self.MAX_MEMBERS:
            raise ValueError('Groups allow at most 66 current members.')
        if self.deleted_at is None and not any(
            member.role == GroupRole.OWNER for member in self.current_memberships
        ):
            raise ValueError('An active group must have at least one current owner.')

    @property
    def current_memberships(self) -> tuple[GroupMembership, ...]:
        return tuple(member for member in self.memberships if member.is_current)

    @property
    def member_count(self) -> int:
        return len(self.current_memberships)

    def membership_for(self, account_id: str) -> GroupMembership | None:
        return next((member for member in self.current_memberships
                     if member.account_id == account_id), None)
