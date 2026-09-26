"""Live group authorization. Membership is resolved at admission, not per action."""
from dataclasses import replace
from threading import RLock

from game_table.application.group_service import GroupService
from game_table.group.group import GroupRole


class GroupSessionService(GroupService):
    def __init__(self, repository):
        super().__init__(repository)
        self._grants = {}  # (account, group) -> admission snapshot
        self._leases = {}  # (account, group) -> presence identifiers
        self._epochs = {}
        self._revoked = set()
        self._lock = RLock()

    def admit(self, account_id, group_id, presence, *, snapshot=None):
        key = (account_id, group_id)
        with self._lock:
            if (presence, group_id) in self._revoked:
                raise PermissionError("Group access was revoked.")
            epoch = self._epochs.get(key, 0)
            # After revocation, stale list responses cannot seed admission.
            group = self._grants.get(key, snapshot if epoch == 0 else None)
        if group is None:
            group = self._repository.get_by_id(group_id)
        if group is None or group.deleted_at is not None:
            raise ValueError('Group does not exist.')
        # A guest admission is retained too; joining a group later does not
        # silently promote a guest already playing at a table.
        with self._lock:
            if self._epochs.get(key, 0) != epoch:
                raise PermissionError('Group access was revoked.')
            self._grants.setdefault(key, group)
            self._leases.setdefault(key, set()).add(presence)
            return self._grants[key]

    def release(self, presence, group_id=None):
        with self._lock:
            self._revoked = {(p, g) for p, g in self._revoked
                             if p != presence or (group_id is not None and g != group_id)}
            for key, leases in list(self._leases.items()):
                if group_id is not None and key[1] != group_id:
                    continue
                leases.discard(presence)
                if not leases:
                    self._leases.pop(key)
                    self._grants.pop(key, None)

    def revoke(self, account_id, group_id):
        """Call when removing a member; all live authorizations end immediately."""
        key = (account_id, group_id)
        with self._lock:
            self._epochs[key] = self._epochs.get(key, 0) + 1
            self._grants.pop(key, None)
            leases = self._leases.pop(key, set())
            self._revoked.update((presence, group_id) for presence in leases)
            return leases

    def get_group(self, account_id, group_id):
        with self._lock:
            group = self._grants.get((account_id, group_id))
        if group is None or not group.membership_for(account_id):
            raise PermissionError('Only admitted group members may access the group.')
        return group

    def admitted_members(self, group_id):
        """Return member accounts from live grants; this never reads storage."""
        with self._lock:
            return {account for (account, group), snapshot in self._grants.items()
                    if group == group_id and snapshot.membership_for(account)}

    def list_members(self, account_id, group_id):
        self.get_group(account_id, group_id)
        return self._repository.list_members(group_id, account_id, authorized=True)

    def update_defaults(self, account_id, group_id, rules, seat_count):
        group = self.get_group(account_id, group_id)
        if group.membership_for(account_id).role not in (GroupRole.OWNER, GroupRole.ADMIN):
            raise PermissionError('Only owners and admins may change group settings.')
        if type(seat_count) is not int or not 2 <= seat_count <= 4:
            raise ValueError('Seat count must be between 2 and 4.')
        if not isinstance(rules, dict):
            raise ValueError('Game settings must be an object.')
        if not self._repository.update_defaults(group_id, account_id, rules, seat_count, authorized=True):
            raise ValueError('Group does not exist.')
        with self._lock:
            for key, snapshot in self._grants.items():
                if key[1] == group_id:
                    self._grants[key] = replace(snapshot, default_rules=rules, default_seat_count=seat_count)
