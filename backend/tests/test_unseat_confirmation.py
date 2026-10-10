import pytest
from game_table.application.table_registry import TableRegistry
from game_table.application.group_table_service import GroupTableService
from test_spectator_unseat import Groups


def setup():
    registry = TableRegistry()
    service = GroupTableService(Groups(), registry, lambda: 'TEST-1234')
    service.create_table('member', 'g')
    for id in ('actor', 'target', 'other'):
        service.join_table(id, 'TEST-1234', id, account_id='member' if id == 'actor' else None)
    service.assign_seat('actor', 0)
    service.assign_seat('target', 1)
    return service, service.get_table('TEST-1234')


def test_stay_protects_player_until_cooldown_expires():
    service, table = setup()
    table.request_unseat(1, 100)
    confirmation = table.unseat_confirmations['target']
    table.respond_unseat('target', confirmation['id'], False, 110)
    assert table.get_seat_occupant(1) == 'target'
    assert table.unseat_cooldowns == {'target': 170}
    with pytest.raises(ValueError):
        table.request_unseat(1, 169)
    table.expire_unseat(170)
    table.request_unseat(1, 170)
    assert table.unseat_confirmations['target']['deadline'] == 200


@pytest.mark.parametrize('timeout', [True, False])
def test_yes_or_silence_removes_target_and_blocks_active_game(timeout):
    _, table = setup()
    table.attach_game('game')
    table.request_unseat(1, 100)
    id = table.unseat_confirmations['target']['id']
    if timeout:
        table.expire_unseat(130)
    else:
        table.respond_unseat('target', id, True, 110)
    assert table.get_seat_occupant(1) is None
    assert not table.unseat_confirmations
    assert table.state.value == 'game_blocked'


def test_repeat_request_does_not_extend_timer_and_other_player_cannot_answer():
    _, table = setup()
    table.request_unseat(1, 100)
    original = dict(table.unseat_confirmations['target'])
    table.request_unseat(1, 120)
    assert table.unseat_confirmations['target'] == original
    with pytest.raises(ValueError):
        table.respond_unseat('other', original['id'], True, 120)
    with pytest.raises(ValueError):
        table.respond_unseat('target', original['id'], 'yes', 120)


def test_departure_and_replacement_cannot_remove_new_occupant():
    service, table = setup()
    table.request_unseat(1, 100)
    service.unassign_seat('target', 1)
    service.assign_seat('other', 1)
    table.expire_unseat(200)
    assert table.get_seat_occupant(1) == 'other'


def test_reconnect_transfers_pending_confirmation():
    _, table = setup()
    table.request_unseat(1, 100)
    id = table.unseat_confirmations['target']['id']
    table.replace_member_id('target', 'restored', None)
    table.respond_unseat('restored', id, False, 110)
    assert table.unseat_cooldowns['restored'] == 170
    assert 'target' not in table.unseat_confirmations


def test_deadline_wins_over_late_stay_and_self_can_leave_during_cooldown():
    service, table = setup()
    table.request_unseat(1, 100)
    id = table.unseat_confirmations['target']['id']
    with pytest.raises(ValueError):
        table.respond_unseat('target', id, False, 130)
    assert table.get_seat_occupant(1) is None
    service.assign_seat('target', 1)
    table.request_unseat(1, 200)
    table.respond_unseat('target', table.unseat_confirmations['target']['id'], False, 210)
    service.unassign_seat('target', 1)
    assert not table.unseat_cooldowns


@pytest.mark.parametrize('timeout', [False, True])
def test_real_socket_handlers_broadcast_and_remove_after_confirmation_or_deadline(timeout):
    import asyncio
    async def run():
        import asyncio
        import time
        from socketio import AsyncServer
        from game_table.api.ws.table_ws import register_table_events
        from game_table.api.ws.session_registry import SessionRegistry
        service, table = setup()
        sio = AsyncServer(async_mode='asgi')
        events = []
        async def emit(event, data=None, **kwargs):
            events.append((event, data))
        sio.emit = emit
        sessions = SessionRegistry()
        sessions.resolve_member_id = lambda sid: sid
        from game_table.application.table_service_router import TableServiceRouter
        from game_table.application.table_service import TableService
        router = TableServiceRouter(TableService(registry=service._registry), service, service._registry)
        register_table_events(sio, router, None, sessions, None)
        response = await sio.handlers['/']['table:unassign_seat']('actor', {'seat_index': 1})
        assert response.get('unassigned') is False, response
        confirmation = table.unseat_confirmations['target']
        if timeout:
            confirmation['deadline'] = time.time() + .02
            # Repeated requests retain the existing deadline and reschedule it.
            await sio.handlers['/']['table:unassign_seat']('actor', {'seat_index': 1})
            await asyncio.sleep(.05)
        else:
            response = await sio.handlers['/']['table:unseat_response']('other', {'confirmation_id': confirmation['id'], 'yes': True})
            assert 'error' in response
            response = await sio.handlers['/']['table:unseat_response']('target', {'confirmation_id': confirmation['id'], 'yes': True})
            assert response == {'saved': True}
        assert table.get_seat_occupant(1) is None
        assert any(event == 'table:updated' for event, _ in events)
    asyncio.run(run())


def test_requester_name_is_preserved_and_repeat_request_does_not_change_attribution():
    service, table = setup()
    service.unassign_seat('actor', 1)
    confirmation = table.get_unseat_view()['confirmations']['target']
    assert confirmation['requester_name'] == 'actor'
    table.request_unseat(1, confirmation['deadline'] - 1, 'other')
    assert table.get_unseat_view()['confirmations']['target'] == confirmation
    table.respond_unseat('target', confirmation['id'], False, confirmation['deadline'] - 1)
    from game_table.api.ws.errors import error_response
    with pytest.raises(ValueError) as error:
        service.unassign_seat('actor', 1)
    assert error_response(error.value)['code'] == 'UNSEAT_COOLDOWN'
