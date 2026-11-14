"""Scheduled tournament values. All timestamps are UTC Unix milliseconds."""
from copy import deepcopy
from dataclasses import dataclass


@dataclass(frozen=True)
class Tournament:
    id: str
    group_id: str
    created_by: str
    created_at: int
    scheduled_at: int
    rules: dict
    status: str = 'scheduled'

    def __post_init__(self):
        if not all(isinstance(v, str) and v.strip() for v in (self.id, self.group_id, self.created_by)):
            raise ValueError('Tournament, group, and creator IDs are required.')
        if any(type(v) is not int for v in (self.created_at, self.scheduled_at)):
            raise ValueError('Timestamps must be integer Unix milliseconds.')
        if self.created_at < 0 or self.scheduled_at <= self.created_at:
            raise ValueError('Tournament must be scheduled in the future.')
        if not isinstance(self.rules, dict):
            raise ValueError('Game settings must be an object.')
        if self.status != 'scheduled':
            raise ValueError('Only scheduled tournaments are supported.')
        object.__setattr__(self, 'rules', deepcopy(self.rules))
