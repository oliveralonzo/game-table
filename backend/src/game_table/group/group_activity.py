"""Read model for a group's recorded activity, separate from live tables."""
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class GroupActivitySnapshot:
    created_at: int
    first_played_at: int | None
    members: list[dict]
    games: list[dict]


class GroupActivityRepository(Protocol):
    def read(self, group_id: str, account_id: str, start: int | None,
             end: int | None, *, authorized: bool = False) -> GroupActivitySnapshot | None: ...
