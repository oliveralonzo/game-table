import pytest
from test_post_game_lifecycle import setup


def test_finished_game_closes_without_player_action_and_starts_checks():
    s = setup()
    s.service.update_finished_game_close('T', reviewing=False)
    assert s.table.finished_game_close['deadline'] == 10
    s.now[0] = 9
    s.service.expire_finished_game_for_table('T')
    assert s.table.active_game_id == 'finished'
    s.now[0] = 10
    s.service.expire_finished_game_for_table('T')
    assert s.table.active_game_id is None
    assert s.table.post_game_transition.snapshot()['phase'] == 'winner_checks'
    assert s.games.removed == ['finished']


def test_review_pauses_auto_close_and_finish_restarts_it_and_unlocks_manual_close():
    s = setup()
    s.service.update_finished_game_close('T', reviewing=False)
    with pytest.raises(ValueError):
        s.service.request_game_end('a')
    s.now[0] = 5
    s.service.update_finished_game_close('T', reviewing=True)
    s.now[0] = 100
    s.service.expire_finished_game_for_table('T')
    assert s.table.active_game_id == 'finished'
    assert s.service.post_game_wait_seconds('T') is None
    s.service.update_finished_game_close('T', reviewing=False)
    assert s.table.finished_game_close['deadline'] == 110
    assert s.table.finished_game_close['reviewed']
    s.service.request_game_end('b')
    assert s.table.active_game_id is None


def test_repeated_sync_does_not_restart_timer_and_completed_review_autocloses():
    s = setup()
    s.service.update_finished_game_close('T', reviewing=False)
    s.now[0] = 9
    s.service.update_finished_game_close('T', reviewing=False)
    assert s.service.post_game_wait_seconds('T') == 1
    s.service.update_finished_game_close('T', reviewing=True)
    s.service.update_finished_game_close('T', reviewing=False)
    s.now[0] = 19
    s.service.expire_finished_game_for_table('T')
    assert s.table.active_game_id is None


def test_server_deadline_closes_game_and_broadcasts_without_clicks():
    import asyncio
    import time
    from socketio import AsyncServer
    from game_table.api.ws.table_ws import register_table_events
    from game_table.api.ws.session_registry import SessionRegistry
    async def run():
        s = setup(clock=lambda: time.time() * 1000)
        sio = AsyncServer(async_mode='asgi')
        events = []
        async def emit(event, data=None, **kwargs): events.append((event, data))
        sio.emit = emit
        register_table_events(sio, s.tables, s.service, SessionRegistry(), None)
        s.service.update_finished_game_close('T', reviewing=False)
        s.table.finished_game_close['deadline'] = time.time() + .02
        sio.schedule_table_deadline('T')
        await asyncio.sleep(.05)
        assert s.table.active_game_id is None
        assert any(event == 'table:updated' and data['active_game_id'] is None for event, data in events)
    asyncio.run(run())
