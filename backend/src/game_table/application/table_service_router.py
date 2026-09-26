"""Route the existing table transport to private or group application services."""


class TableServiceRouter:
    _BY_CODE = {
        'get_table', 'get_table_view', 'get_pending_rules', 'get_seat_account_participants',
        'get_table_member_name_for_account', 'can_view_hand',
    }
    _BY_MEMBER = {
        'leave_table', 'update_name', 'transfer_host', 'remove_member',
        'add_seat', 'remove_seat', 'assign_seat', 'unassign_seat', 'update_rules',
        'prepare_game_start', 'validate_game_end', 'attach_game', 'detach_game', 'block_game', 'resume_game',
        'mark_persistent', 'unmark_persistent', 'enable_hand_visibility',
        'disable_hand_visibility', 'grant_hand_view', 'revoke_hand_view',
        'get_table_code_for_member', 'get_seat_index_for_member',
    }

    def __init__(self, private_tables, group_tables, registry):
        self._private = private_tables
        self._groups = group_tables
        self._registry = registry

    def _for_code(self, code):
        if code in self._registry.group_tables:
            return self._groups
        return self._private

    def create_table(self, *args, **kwargs):
        return self._private.create_table(*args, **kwargs)

    def create_empty_table(self, **kwargs):
        return self._private.create_empty_table(**kwargs)

    def join_table(self, member_id, table_code, name, **kwargs):
        return self._for_code(table_code).join_table(member_id, table_code, name, **kwargs)

    def delete_table(self, member_id, table_code):
        return self._for_code(table_code).delete_table(member_id, table_code)

    def table_exists(self, table_code):
        return self._registry.contains(table_code)

    def list_tables(self):
        # Group discovery is member-only through the group endpoint.
        return self._private.list_tables()

    def cleanup_idle_tables(self):
        self._private.cleanup_idle_tables()

    def __getattr__(self, name):
        if name not in self._BY_CODE | self._BY_MEMBER:
            raise AttributeError(name)
        def dispatch(*args, **kwargs):
            key = args[0] if args else kwargs['table_code' if name in self._BY_CODE else 'member_id']
            code = key if name in self._BY_CODE else self._registry.member_to_table.get(key)
            return getattr(self._for_code(code), name)(*args, **kwargs)
        return dispatch
