import pytest
from test_post_game_lifecycle import setup


def running():
    s = setup()
    s.games.completed = False
    return s


def test_request_keeps_game_attached_and_collects_all_players():
    s = running()
    s.service.request_game_end('a')
    vote = s.table.end_game_confirmation
    assert s.table.active_game_id == 'finished'
    assert vote.responses == dict.fromkeys(('a', 'b', 'c', 'd'))
    assert vote.deadline == 10
    s.now[0] = 3
    s.service.request_game_end('a')
    assert s.table.end_game_confirmation is vote and vote.deadline == 10


def test_any_no_cancels_and_a_later_request_gets_a_new_identifier():
    s = running()
    s.service.request_game_end('a')
    id = s.table.end_game_confirmation.id
    s.service.respond_game_end('b', id, False)
    assert s.table.end_game_confirmation.status == 'cancelled'
    assert s.table.active_game_id == 'finished'
    s.service.request_game_end('a')
    assert s.table.end_game_confirmation.id != id
    with pytest.raises(ValueError):
        s.service.respond_game_end('c', id, True)


def test_all_yes_closes_and_starts_checks_without_winner_priority():
    s = running()
    s.service.request_game_end('a')
    id = s.table.end_game_confirmation.id
    for p in ('a', 'b', 'c'):
        s.service.respond_game_end(p, id, True)
        assert s.table.active_game_id == 'finished'
    s.service.respond_game_end('d', id, True)
    assert s.table.active_game_id is None
    assert s.table.post_game_transition.snapshot()['phase'] == 'loser_checks'
    assert s.table.post_game_transition.snapshot()['winners'] == []
    assert all(seat.member_id is None for seat in s.table.seats)


def test_timeout_is_yes_and_works_if_initiator_leaves():
    s = running()
    s.service.request_game_end('a')
    s.tables.leave_table('a')
    s.now[0] = 10
    s.service.expire_game_end_for_table('T')
    assert s.table.active_game_id is None
    assert s.table.end_game_confirmation.status == 'approved'
    assert all(s.table.end_game_confirmation.responses.values())


def test_spectators_and_duplicate_answers_are_rejected():
    s = running()
    with pytest.raises(PermissionError):
        s.service.request_game_end('viewer')
    s.service.request_game_end('a')
    id = s.table.end_game_confirmation.id
    with pytest.raises(ValueError):
        s.service.respond_game_end('viewer', id, False)
    s.service.respond_game_end('a', id, True)
    with pytest.raises(ValueError):
        s.service.respond_game_end('a', id, False)
    assert s.table.end_game_confirmation.status == 'pending'


def test_completed_game_close_remains_direct():
    s = setup()
    s.service.request_game_end('a')
    assert s.table.active_game_id is None
    assert s.table.end_game_confirmation is None
