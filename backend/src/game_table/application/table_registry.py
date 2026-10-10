"""Shared in-memory registry for globally unique active table codes."""
from threading import RLock
from secrets import choice

def generate_table_code() -> str:
    return "".join(choice("0123456789") for _ in range(6))

from game_table.table.table import Table
from game_table.infrastructure.table_invite_tokens import TableInviteTokens


class TableRegistry:
    def __init__(self, invite_tokens=None):
        self._invite_tokens = invite_tokens or TableInviteTokens()
        self.member_to_table: dict[str, str] = {}
        self.private_tables: dict[str, Table] = {}
        self.group_tables: dict[str, Table] = {}
        self._lock = RLock()

    def contains(self, code: str) -> bool:
        with self._lock:
            return code in self.private_tables or code in self.group_tables

    def add(self, table: Table) -> None:
        with self._lock:
            if self.contains(table.table_code):
                raise ValueError('Table already exists.')
            table.invite_token = self._invite_tokens.allocate(table.table_code)
            target = self.group_tables if table.group_id is not None else self.private_tables
            target[table.table_code] = table

    def create_empty(self, *, group_id=None, rules=None, code_factory=generate_table_code, seat_count=4, creator_identity=None) -> Table:
        with self._lock:
            for _ in range(100):
                code = code_factory()
                if self.contains(code):
                    continue
                table = Table(code, None, group_id=group_id, rules=rules, start_empty=True)
                if creator_identity:
                    table.reserve_host(creator_identity)
                for _ in range(4 - seat_count):
                    table.remove_seat()
                try:
                    self.add(table)
                except ValueError as exc:
                    if str(exc) == "Invitation tokens exhausted for this code.":
                        continue
                    raise
                return table
        raise RuntimeError('Could not allocate an available table code.')

    def for_group(self, group_id: str) -> list[Table]:
        with self._lock:
            return [table for table in self.group_tables.values() if table.group_id == group_id]
