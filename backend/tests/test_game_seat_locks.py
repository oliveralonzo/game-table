"""One hand per identity during a game, with remembered seating until explicitly reset."""
from types import SimpleNamespace

import pytest

from game_table.table.table import Table
from game_table.application.game_table_service import GameTableService


def populated_table():
    table = Table('T', 'a', host_account_id='account-a')
    for member in ('b', 'c', 'd', 'viewer'):
        table.add_member(member, member)
    for index, member in enumerate(('a', 'b', 'c', 'd')):
        table.assign_seat(member, index)
    table.bind_seat_identity('b', 'session:guest')
    return table


def test_lock_starts_at_attach_and_original_seat_can_be_reclaimed():
    table = populated_table()
    table.reset_seating()
    for member, seat in [('a', 1), ('b', 0), ('c', 2), ('d', 3)]:
        table.assign_seat(member, seat)
    table.attach_game('game-1')
    table.unassign_seat(0)
    table.unassign_seat(1)
    with pytest.raises(ValueError, match='original seat'):
        table.assign_seat('a', 0)
    assert table.get_seat_occupant(0) is None
    table.assign_seat('a', 1)
    table.assign_seat('b', 0)
    assert table.get_game_seat_locks()['a'] == 1


@pytest.mark.parametrize('member,account,identity,original', [
    ('a', 'account-a', None, 0),
    ('b', None, 'session:guest', 1),
])
def test_leaving_and_rejoining_keeps_original_seat(member, account, identity, original):
    table = populated_table()
    table.attach_game('game-1')
    table.remove_member(member)
    table.add_member('returned', 'Returned', account_id=account)
    table.bind_seat_identity('returned', identity)
    table.unassign_seat(2)
    with pytest.raises(ValueError, match='original seat'):
        table.assign_seat('returned', 2)
    table.assign_seat('returned', original)


def test_replacement_player_locks_to_the_first_hand_they_take():
    table = populated_table()
    table.attach_game('game-1')
    table.unassign_seat(0)
    table.assign_seat('viewer', 0)
    table.unassign_seat(0)
    table.unassign_seat(1)
    with pytest.raises(ValueError, match='original seat'):
        table.assign_seat('viewer', 1)
    table.assign_seat('viewer', 0)


def test_account_session_replacement_cannot_switch_hands():
    table = populated_table()
    table.attach_game('game-1')
    table.replace_member_id('a', 'new-session', 'account-a')
    table.unassign_seat(0)
    table.unassign_seat(1)
    with pytest.raises(ValueError, match='original seat'):
        table.assign_seat('new-session', 1)
    table.assign_seat('new-session', 0)


def test_game_end_unlocks_and_next_game_locks_new_seats():
    table = populated_table()
    table.attach_game('game-1')
    table.clear_game_seat_locks()
    assert table.active_game_id == 'game-1'
    table.release_game()
    table.reset_seating()
    for member, seat in [('a', 1), ('b', 0), ('c', 2), ('d', 3)]:
        table.assign_seat(member, seat)
    assert table.get_game_seat_locks() == {}
    table.attach_game('game-2')
    table.unassign_seat(0)
    table.unassign_seat(1)
    with pytest.raises(ValueError, match='original seat'):
        table.assign_seat('a', 0)
    table.assign_seat('a', 1)
    table.release_game()
    assert table.get_game_seat_locks() == {}


@pytest.mark.parametrize('completed', [False, True])
def test_completion_boundary_works_without_database(completed):
    table = populated_table()
    table.attach_game('game-1')
    service = GameTableService(
        table_service=SimpleNamespace(get_table=lambda _: table),
        game_service=SimpleNamespace(is_over=lambda _: completed),
    )
    service.record_completed_game_for_table('T', 'game-1')
    assert bool(table.get_game_seat_locks()) is not completed


def test_completed_game_unlocks_even_if_history_save_fails():
    table = populated_table()
    table.attach_game('game-1')
    def fail(**kwargs):
        raise RuntimeError('Database unavailable')
    service = GameTableService(
        table_service=SimpleNamespace(get_table=lambda _: table, get_seat_account_participants=lambda _: []),
        game_service=SimpleNamespace(is_over=lambda _: True, get_result=lambda _: {}),
        game_history_recorder=SimpleNamespace(record_completed_table_game=fail),
    )
    with pytest.raises(RuntimeError):
        service.record_completed_game_for_table('T', 'game-1')
    assert table.get_game_seat_locks() == {}
