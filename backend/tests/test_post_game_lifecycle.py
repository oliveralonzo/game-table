"""Server lifecycle, membership, seat guards, commands and scheduled expiry."""
import asyncio
from types import SimpleNamespace

import pytest

from game_table.application.game_table_service import GameTableService
from game_table.application.table_service import TableService
from game_table.api.ws.table_ws import register_table_events


class Games:
    def __init__(self):
        self.removed = []
        self.completed = True

    def get_result(self, game_id):
        return dict(winning_team_index=0, seat_team_indices={0: 0, 1: 1, 2: 0, 3: 1})

    def is_over(self, game_id):
        return self.completed

    def remove_game(self, game_id):
        self.removed.append(game_id)

    def create_game(self, **kwargs):
        return 'next-game'


def setup(window=10, clock=None):
    tables = TableService()
    tables.create_table('a', 'T', 'A', account_id='account-a')
    for player in ('b', 'c', 'd', 'viewer'):
        tables.join_table(player, 'T', player)
    for i, player in enumerate(('a', 'b', 'c', 'd')):
        tables.assign_seat(player, i)
    table = tables.get_table('T')
    table.attach_game('finished')
    now = [0]
    games = Games()
    service = GameTableService(games, tables, clock_ms=clock or (lambda: now[0] * 1000),
                               post_game_response_seconds=window)
    return SimpleNamespace(tables=tables, table=table, games=games, service=service, now=now)


def close(s):
    s.service.end_game_for_table('a')
    return s.tables.get_table_view('T')['post_game_transition']['id']


def accept(s, id, player, preference='same_team'):
    s.service.respond_post_game(player, id, keep_playing=True)
    if player in ('a', 'c'):
        s.service.respond_post_game(player, id, team_preference=preference)


def test_close_clears_seats_locks_and_history_but_preserves_members():
    s = setup()
    id = close(s)
    view = s.tables.get_table_view('T')
    assert view['seats'] == [None] * 4
    assert view['game_seat_locks'] == {}
    assert not view['has_seating_history']
    assert len(view['members']) == 5
    assert view['active_game_id'] is None
    assert view['post_game_transition']['id'] == id
    assert s.games.removed == ['finished']


@pytest.mark.parametrize('action', [
    lambda s: s.tables.assign_seat('viewer', 0),
    lambda s: s.tables.assign_seat('a', 0, selection_method='random'),
    lambda s: s.tables.reset_seating('a'),
    lambda s: s.tables.add_seat('a'),
    lambda s: s.tables.remove_seat('a'),
    lambda s: s.table.unassign_seat(0),
    lambda s: s.service.start_game_for_table('a'),
    lambda s: s.table.attach_game('bypass'),
])
def test_seating_and_start_cannot_bypass_priority(action):
    s = setup()
    close(s)
    with pytest.raises(ValueError, match='post-game'):
        action(s)
    assert all(seat.member_id is None for seat in s.table.seats)


def test_mix_it_up_applies_seats_then_next_start_clears_transition():
    s = setup()
    id = close(s)
    accept(s, id, 'a')
    accept(s, id, 'c', 'mix_it_up')
    accept(s, id, 'b')
    assert all(seat.member_id is None for seat in s.table.seats)
    accept(s, id, 'd')
    seats = s.tables.get_table_view('T')['seats']
    assert set(seats) == {'a', 'b', 'c', 'd'}
    assert seats.index('a') % 2 != seats.index('c') % 2
    s.service.expire_post_game_for_table('T')
    assert s.tables.get_table_view('T')['seats'] == seats
    assert s.service.start_game_for_table('a') == 'next-game'
    assert s.tables.get_table_view('T')['post_game_transition'] is None


def test_expiry_and_declines_free_spots_for_ordinary_seating():
    s = setup()
    id = close(s)
    s.service.respond_post_game('a', id, keep_playing=False)
    s.now[0] = 10
    s.service.expire_post_game_for_table('T')
    assert s.tables.get_table_view('T')['post_game_transition']['phase'] == 'loser_checks'
    accept(s, id, 'b')
    s.now[0] = 20
    s.service.expire_post_game_for_table('T')
    assert s.tables.get_table_view('T')['seats'] == [None, 'b', None, None]
    s.tables.assign_seat('viewer', 0)
    assert s.service.post_game_deadline('T') is None


def test_stale_or_unauthorized_responses_cannot_claim_spots():
    s = setup()
    id = close(s)
    for player, offer in [('a', 'old-offer'), ('viewer', id), ('b', id)]:
        with pytest.raises(ValueError):
            s.service.respond_post_game(player, offer, keep_playing=True)
    with pytest.raises(ValueError):
        s.service.respond_post_game('a', id, keep_playing='yes')
    with pytest.raises(ValueError):
        s.service.respond_post_game('a', id, keep_playing=True, team_preference='same_team')
    assert s.table.post_game_transition.snapshot()['players']['a']['decision'] == 'keep_playing'


def test_departed_accepted_winner_and_waiting_loser_are_not_reseated():
    s = setup()
    id = close(s)
    accept(s, id, 'a')
    s.tables.leave_table('a')
    s.tables.leave_table('b')
    s.service.respond_post_game('c', id, keep_playing=False)
    view = s.tables.get_table_view('T')['post_game_transition']
    assert view['players']['b']['decision'] == 'left'
    accept(s, id, 'd')
    assert s.tables.get_table_view('T')['seats'] == [None, None, None, 'd']


def test_account_session_replacement_transfers_prompt():
    s = setup()
    id = close(s)
    s.tables.join_table('replacement', 'T', 'New A', account_id='account-a')
    s.service.respond_post_game('replacement', id, keep_playing=True)
    view = s.tables.get_table_view('T')['post_game_transition']
    assert 'a' not in view['players']
    assert view['players']['replacement']['decision'] == 'team_choice'
    assert 'replacement' in view['winners']


def test_departed_winners_before_close_skip_winner_checks():
    s = setup()
    s.tables.leave_table('c')
    s.tables.unassign_seat('a', 0)
    close(s)
    view = s.tables.get_table_view('T')['post_game_transition']
    assert view['previous_seats'] == [None, 'b', None, 'd']
    assert view['phase'] == 'loser_checks'


def test_incomplete_game_end_preserves_existing_behavior():
    s = setup()
    s.games.completed = False
    s.service.end_game_for_table('a')
    assert s.table.post_game_transition is None
    assert s.tables.get_table_view('T')['seats'] == ['a', 'b', 'c', 'd']


class Socket:
    def __init__(self):
        self.handlers = {}
        self.views = []

    def on(self, name):
        def register(handler):
            self.handlers[name] = handler
            return handler
        return register

    def event(self, handler):
        return handler

    async def emit(self, event, data, **kwargs):
        if event == 'table:updated':
            self.views.append(data)


def socket(s):
    sio = Socket()
    register_table_events(sio, s.tables, s.service,
                          SimpleNamespace(resolve_member_id=lambda sid: sid),
                          SimpleNamespace(serialize_settings=lambda rules: rules))
    return sio


def test_socket_commands_broadcast_phase_changes_and_reject_stale_offers():
    async def run():
        s = setup()
        sio = socket(s)
        assert await sio.handlers['table:end_game']('a', {}) == {'ended': True}
        id = sio.views[-1]['post_game_transition']['id']
        assert sio.views[-1]['seats'] == [None] * 4
        response = await sio.handlers['table:post_game_keep_playing']('a', {'transition_id': id, 'keep_playing': True})
        assert response == {'updated': True}
        assert sio.views[-1]['post_game_transition']['players']['a']['decision'] == 'team_choice'
        response = await sio.handlers['table:post_game_team_choice']('a', {'transition_id': id, 'team_preference': 'mix_it_up'})
        assert response == {'updated': True}
        response = await sio.handlers['table:post_game_keep_playing']('c', {'transition_id': 'old', 'keep_playing': True})
        assert response['error'] == 'ValueError'
        # End the checks to let the scheduled task exit cleanly.
        s.now[0] = 100
        await sio.handlers['table:post_game_keep_playing']('c', {'transition_id': id, 'keep_playing': True})
        s.now[0] = 200
        await sio.handlers['table:post_game_keep_playing']('b', {'transition_id': id, 'keep_playing': True})
        await asyncio.sleep(0)
    asyncio.run(run())


def test_deadlines_advance_and_broadcast_without_client_commands():
    async def run():
        from time import time
        s = setup(window=0.01, clock=lambda: time() * 1000)
        sio = socket(s)
        await sio.handlers['table:end_game']('a', {})
        for _ in range(50):
            if sio.views and sio.views[-1]['post_game_transition']['phase'] == 'seating_ready':
                break
            await asyncio.sleep(0.01)
        assert sio.views[-1]['post_game_transition']['phase'] == 'seating_ready'
        assert sio.views[-1]['seats'] == [None] * 4
        assert any(v['post_game_transition']['phase'] == 'loser_checks' for v in sio.views)
    asyncio.run(run())


def test_rejected_account_replacement_does_not_transfer_offer():
    s = setup()
    close(s)
    with pytest.raises(ValueError, match='account'):
        s.table.replace_member_id('a', 'imposter', 'wrong-account')
    view = s.table.get_post_game_transition_view()
    assert 'a' in view['players'] and 'imposter' not in view['players']
