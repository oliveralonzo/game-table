"""Private-table authorization, applied by the application service."""

from game_table.table.table import Table


class PrivateTablePermissions:
    """Consult the current host on every action, including after host transfer."""

    def can_modify_seat_count(self, table: Table, actor_id: str) -> bool:
        return actor_id == table.host_id

    def can_unseat(self, table: Table, actor_id: str, occupant_id: str) -> bool:
        return actor_id == occupant_id or actor_id == table.host_id

    def can_start_game(self, table: Table, actor_id: str) -> bool:
        return actor_id == table.host_id
