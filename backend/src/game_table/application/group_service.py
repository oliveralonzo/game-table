"""Account-based access to private groups, independent of live table sessions."""

from game_table.group.group import Group, GroupRole
from game_table.group.group_member import GroupMember
from game_table.group.group_repository import GroupRepository


class GroupService:
    def __init__(self, repository: GroupRepository):
        self._repository = repository

    def list_groups(self, account_id: str) -> list[Group]:
        self._require_account(account_id)
        return [group for group in self._repository.list_for_account(account_id)
                if group.deleted_at is None and group.membership_for(account_id)]

    def get_group(self, account_id: str, group_id: str) -> Group:
        self._require_account(account_id)
        group = self._repository.get_by_id(group_id)
        if group is None or group.deleted_at is not None:
            raise ValueError('Group does not exist.')
        if group.membership_for(account_id) is None:
            raise PermissionError('Only current members may access the group.')
        return group

    def list_members(self, account_id: str, group_id: str) -> list[GroupMember]:
        self.get_group(account_id, group_id)
        # The repository rechecks access in the roster query in case membership
        # changed after the domain read. Active groups always have an owner.
        members = self._repository.list_members(group_id, account_id)
        if not members:
            raise PermissionError('Only current members may access the group.')
        return members

    def update_defaults(self, account_id: str, group_id: str, rules: dict, seat_count: int) -> None:
        group = self.get_group(account_id, group_id)
        if group.membership_for(account_id).role not in (GroupRole.OWNER, GroupRole.ADMIN):
            raise PermissionError('Only owners and admins may change group settings.')
        if type(seat_count) is not int or not 2 <= seat_count <= 4:
            raise ValueError('Seat count must be between 2 and 4.')
        if not isinstance(rules, dict):
            raise ValueError('Game settings must be an object.')
        if not self._repository.update_defaults(group_id, account_id, rules, seat_count):
            raise PermissionError('Only owners and admins may change group settings.')

    def is_member(self, account_id: str | None, group_id: str) -> bool:
        if not account_id:
            return False
        try:
            self.get_group(account_id, group_id)
            return True
        except (PermissionError, ValueError):
            return False

    @staticmethod
    def _require_account(account_id: str) -> None:
        # Callers supply the authenticated account identity, never a socket ID.
        if not account_id or not account_id.strip():
            raise ValueError('Account ID is required.')
