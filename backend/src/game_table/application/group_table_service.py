"""Group table discovery, sessions, seating, and last-participant closure."""
from typing import Callable

from game_table.application.group_service import GroupService
from game_table.application.table_registry import TableRegistry, generate_table_code
from game_table.table.table import Table
from game_table.application.table_session_service import TableSessionService



class GroupTableService(TableSessionService):
    def __init__(self, groups: GroupService, registry: TableRegistry,
                 code_factory: Callable[[], str] = generate_table_code, *, settings_provider=None, sessions=None):
        super().__init__(registry.group_tables, registry.member_to_table)
        self._groups = groups
        self._sessions = sessions
        self._registry = registry
        self._code_factory = code_factory
        self._settings_provider = settings_provider
        # Presentation hints only: never use these to authorize mutations.
        self._group_member_ids: set[str] = set()
        self._group_public_ids: dict[str, str | None] = {}

    def list_tables(self, account_id: str, group_id: str) -> list[dict]:
        self._groups.get_group(account_id, group_id)
        return [self._view(table) for table in self._registry.for_group(group_id)]

    def create_table(self, account_id: str, group_id: str) -> dict:
        group = self._groups.get_group(account_id, group_id)
        rules = None
        if self._settings_provider:
            defaults = getattr(group, 'default_rules', None)
            rules = (self._settings_provider.parse_settings(defaults) if defaults is not None
                     else self._settings_provider.default_settings())
        table = self._registry.create_empty(group_id=group_id, code_factory=self._code_factory, rules=rules,
                                            seat_count=getattr(group, 'default_seat_count', 4))
        self._group_public_ids[table.instance_id] = getattr(group, 'public_id', None)
        return self.table_preview(table)

    _view = staticmethod(TableSessionService.table_preview)

    def join_table(self, member_id: str, table_code: str, name: str,
                   account_id: str | None = None, account_username: str | None = None,
                   creator_identity: str | None = None):
        table = self._get_table(table_code)
        if member_id in self._member_to_table:
            raise ValueError("Member already belongs to a table.")
        # Resolve the joining account once, outside the registry lock. Guests
        # can still join; database failures must not leave a half-joined session.
        if self._sessions and account_id:
            self._sessions.admit(account_id, table.group_id, f'table:{member_id}')
        is_member = self._groups.is_member(account_id, table.group_id) if account_id else False
        try:
            with self._registry._lock:
                if self._get_table(table_code) is not table:
                    raise ValueError('Table does not exist.')
                replaced = super().join_table(member_id, table_code, name, account_id,
                                              account_username, creator_identity)
                if is_member:
                    self._group_member_ids.add(member_id)
                return replaced
        except Exception:
            if self._sessions:
                self._sessions.release(f'table:{member_id}')
            raise

    def _remove_member_identity(self, member_id: str) -> None:
        self._group_member_ids.discard(member_id)
        if self._sessions:
            self._sessions.release(f'table:{member_id}')
        super()._remove_member_identity(member_id)

    def close_empty_table(self, account_id: str, group_id: str, table_code: str, instance_id: str) -> None:
        self._groups.get_group(account_id, group_id)
        with self._registry._lock:
            table = self._get_table(table_code)
            if table.group_id != group_id or table.instance_id != instance_id:
                raise ValueError('Table does not exist.')
            if table.members:
                raise ValueError('Only empty tables can be closed from the group.')
            self._tables.pop(table_code)
            self._last_activity.pop(table_code, None)
            self._group_public_ids.pop(table.instance_id, None)

    def leave_table(self, member_id: str) -> None:
        code, table = self._get_table_for_member(member_id)
        table.remove_member(member_id)
        self._remove_member_identity(member_id)
        if not table.members:
            self._tables.pop(code, None)
            self._last_activity.pop(code, None)
            self._group_public_ids.pop(table.instance_id, None)

    def delete_table(self, member_id: str, table_code: str) -> str | None:
        code, table = self._get_table_for_member(member_id)
        if code != table_code:
            raise ValueError('Acting member not in specified table.')
        if len(table.members) != 1:
            raise PermissionError('Only the last participant may close the table.')
        game_id = table.active_game_id
        self.leave_table(member_id)
        return game_id

    def _require_group_member(self, member_id: str) -> Table:
        _, table = self._get_table_for_member(member_id)
        account_id = table.members[member_id].account_id
        if not account_id:
            raise PermissionError('Only group members may manage seats.')
        try:
            self._groups.get_group(account_id, table.group_id)
        except (PermissionError, ValueError):
            self._group_member_ids.discard(member_id)
            raise
        self._group_member_ids.add(member_id)
        return table

    def add_seat(self, member_id: str) -> None:
        self._require_group_member(member_id).add_seat()

    def remove_seat(self, member_id: str) -> None:
        self._require_group_member(member_id).remove_seat()

    def unassign_seat(self, member_id: str, seat_index: int) -> None:
        _, table = self._get_table_for_member(member_id)
        occupant = table.get_seat_occupant(seat_index)
        if occupant is None:
            return
        if occupant != member_id:
            self._require_group_member(member_id)
        table.unassign_seat(seat_index)

    def get_table_view(self, table_code: str) -> dict:
        view = super().get_table_view(table_code)
        table = self._get_table(table_code)
        # Moves and broadcasts serialize this repeatedly. Hints are resolved
        # on join (and refreshed by protected actions), never by a snapshot.
        view['group_member_ids'] = [key for key, member in table.members.items()
                                    if (self._sessions.is_member(member.account_id, table.group_id)
                                        if self._sessions else key in self._group_member_ids)]
        if view['group_member_ids']:
            view['group_public_id'] = self._group_public_ids.get(table.instance_id)
        return view

    def prepare_game_start(self, member_id: str):
        table = self._require_group_member(member_id)
        group = self._groups.get_group(table.members[member_id].account_id, table.group_id)
        player_count = table.prepare_game_start()
        participants = self.get_seat_account_participants(table.table_code)
        for participant in participants:
            participant['group_participation'] = (
                'member' if (self._sessions.is_member(participant['account_id'], table.group_id)
                             if self._sessions else group.membership_for(participant['account_id'])) else 'guest')
        return {'table_code': table.table_code, 'player_count': player_count,
                'rules': table.pending_rules, 'participants': participants}

    def attach_game(self, member_id: str, game_id: str):
        self._require_group_member(member_id).attach_game(game_id)

    def update_rules(self, member_id: str, rules):
        self._require_group_member(member_id).set_pending_rules(rules)

    def transfer_host(self, member_id: str, new_host_id: str):
        raise PermissionError('Group tables do not have hosts.')

    def remove_member(self, member_id: str, target_member_id: str):
        raise PermissionError('Member removal is not enabled for group tables.')

    def mark_persistent(self, member_id: str):
        raise PermissionError('Group tables close when the last participant leaves.')

    unmark_persistent = mark_persistent

    def validate_game_end(self, member_id: str, *, completed: bool = False) -> None:
        table = self._require_group_member(member_id)
        if not any(seat.member_id == member_id for seat in table.seats):
            raise PermissionError('Only seated group members may end the game.')
        if table.active_game_id is None:
            raise ValueError('No active game.')

    def detach_game(self, member_id: str, *, completed: bool = False):
        self.validate_game_end(member_id, completed=completed)
        _, table = self._get_table_for_member(member_id)
        game_id = table.active_game_id
        table.release_game()
        return game_id
