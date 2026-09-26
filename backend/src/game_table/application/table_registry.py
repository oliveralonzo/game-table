"""Shared in-memory registry for globally unique active table codes."""
from threading import RLock
from secrets import choice

def generate_table_code() -> str:
    return "".join(choice(chars) for chars in ("BCDFGJKLMNPRSTV", "AEIU") * 2) + "-" + "".join(choice("0123456789") for _ in range(4))

from game_table.table.table import Table


class TableRegistry:
    def __init__(self):
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
                self.add(table)
                return table
        raise RuntimeError('Could not allocate an available table code.')

    def for_group(self, group_id: str) -> list[Table]:
        with self._lock:
            return [table for table in self.group_tables.values() if table.group_id == group_id]
