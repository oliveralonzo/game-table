import asyncio
from types import SimpleNamespace

import pytest

from game_table.application.group_table_service import GroupTableService
from game_table.application.table_registry import TableRegistry
from game_table.application.table_service import TableService
from game_table.application.table_service_router import TableServiceRouter
from game_table.api.ws.session_registry import SessionRegistry
from game_table.api.ws.table_ws import leave_member_and_broadcast, register_table_events


class Groups:
    def get_group(self, account_id, group_id):
        if account_id != 'member-account':
            raise PermissionError('Not a member.')
        return SimpleNamespace(id=group_id, public_id='a12bc345')

    def is_member(self, account_id, group_id):
        return account_id == 'member-account'


@pytest.fixture
def services():
    registry = TableRegistry()
    private = TableService(registry=registry)
    groups = GroupTableService(Groups(), registry, lambda: 'BABA-1234')
    groups.create_table('member-account', 'g')
    router = TableServiceRouter(private, groups, registry)
    return router, groups, private, registry


def test_empty_table_survives_until_used_then_last_departure_closes(services):
    router, groups, private, registry = services
    router.cleanup_idle_tables()
    assert router.table_exists('BABA-1234')
    assert router.list_tables() == []
    router.join_table('m', 'BABA-1234', 'Member', account_id='member-account')
    router.join_table('guest', 'BABA-1234', 'Guest')
    assert router.get_table_view('BABA-1234')['group_id'] == 'g'
    assert router.get_table_view('BABA-1234')['group_public_id'] == 'a12bc345'
    assert router.get_table_view('BABA-1234')['host_id'] is None
    assert router.get_table_view('BABA-1234')['group_member_ids'] == ['m']
    with pytest.raises(PermissionError):
        router.delete_table('m', 'BABA-1234')
    router.leave_table('m')
    assert router.table_exists('BABA-1234')
    router.leave_table('guest')
    assert not router.table_exists('BABA-1234')
    assert groups.list_tables('member-account', 'g') == []
    assert registry.member_to_table == {}
    private.create_table('new-host', 'BABA-1234')
    assert private.get_table('BABA-1234').host_id == 'new-host'


def test_close_permission_is_rechecked_after_another_person_joins(services):
    router, _, _, registry = services
    router.join_table('first', 'BABA-1234', 'First')
    router.join_table('second', 'BABA-1234', 'Second')
    with pytest.raises(PermissionError):
        router.delete_table('first', 'BABA-1234')
    assert len(registry.group_tables['BABA-1234'].members) == 2
    router.leave_table('second')
    router.delete_table('first', 'BABA-1234')
    assert not router.table_exists('BABA-1234')


def test_one_session_cannot_join_a_private_and_group_table(services):
    router, _, private, _ = services
    private.create_table('host', 'PRIVATE')
    with pytest.raises(ValueError, match='already belongs'):
        router.join_table('host', 'BABA-1234', 'Host')
    router.join_table('group-member', 'BABA-1234', 'Member')
    with pytest.raises(ValueError, match='already belongs'):
        private.create_table('group-member', 'NEW')
    with pytest.raises(ValueError):
        router.delete_table('host', 'BABA-1234')
    router.delete_table('host', 'PRIVATE')
    assert router.table_exists('BABA-1234')


def test_account_replacement_preserves_seat_and_does_not_close_table(services):
    router, _, _, registry = services
    router.join_table('old', 'BABA-1234', 'Name', account_id='member-account')
    router.assign_seat('old', 0)
    assert router.join_table('new', 'BABA-1234', 'Name', account_id='member-account') == 'old'
    assert router.get_table_view('BABA-1234')['seats'][0] == 'new'
    with pytest.raises(ValueError):
        router.leave_table('old')
    assert registry.member_to_table == {'new': 'BABA-1234'}


def test_group_members_can_unseat_others_but_guests_only_themselves(services):
    router, _, _, _ = services
    router.join_table('m', 'BABA-1234', 'Member', account_id='member-account')
    router.join_table('guest', 'BABA-1234', 'Guest')
    router.assign_seat('m', 0)
    router.assign_seat('guest', 1)
    with pytest.raises(PermissionError):
        router.unassign_seat('guest', 0)
    router.unassign_seat('m', 1)
    assert router.get_table_view('BABA-1234')['seats'][1] is None
    router.assign_seat('guest', 1)
    router.unassign_seat('guest', 1)
    router.remove_seat('m')
    with pytest.raises(PermissionError):
        router.remove_seat('guest')


class Server:
    def __init__(self):
        self.events = []
        self.handlers = {}
    async def enter_room(self, *args):
        pass
    async def leave_room(self, *args):
        pass
    async def emit(self, event, payload=None, **kwargs):
        self.events.append((event, payload))
    def on(self, event):
        def register(handler):
            self.handlers[event] = handler
            return handler
        return register
    def event(self, handler):
        self.handlers[handler.__name__] = handler
        return handler


def test_canonical_leave_cleans_sessions_and_emits_table_deleted(services):
    router, _, _, registry = services
    sessions = SessionRegistry()
    sessions.bind_connection('socket', 'browser')
    member = sessions.get_or_create_member_id('socket')
    router.join_table(member, 'BABA-1234', 'Guest')
    sio = Server()
    asyncio.run(leave_member_and_broadcast(sio, router, sessions, None, member))
    assert not router.table_exists('BABA-1234')
    assert sessions.get_member_id_for_client_session('browser') is None
    assert ('table:deleted', {'table_code': 'BABA-1234'}) in sio.events
    assert ('table:list_updated', {'tables': []}) in sio.events


@pytest.mark.parametrize("reconnect", [False, True])
def test_existing_disconnect_grace_and_reconnect_protect_group_table(services, monkeypatch, reconnect):
    router, _, _, _ = services
    sessions = SessionRegistry()
    server = Server()
    register_table_events(server, router, None, sessions, None, None, None)
    original_sleep = asyncio.sleep
    async def run(reconnect):
        sessions.bind_connection('s', 'browser')
        member = sessions.get_or_create_member_id('s')
        router.join_table(member, 'BABA-1234', 'Guest')
        ready = asyncio.Event()
        async def grace(_):
            await ready.wait()
        monkeypatch.setattr('game_table.api.ws.table_ws.asyncio.sleep', grace)
        await server.handlers['disconnect']('s')
        assert router.table_exists('BABA-1234')
        if reconnect:
            sessions.bind_connection('new-s', 'browser')
        ready.set()
        await original_sleep(0)
        await original_sleep(0)
        assert router.table_exists('BABA-1234') == reconnect
    asyncio.run(run(reconnect))
    # Clean up the connected session using the same canonical path.
    member = sessions.get_member_id_for_client_session('browser')
    if member:
        router.leave_table(member)


def test_existing_table_socket_flow_joins_restores_and_closes_group_table(services):
    router, _, _, _ = services
    sessions = SessionRegistry()
    sessions.bind_connection('s', 'browser')
    server = Server()
    register_table_events(server, router, None, sessions, None, None, None)
    async def run():
        lookup = await server.handlers['table:lookup']('s', {'table_code': 'BABA-1234'})
        assert lookup['exists'] is True
        joined = await server.handlers['table:join']('s', {'table_code': 'BABA-1234', 'name': 'Guest'})
        assert 'error' not in joined
        restored = await server.handlers['table:membership']('s', {'table_code': 'BABA-1234'})
        assert restored['member'] is True
        assert restored['table']['group_id'] == 'g'
        assert restored['table']['members'][joined['member_id']]['name'] == 'Guest'
        closed = await server.handlers['table:delete']('s', {'table_code': 'BABA-1234'})
        assert closed == {'table_code': 'BABA-1234', 'deleted': True}
        assert not router.table_exists('BABA-1234')
        assert sessions.get_member_id_for_client_session('browser') is None
    asyncio.run(run())
