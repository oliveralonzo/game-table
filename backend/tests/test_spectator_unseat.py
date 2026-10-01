"""Unseat authorization follows the actor's current seat, not just their role."""
import pytest
from game_table.application.table_registry import TableRegistry
from game_table.application.table_service import TableService
from game_table.application.group_table_service import GroupTableService

class Groups:
    def is_member(self, account_id, group_id):
        return account_id == 'member'
    def get_group(self, account_id, group_id):
        if not self.is_member(account_id, group_id):
            raise PermissionError('Not a member')

@pytest.mark.parametrize('group', [False, True])
@pytest.mark.parametrize('active', [False, True])
def test_spectator_cannot_unseat_and_permission_updates_when_they_take_or_leave_a_seat(group, active):
    registry = TableRegistry()
    if group:
        service = GroupTableService(Groups(), registry, lambda: 'TEST-1234')
        service.create_table('member', 'g')
        service.join_table('actor', 'TEST-1234', 'Actor', account_id='member')
    else:
        service = TableService(registry=registry)
        service.create_table('actor', 'TEST-1234', 'Actor', account_id='member')
    service.join_table('player', 'TEST-1234', 'Player')
    service.assign_seat('player', 1)
    table = service.get_table('TEST-1234')
    if active:
        table.attach_game('game')
    with pytest.raises(PermissionError):
        service.unassign_seat('actor', 1)
    assert table.get_seat_occupant(1) == 'player'
    service.assign_seat('actor', 0)
    service.unassign_seat('actor', 1)
    assert table.get_seat_occupant(1) is None
    service.assign_seat('player', 1)
    service.unassign_seat('actor', 0)
    with pytest.raises(PermissionError):
        service.unassign_seat('actor', 1)
    service.unassign_seat('player', 1)
    assert table.get_seat_occupant(1) is None

@pytest.mark.parametrize('group', [False, True])
def test_seated_nonmanager_cannot_unseat_others(group):
    registry = TableRegistry()
    if group:
        service = GroupTableService(Groups(), registry, lambda: 'TEST-1234')
        service.create_table('member', 'g')
        service.join_table('owner', 'TEST-1234', 'Owner', account_id='member')
    else:
        service = TableService(registry=registry)
        service.create_table('owner', 'TEST-1234', 'Owner')
    service.join_table('guest', 'TEST-1234', 'Guest')
    service.assign_seat('owner', 0)
    service.assign_seat('guest', 1)
    with pytest.raises(PermissionError):
        service.unassign_seat('guest', 0)
    assert service.get_table('TEST-1234').get_seat_occupant(0) == 'owner'
