"""Ordered challenger membership and timed post-game handoffs."""
import asyncio
from types import SimpleNamespace
import pytest

from game_table.table.player_queue import PlayerQueue
from game_table.table.post_game_transition import PostGameTransition
from test_post_game_lifecycle import setup, close, accept, socket


def model(challengers=('x', 'y')):
    return PostGameTransition(('a', 'b', 'c', 'd'), ('A', 'B', 'A', 'B'), frozenset({'a', 'c'}),
                             now=0, response_seconds=10, challengers=challengers)


def winners(m, mix=False):
    for player in ('a', 'c'):
        m.respond_keep_playing(player, True, now=1)
        m.choose_team(player, 'mix_it_up' if mix else 'same_team', now=1)


def test_queue_preserves_order_and_snapshots_are_detached():
    q = PlayerQueue()
    q.join('x'); q.join('y'); q.join('x')
    assert q.snapshot() == ['x', 'y']
    q.snapshot().clear()
    q.replace('x', 'new-x')
    q.leave('y'); q.join('y')
    assert q.snapshot() == ['new-x', 'y']


def test_challengers_wait_for_winners_then_fill_opponent_seats():
    m = model(('x', 'y', 'z'))
    assert m.snapshot()['players']['x']['decision'] == 'ready'
    m.respond_keep_playing('x', True, now=0)
    assert m.snapshot()['phase'] == 'winner_checks'
    winners(m)
    assert m.snapshot()['phase'] == 'challenger_checks'
    assert m.snapshot()['players']['z']['decision'] == 'waiting'
    m.respond_keep_playing('y', True, now=2)
    assert m.snapshot()['phase'] == 'seating_ready'
    assert m.proposed_seats == ('a', 'x', 'c', 'y')
    assert m.snapshot()['players']['b']['decision'] == 'waiting'


def test_decline_and_timeout_offer_next_challengers_fresh_windows():
    m = model(('x', 'y', 'z', 'w'))
    winners(m)
    m.respond_keep_playing('x', False, now=2)
    assert m.snapshot()['players']['z']['deadline'] == 12
    m.expire(now=11)
    assert m.snapshot()['players']['w']['deadline'] == 21
    assert m.snapshot()['players']['y']['decision'] == 'timed_out'
    with pytest.raises(ValueError):
        m.respond_keep_playing('y', True, now=11)
    m.respond_keep_playing('z', True, now=11)
    m.respond_keep_playing('w', True, now=11)
    assert m.proposed_seats == ('a', 'z', 'c', 'w')


@pytest.mark.parametrize('mix', [False, True])
def test_lone_challenger_selects_returning_player_with_winners_seating_priority(mix):
    m = model(('x',))
    winners(m, mix)
    m.respond_keep_playing('x', True, now=2)
    assert m.snapshot()['selection_candidates'] == ['b', 'd']
    assert m.snapshot()['players']['x']['decision'] == 'partner_choice'
    with pytest.raises(ValueError):
        m.choose_player('x', 'a', now=2)
    with pytest.raises(ValueError):
        m.choose_player('b', 'd', now=2)
    m.choose_player('x', 'd', now=3)
    assert m.snapshot()['invited_by'] == {'d': 'x'}
    assert m.snapshot()['players']['d']['deadline'] == 13
    m.respond_keep_playing('d', True, now=4)
    assert set(m.proposed_seats) == {'a', 'c', 'x', 'd'}
    assert (m.proposed_seats.index('a') % 2 != m.proposed_seats.index('c') % 2) == mix


def test_selected_player_declines_then_challenger_can_pick_another():
    m = model(('x',))
    winners(m)
    m.respond_keep_playing('x', True, now=2)
    m.choose_player('x', 'b', now=3)
    m.respond_keep_playing('b', False, now=4)
    assert m.snapshot()['selection_candidates'] == []
    assert m.snapshot()['players']['d']['decision'] == 'keep_playing'
    assert m.snapshot()['players']['x']['decision'] == 'accepted'
    m.respond_keep_playing('d', True, now=6)
    assert set(m.proposed_seats) == {'a', 'c', 'x', 'd'}


def test_selection_timeout_keeps_ready_challenger_and_offers_loser():
    m = model(('x',))
    winners(m)
    m.respond_keep_playing('x', True, now=2)
    m.expire(now=12)
    assert m.snapshot()['players']['x']['decision'] == 'accepted'
    assert m.snapshot()['players']['b']['decision'] == 'keep_playing'
    m.respond_keep_playing('b', False, now=13)
    assert m.snapshot()['players']['d']['deadline'] == 23
    m.respond_keep_playing('d', True, now=14)
    assert set(m.proposed_seats) == {'a', 'c', 'x', 'd'}


def test_all_challengers_skip_then_losers_get_keep_playing():
    m = model()
    winners(m)
    m.respond_keep_playing('x', False, now=2)
    m.respond_keep_playing('y', False, now=2)
    assert m.snapshot()['phase'] == 'loser_checks'
    assert m.snapshot()['players']['b']['decision'] == 'keep_playing'
    assert m.snapshot()['players']['d']['decision'] == 'keep_playing'


def test_withdrawing_an_offer_advances_to_next_challenger():
    m = model(('x', 'y', 'z'))
    winners(m)
    m.withdraw('x')
    m.expire(now=2)
    assert m.snapshot()['players']['z']['decision'] == 'ready'


def test_table_queue_consumer_keeps_unused_entries_across_games():
    s = setup()
    for p in ('x', 'y', 'z'):
        s.tables.join_table(p, 'T', p)
        s.service.set_queue_membership(p, queued=True)
    with pytest.raises(ValueError, match='Seated'):
        s.service.set_queue_membership('a', queued=True)
    id = close(s)
    accept(s, id, 'a'); accept(s, id, 'c')
    for p in ('x', 'y'):
        s.service.respond_post_game(p, id, keep_playing=True)
    assert s.tables.get_table_view('T')['seats'] == ['a', 'x', 'c', 'y']
    assert s.tables.get_table_view('T')['queue'] == ['z']
    s.service.start_game_for_table('a')
    assert s.table.get_queue() == ['z']


def test_leave_queue_with_pending_offer_passes_it_on():
    s = setup()
    for p in ('x', 'y', 'z'):
        s.tables.join_table(p, 'T', p)
        s.service.set_queue_membership(p, queued=True)
    id = close(s)
    accept(s, id, 'a'); accept(s, id, 'c')
    s.service.set_queue_membership('x', queued=False)
    assert s.table.get_queue() == ['y', 'z']
    assert s.table.post_game_transition.snapshot()['players']['z']['decision'] == 'ready'


def test_queue_replacement_and_departure_preserve_membership_invariants():
    s = setup()
    s.tables.join_table('x', 'T', 'X', account_id='account-x')
    s.service.set_queue_membership('x', queued=True)
    s.tables.join_table('new-x', 'T', 'X', account_id='account-x')
    assert s.table.get_queue() == ['new-x']
    s.tables.leave_table('new-x')
    assert s.table.get_queue() == []


def test_socket_queue_and_selection_commands_broadcast_authoritative_state():
    async def run():
        s = setup()
        s.tables.join_table('x', 'T', 'X')
        sio = socket(s)
        assert await sio.handlers['table:queue_join']('x', {}) == {'updated': True}
        assert sio.views[-1]['queue'] == ['x']
        assert (await sio.handlers['table:queue_join']('a', {}))['error'] == 'ValueError'
        await sio.handlers['table:end_game']('a', {})
        id = sio.views[-1]['post_game_transition']['id']
        for p in ('a', 'c'):
            await sio.handlers['table:post_game_keep_playing'](p, {'transition_id': id, 'keep_playing': True})
            await sio.handlers['table:post_game_team_choice'](p, {'transition_id': id, 'team_preference': 'same_team'})
        await sio.handlers['table:post_game_keep_playing']('x', {'transition_id': id, 'keep_playing': True})
        assert sio.views[-1]['queue'] == ['x']
        assert await sio.handlers['table:post_game_player_choice']('x', {'transition_id': id, 'selected_player': 'b'}) == {'updated': True}
        await sio.handlers['table:post_game_keep_playing']('b', {'transition_id': id, 'keep_playing': True})
        assert sio.views[-1]['seats'] == ['a', 'x', 'c', 'b']
        await asyncio.sleep(0)
    asyncio.run(run())


def test_departing_challenger_passes_offer_on_immediately():
    s = setup()
    for p in ('x', 'y', 'z'):
        s.tables.join_table(p, 'T', p)
        s.service.set_queue_membership(p, queued=True)
    id = close(s)
    accept(s, id, 'a'); accept(s, id, 'c')
    s.now[0] = 2
    s.tables.leave_table('x')
    view = s.tables.get_table_view('T')['post_game_transition']
    assert view['players']['z']['decision'] == 'ready'
    assert view['players']['z']['deadline'] == 12


def test_new_challengers_wait_until_post_game_seats_are_filled():
    s = setup()
    id = close(s)
    with pytest.raises(ValueError, match='All seats must be filled'):
        s.service.set_queue_membership('viewer', queued=True)
    accept(s, id, 'a'); accept(s, id, 'c'); accept(s, id, 'b'); accept(s, id, 'd')
    s.service.set_queue_membership('viewer', queued=True)
    assert s.table.get_queue() == ['viewer']
    s.service.start_game_for_table('a')
    assert s.table.get_queue() == ['viewer']


def test_new_challengers_cannot_queue_when_a_seat_is_empty():
    s = setup()
    s.tables.join_table('x', 'T', 'X')
    s.tables.leave_table('d')
    with pytest.raises(ValueError, match='All seats must be filled'):
        s.service.set_queue_membership('x', queued=True)
    assert s.table.get_queue() == []


def test_queued_challenger_can_leave_after_a_seat_opens():
    s = setup()
    s.tables.join_table('x', 'T', 'X')
    s.service.set_queue_membership('x', queued=True)
    s.tables.leave_table('d')
    s.service.set_queue_membership('x', queued=False)
    assert s.table.get_queue() == []


def test_either_chooses_an_available_loser_and_marks_random_invitation(monkeypatch):
    monkeypatch.setattr('game_table.table.post_game_transition.choice', lambda candidates: candidates[-1])
    m = model(('x',))
    winners(m)
    m.respond_keep_playing('x', True, now=2)
    m.choose_player('x', '__random__', now=3)
    assert m.snapshot()['random_invites'] == ['d']
    assert m.snapshot()['invited_by'] == {'d': 'x'}
    assert m.snapshot()['players']['d']['decision'] == 'keep_playing'
    m.replace_player('d', 'new-d')
    assert m.snapshot()['random_invites'] == ['new-d']


def test_cancel_player_choice_returns_to_ready_without_extending_deadline():
    m = model(('x',))
    winners(m)
    m.respond_keep_playing('x', True, now=2)
    deadline = m.snapshot()['players']['x']['deadline']
    m.choose_player('x', '__cancel__', now=3)
    assert m.snapshot()['players']['x']['decision'] == 'ready'
    assert m.snapshot()['players']['x']['deadline'] == deadline
    assert m.snapshot()['invited_by'] == {}
    m.respond_keep_playing('x', True, now=4)
    assert m.snapshot()['players']['x']['decision'] == 'partner_choice'
    assert m.snapshot()['players']['x']['deadline'] == deadline
    m.choose_player('x', '__cancel__', now=5)
    m.respond_keep_playing('x', False, now=6)
    assert m.snapshot()['players']['x']['decision'] == 'left'


def test_cancel_preserves_queue_membership_until_selection_is_committed():
    s = setup()
    s.tables.join_table('x', 'T', 'X')
    s.service.set_queue_membership('x', queued=True)
    id = close(s)
    accept(s, id, 'a'); accept(s, id, 'c')
    s.service.respond_post_game('x', id, keep_playing=True)
    assert s.table.get_queue() == ['x']
    s.service.respond_post_game('x', id, selected_player='__cancel__')
    assert s.table.get_queue() == ['x']
    assert s.table.post_game_transition.snapshot()['players']['x']['decision'] == 'ready'


def test_cancelled_readiness_expires_at_original_selection_deadline():
    m = model(('x',))
    winners(m)
    m.respond_keep_playing('x', True, now=2)
    m.choose_player('x', '__cancel__', now=3)
    m.expire(now=12)
    assert m.snapshot()['players']['x']['decision'] == 'timed_out'
    with pytest.raises(ValueError):
        m.respond_keep_playing('x', True, now=12)


def test_challenger_confirms_before_winners_but_selection_waits_for_winners():
    m = model(('x',))
    assert m.snapshot()['players']['x']['deadline'] == 10
    m.respond_keep_playing('x', True, now=1)
    assert m.snapshot()['players']['x']['decision'] == 'accepted'
    assert m.phase.value == 'winner_checks'
    assert m.snapshot()['selection_candidates'] == []
    winners(m)
    assert m.snapshot()['players']['x']['decision'] == 'partner_choice'


def test_departures_while_winners_decide_offer_next_challengers():
    m = model(('x', 'y', 'z', 'w'))
    assert m.snapshot()['players']['z']['decision'] == 'waiting'
    m.respond_keep_playing('x', False, now=1)
    assert m.snapshot()['players']['z']['decision'] == 'ready'
    m.withdraw('a')
    m.expire(now=2)
    assert m.snapshot()['players']['w']['decision'] == 'ready'
    assert m.phase.value == 'winner_checks'


@pytest.mark.parametrize('departed', [('b',), ('b', 'd')])
def test_loser_departure_updates_active_choice_without_stale_prompt(departed):
    m = model(('x',))
    winners(m)
    m.respond_keep_playing('x', True, now=2)
    for player in departed:
        m.withdraw(player)
    m.expire(now=3)
    assert m.snapshot()['players']['x']['decision'] == 'accepted'
    assert m.snapshot()['selection_candidates'] == []
    if len(departed) == 1:
        assert m.snapshot()['players']['d']['decision'] == 'keep_playing'
    else:
        assert m.phase.value == 'seating_ready'
        assert m.proposed_seats.count(None) == 1


@pytest.mark.parametrize('randomly', [False, True])
def test_other_loser_notification_waits_for_selected_player_acceptance(randomly):
    m = model(('x',))
    winners(m)
    m.respond_keep_playing('x', True, now=2)
    m.choose_player('x', '__random__' if randomly else 'b', now=3)
    invited = next(iter(m.snapshot()['invited_by']))
    other = 'd' if invited == 'b' else 'b'
    assert m.snapshot()['selection_notifications'] == {}
    m.respond_keep_playing(invited, True, now=4)
    assert m.snapshot()['selection_notifications'] == {other: {'challenger': 'x', 'player': invited, 'random': randomly}}
    detached = m.snapshot()['selection_notifications']
    detached[other]['player'] = 'changed'
    assert m.snapshot()['selection_notifications'][other]['player'] == invited


def test_no_selection_notification_when_selected_loser_declines():
    m = model(('x',))
    winners(m)
    m.respond_keep_playing('x', True, now=2)
    m.choose_player('x', 'b', now=3)
    m.respond_keep_playing('b', False, now=4)
    assert m.snapshot()['selection_notifications'] == {}
    assert m.snapshot()['players']['d']['decision'] == 'keep_playing'


def test_early_ready_challenger_can_cancel_later_without_losing_queue():
    s = setup()
    s.tables.join_table('x', 'T', 'X')
    s.service.set_queue_membership('x', queued=True)
    id = close(s)
    s.service.respond_post_game('x', id, keep_playing=True)
    assert s.table.get_queue() == ['x']
    accept(s, id, 'a'); accept(s, id, 'c')
    s.service.respond_post_game('x', id, selected_player='__cancel__')
    assert s.table.get_queue() == ['x']
    assert s.table.post_game_transition.snapshot()['players']['x']['decision'] == 'ready'
