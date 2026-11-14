"""Scheduling boundary, independent of tables and game progression."""
from dataclasses import asdict
from copy import deepcopy
from time import time
from uuid import uuid4

from game_table.group.group import GroupRole
from game_table.tournament.tournament import Tournament
from game_table.tournament.tournament_repository import TournamentRepository


class TournamentService:
    def __init__(self, groups, repository: TournamentRepository, settings_provider, clock=None):
        self.groups = groups
        self.repository = repository
        self.settings = settings_provider
        self.clock = clock or (lambda: int(time() * 1000))

    def create(self, account_id, group_id, scheduled_at, rules=None):
        group = self.groups.get_group(account_id, group_id)
        if group.membership_for(account_id).role not in (GroupRole.OWNER, GroupRole.ADMIN):
            raise PermissionError('Only group admins may create tournaments.')
        if rules is not None and not isinstance(rules, dict):
            raise ValueError('Game settings must be an object.')
        source = rules if rules is not None else group.default_rules
        settings = (self.settings.parse_settings(deepcopy(source)) if source is not None
                    else self.settings.default_settings())
        tournament = Tournament(str(uuid4()), group.id, account_id, self.clock(), scheduled_at,
                                self.settings.serialize_settings(settings))
        if not self.repository.create(tournament):
            raise PermissionError('Only group admins may create tournaments.')
        return tournament

    def delete(self, account_id, tournament_id):
        if not self.repository.delete(tournament_id, account_id):
            raise PermissionError('Only group admins may delete scheduled tournaments.')

    def list_for_group(self, account_id, group_id):
        self.groups.get_group(account_id, group_id)
        return self.repository.list_for_group(group_id, account_id)

    def get(self, account_id, tournament_id):
        tournament = self.repository.get_by_id(tournament_id, account_id)
        if tournament is None:
            raise PermissionError('Tournament is unavailable.')
        self.groups.get_group(account_id, tournament.group_id)
        return tournament

    def list_details(self, account_id, group_id):
        tournaments = self.list_for_group(account_id, group_id)
        attendance = self.repository.attendance_for_group(group_id, account_id)
        return [self._details(t, attendance) for t in tournaments]

    def details(self, account_id, tournament_id):
        tournament = self.get(account_id, tournament_id)
        attendance = self.repository.attendance_for_group(tournament.group_id, account_id)
        return {**self._details(tournament, attendance),
                'attendance_roster': self.repository.attendance_roster(tournament_id, account_id)}

    @staticmethod
    def _details(tournament, attendance):
        return {**asdict(tournament), **attendance.get(tournament.id, {
            'attendance_intent_count': 0, 'attendance_maybe_count': 0, 'attendance_intent': False, 'attendance_response': None})}

    def set_attendance_intent(self, account_id, tournament_id, attending):
        # Keep the previous boolean API compatible while clients reload.
        if type(attending) is bool:
            attending = 'yes' if attending else 'no'
        if not isinstance(attending, str) or attending not in ('yes', 'maybe', 'no'):
            raise ValueError('Attendance response must be yes, maybe, or no.')
        tournament = self.get(account_id, tournament_id)
        if tournament.status != 'scheduled':
            raise ValueError('Attendance intent is only available for scheduled tournaments.')
        if not self.repository.set_attendance_intent(tournament_id, account_id, attending, self.clock()):
            raise PermissionError('Tournament is unavailable.')
        return self.details(account_id, tournament_id)
