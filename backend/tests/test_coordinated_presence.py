import asyncio
from types import SimpleNamespace

import pytest
from socketio import AsyncServer

from game_table.api.ws.group_sessions import GroupSocketSessions
from game_table.api.ws.session_registry import SessionRegistry
from game_table.api.ws.table_ws import register_table_events
from game_table.application.table_service import TableService
from game_table.application.table_service_router import TableServiceRouter
from test_group_sessions import setup, Accounts, Auth


def system():
    repo, groups, registry, group_tables = setup()
    sessions = SessionRegistry()
    tables = TableServiceRouter(TableService(registry=registry), group_tables, registry)
    sio = AsyncServer(async_mode='asgi')
    connected, rooms, events = set(), set(), []
    sio.manager.is_connected = lambda sid, namespace: sid in connected
    async def enter(sid, room): rooms.add((sid, room))
    async def leave(sid, room): rooms.discard((sid, room))
    async def emit(event, data=None, **kwargs): events.append((event, data, kwargs))
    sio.enter_room, sio.leave_room, sio.emit = enter, leave, emit
    register_table_events(sio, tables, None, sessions, None)
    sockets = GroupSocketSessions(sio, Accounts(), groups, Auth(), session_registry=sessions, tables=tables)
    async def connect(sid, client):
        connected.add(sid)
        await sio.handlers['/']['connect'](sid, {}, {'client_session_id': client})
    async def disconnect(sid):
        connected.discard(sid)
        await sio.handlers['/']['disconnect'](sid)
    async def join(sid, account='member'):
        member = sessions.get_or_create_member_id(sid)
        tables.join_table(member, 'TEST', account, account_id=account)
        await sessions.table_entered(sid, tables.get_table('TEST'), member)
        return member
    return SimpleNamespace(**locals())


def test_member_keeps_both_presences_then_leaves_table_without_leaving_group():
    async def run():
        s = system()
        await s.connect('s', 'browser')
        await s.sockets.enter('s', {'token': 'member', 'group_id': 'g'})
        s.group_tables.create_table('member', 'g')
        reads = s.repo.reads
        await s.join('s')
        assert s.sockets.presence_snapshot('g')['active_members'] == [{'account_id': 'member', 'table_code': 'TEST'}]
        assert s.sockets.chat_sender('s', 'g') == 'member'
        await s.sio.handlers['/']['table:leave']('s')
        assert not s.tables.table_exists('TEST')
        assert s.sessions.group_presences == {'browser': ('member', 'g')}
        assert s.sockets.presence_snapshot('g')['active_members'] == [{'account_id': 'member', 'table_code': None}]
        assert ('s', 'group:g') in s.rooms
        assert s.repo.reads == reads
    asyncio.run(run())


def test_leaving_group_leaves_table_and_closes_last_participant():
    async def run():
        s = system()
        await s.connect('s', 'browser')
        await s.sockets.enter('s', {'token': 'member', 'group_id': 'g'})
        s.group_tables.create_table('member', 'g')
        await s.join('s')
        reads = s.repo.reads
        await s.sockets.leave('s', 'g')
        assert s.sessions.group_presences == {}
        assert s.sessions.get_member_id('s') is None
        assert not s.tables.table_exists('TEST')
        assert ('s', 'group:g') not in s.rooms
        assert s.repo.reads == reads
    asyncio.run(run())


def test_link_member_gets_group_presence_but_guest_gets_only_table_presence():
    async def run():
        s = system()
        s.groups.admit('owner', 'g', 'creator')
        s.group_tables.create_table('owner', 'g')
        await s.connect('m', 'member-browser')
        await s.join('m')
        await s.connect('guest', 'guest-browser')
        guest = await s.join('guest', 'outsider')
        assert s.sessions.group_presences == {'member-browser': ('member', 'g')}
        assert s.tables.get_table_code_for_member(guest) == 'TEST'
        assert ('guest', 'group:g') not in s.rooms
        with pytest.raises(PermissionError): s.sockets.chat_sender('guest', 'g')
        await s.sockets.leave('m', 'g')
        assert s.tables.table_exists('TEST')
        assert s.sockets.presence_snapshot('g')['active_members'] == []
        await s.sio.handlers['/']['table:leave']('guest')
        assert not s.tables.table_exists('TEST')
    asyncio.run(run())


@pytest.mark.parametrize('in_table', [False, True])
@pytest.mark.parametrize('reconnect', [False, True])
def test_same_disconnect_grace_cleans_or_restores_both_presences(monkeypatch, in_table, reconnect):
    async def run():
        s = system()
        await s.connect('old', 'browser')
        await s.sockets.enter('old', {'token': 'member', 'group_id': 'g'})
        if in_table:
            s.group_tables.create_table('member', 'g')
            await s.join('old')
        reads = s.repo.reads
        grace = asyncio.Event()
        durations = []
        real_sleep = asyncio.sleep
        async def wait(seconds):
            durations.append(seconds)
            await grace.wait()
        monkeypatch.setattr('game_table.api.ws.table_ws.asyncio.sleep', wait)
        await s.disconnect('old')
        await real_sleep(0)
        assert durations == [600]
        # Presence survives exactly as long as its seat, not a separate 90s TTL.
        assert s.sessions.group_presences == {'browser': ('member', 'g')}
        if reconnect:
            await s.connect('new', 'browser')
        grace.set()
        await real_sleep(0)
        await real_sleep(0)
        assert bool(s.sessions.group_presences) == reconnect
        if in_table:
            assert s.tables.table_exists('TEST') == reconnect
        if reconnect:
            assert ('new', 'group:g') in s.rooms
            assert s.sockets.chat_sender('new', 'g') == 'member'
        assert s.repo.reads == reads
    asyncio.run(run())


def test_private_table_has_no_group_presence():
    async def run():
        s = system()
        await s.connect('s', 'browser')
        await s.sockets.enter('s', {'token': 'member', 'group_id': 'g'})
        member = s.sessions.get_or_create_member_id('s')
        s.tables.create_table(member, 'PRIVATE', 'Member', account_id='member')
        await s.sessions.table_entered('s', s.tables.get_table('PRIVATE'), member)
        assert s.sessions.group_presences == {}
        assert ('s', 'group:g') not in s.rooms
        assert s.tables.get_table_code_for_member(member) == 'PRIVATE'
    asyncio.run(run())


@pytest.mark.parametrize('in_table', [False, True])
def test_intentional_page_exit_uses_shared_short_grace(monkeypatch, in_table):
    async def run():
        s = system()
        await s.connect('s', 'browser')
        await s.sockets.enter('s', {'token': 'member', 'group_id': 'g'})
        if in_table:
            s.group_tables.create_table('member', 'g')
            await s.join('s')
        grace, durations = asyncio.Event(), []
        real_sleep = asyncio.sleep
        async def wait(seconds):
            durations.append(seconds)
            await grace.wait()
        monkeypatch.setattr('game_table.api.ws.table_ws.asyncio.sleep', wait)
        await s.sio.handlers['/']['table:prepare_unload']('s')
        await s.disconnect('s')
        await real_sleep(0)
        assert durations == [3]
        grace.set()
        await real_sleep(0)
        await real_sleep(0)
        assert s.sessions.group_presences == {}
        assert not s.tables.table_exists('TEST')
    asyncio.run(run())


def test_leaving_during_admission_cannot_recreate_group_presence():
    from threading import Event
    async def run():
        s = system()
        await s.connect('s', 'browser')
        started, finish = Event(), Event()
        original = s.repo.get_by_id
        def delayed(group):
            started.set()
            assert finish.wait(5)
            return original(group)
        s.repo.get_by_id = delayed
        pending = asyncio.create_task(s.sockets.enter('s', {'token': 'member', 'group_id': 'g'}))
        assert await asyncio.to_thread(started.wait, 5)
        await s.sockets.leave('s', None)
        finish.set()
        with pytest.raises(PermissionError): await pending
        assert s.sessions.group_presences == {}
        assert ('s', 'group:g') not in s.rooms
        assert not s.groups.is_member('member', 'g')
    asyncio.run(run())


@pytest.mark.parametrize('in_table', [False, True])
def test_page_exit_beacon_cleans_both_presences(monkeypatch, in_table):
    import json
    from game_table.api.presence import GameTableHttpApp
    async def run():
        s = system()
        await s.connect('s', 'browser')
        await s.sockets.enter('s', {'token': 'member', 'group_id': 'g'})
        if in_table:
            s.group_tables.create_table('member', 'g')
            await s.join('s')
        grace = asyncio.Event()
        async def wait(_): await grace.wait()
        real_sleep = asyncio.sleep
        monkeypatch.setattr('game_table.api.presence.asyncio.sleep', wait)
        await s.disconnect('s')
        app = GameTableHttpApp(s.sio, s.tables, s.sessions, None)
        response = []
        async def receive():
            return {'type': 'http.request', 'body': json.dumps({'client_session_id': 'browser'}).encode()}
        async def send(message): response.append(message)
        request = asyncio.create_task(app._leave(receive, send))
        await real_sleep(0)
        grace.set()
        await request
        assert response[0]['status'] == 204
        assert s.sessions.group_presences == {}
        assert not s.tables.table_exists('TEST')
    asyncio.run(run())


def test_cleanup_expires_group_even_if_table_membership_was_already_removed(monkeypatch):
    async def run():
        s = system()
        await s.connect('s', 'browser')
        await s.sockets.enter('s', {'token': 'member', 'group_id': 'g'})
        s.group_tables.create_table('member', 'g')
        member = await s.join('s')
        grace = asyncio.Event()
        real_sleep = asyncio.sleep
        async def wait(_): await grace.wait()
        monkeypatch.setattr('game_table.api.ws.table_ws.asyncio.sleep', wait)
        await s.disconnect('s')
        await real_sleep(0)
        s.tables.leave_table(member)
        s.sessions.remove_member_sessions(member)
        grace.set()
        await real_sleep(0)
        assert s.sessions.group_presences == {}
    asyncio.run(run())
