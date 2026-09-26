"""Private services authorize requests; the shared table enforces invariants."""

import pytest

from game_table.application.table_service import TableService
from game_table.table.table import Table, TableState


@pytest.fixture
def service():
    service = TableService()
    service.create_table('host', 'T1')
    service.remove_seat('host')
    service.remove_seat('host')
    service.join_table('player', 'T1', 'Player')
    service.assign_seat('host', 0)
    service.assign_seat('player', 1)
    return service


@pytest.mark.parametrize('action,args,message', [
    ('add_seat', (), 'Only host may add seats.'),
    ('remove_seat', (), 'Only host may modify seat count.'),
    ('prepare_game_start', (), 'Only host may start the game.'),
    ('attach_game', ('game',), 'Only host may attach the game.'),
    ('unassign_seat', (0,), 'Only host may unassign other members.'),
])
def test_private_service_rejects_nonhost_without_mutating(service, action, args, message):
    before = service.get_table_view('T1')
    activity = service._last_activity['T1']
    with pytest.raises(PermissionError) as error:
        getattr(service, action)('player', *args)
    assert str(error.value) == message
    assert service.get_table_view('T1') == before
    assert service._last_activity['T1'] == activity


@pytest.mark.parametrize('action,args', [
    ('add_seat', ()), ('remove_seat', ()), ('prepare_game_start', ()),
    ('attach_game', ('game',)), ('unassign_seat', (0,)),
])
def test_private_service_requires_table_membership(service, action, args):
    with pytest.raises(ValueError, match='Member not associated with any table'):
        getattr(service, action)('outsider', *args)


def test_permissions_follow_host_transfer(service):
    service.transfer_host('host', 'player')
    for action in [service.add_seat, service.remove_seat, service.prepare_game_start]:
        with pytest.raises(PermissionError):
            action('host')
    with pytest.raises(PermissionError):
        service.attach_game('host', 'game')
    with pytest.raises(PermissionError):
        service.unassign_seat('host', 1)
    service.add_seat('player')
    service.remove_seat('player')
    assert service.prepare_game_start('player')['player_count'] == 2
    service.attach_game('player', 'game')
    service.unassign_seat('player', 0)
    assert service.get_table('T1').state == TableState.GAME_BLOCKED


@pytest.mark.parametrize('actor', ['host', 'player'])
def test_host_or_occupant_can_unseat_during_game(service, actor):
    service.attach_game('host', 'game')
    service.unassign_seat(actor, 1)
    assert service.get_table('T1').state == TableState.GAME_BLOCKED
    service.assign_seat('player', 1)
    assert service.get_table('T1').state == TableState.IN_GAME


def test_other_player_cannot_unseat_during_game(service):
    service.attach_game('host', 'game')
    with pytest.raises(PermissionError):
        service.unassign_seat('player', 0)
    assert service.get_table('T1').get_seat_occupant(0) == 'host'
    assert service.get_table('T1').state == TableState.IN_GAME


def test_service_empty_seat_is_noop_and_invalid_index_still_fails(service):
    service.unassign_seat('player', 1)
    before = service._last_activity['T1']
    service.unassign_seat('player', 1)
    assert service._last_activity['T1'] == before
    for index in [-1, 99]:
        with pytest.raises(ValueError, match='Invalid seat index'):
            service.unassign_seat('player', index)


def test_domain_operations_preserve_invariants_without_an_authorization_policy():
    table = Table('T1', 'host')
    with pytest.raises(ValueError, match='Maximum seat count'):
        table.add_seat()
    table.remove_seat()
    table.remove_seat()
    with pytest.raises(ValueError, match='minimum seat count'):
        table.remove_seat()
    with pytest.raises(ValueError, match='All seats must be filled'):
        table.prepare_game_start()
    for index in range(2):
        member_id = f'player{index}'
        table.add_member(member_id, member_id)
        table.assign_seat(member_id, index)
    assert table.prepare_game_start() == 2
    table.attach_game('game')
    with pytest.raises(ValueError):
        table.attach_game('another-game')
    with pytest.raises(ValueError):
        table.add_seat()
    with pytest.raises(ValueError):
        table.remove_seat()
    table.unassign_seat(0)
    assert table.state == TableState.GAME_BLOCKED
    table.assign_seat('player0', 0)
    assert table.state == TableState.IN_GAME
