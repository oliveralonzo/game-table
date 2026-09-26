import asyncio
from dataclasses import replace
from types import SimpleNamespace

import pytest
from socketio import AsyncServer

from game_table.application.group_session_service import GroupSessionService
from game_table.application.group_table_service import GroupTableService
from game_table.application.table_registry import TableRegistry
from game_table.api.ws.group_sessions import GroupSocketSessions
from game_table.api.ws.group_presence_ws import register_group_presence_events
from game_table.api.ws.group_table_ws import register_group_table_events
from game_table.group.group import Group, GroupMembership


class Repository:
    def __init__(self):
        self.reads = 0
        self.group = Group('g', 'Group', 1, (
            GroupMembership('o', 'g', 'owner', 'owner', 1),
            GroupMembership('m', 'g', 'member', 'member', 1),
        ), public_id='public')

    def get_by_id(self, group_id):
        self.reads += 1
        return self.group if group_id == 'g' else None

    def list_for_account(self, account_id):
        self.reads += 1
        return [self.group] if self.group.membership_for(account_id) else []

    def update_defaults(self, group_id, account_id, rules, seat_count, *, authorized=False):
        assert authorized
        self.group = replace(self.group, default_rules=rules, default_seat_count=seat_count)
        return True


def setup():
    repo = Repository()
    groups = GroupSessionService(repo)
    registry = TableRegistry()
    tables = GroupTableService(groups, registry, lambda: 'TEST', sessions=groups)
    return repo, groups, registry, tables


def test_group_table_actions_use_admission_not_database_membership():
    repo, groups, _, tables = setup()
    groups.admit('member', 'g', 'socket:s')
    tables.create_table('member', 'g')
    tables.join_table('m', 'TEST', 'Member', account_id='member')
    tables.join_table('guest', 'TEST', 'Guest', account_id='outsider')
    reads = repo.reads
    # Changing stored membership has no effect until explicit revocation or exit.
    repo.group = replace(repo.group, memberships=repo.group.memberships[:1])
    for _ in range(10):
        tables.assign_seat('m', 0)
        tables.unassign_seat('m', 0)
        tables.remove_seat('m')
        tables.add_seat('m')
        tables.update_rules('m', {})
        tables.list_tables('member', 'g')
        assert tables.get_table_view('TEST')['group_member_ids'] == ['m']
    assert repo.reads == reads
    with pytest.raises(PermissionError):
        tables.remove_seat('guest')
    groups.revoke('member', 'g')
    with pytest.raises(PermissionError):
        tables.remove_seat('m')
    assert tables.get_table_view('TEST')['group_member_ids'] == []
    assert repo.reads == reads


def test_table_lease_survives_socket_exit_then_fresh_entry_rechecks():
    repo, groups, _, tables = setup()
    groups.admit('member', 'g', 'socket:s')
    tables.create_table('member', 'g')
    tables.join_table('m', 'TEST', 'Member', account_id='member')
    groups.release('socket:s')
    repo.group = replace(repo.group, memberships=repo.group.memberships[:1])
    tables.remove_seat('m')
    tables.leave_table('m')
    with pytest.raises(PermissionError):
        groups.get_group('member', 'g')
    reads = repo.reads
    groups.admit('member', 'g', 'socket:new')
    assert repo.reads == reads + 1
    with pytest.raises(PermissionError):
        groups.get_group('member', 'g')


def test_guest_role_is_fixed_for_presence_and_failed_join_releases_lease():
    repo, groups, _, tables = setup()
    groups.admit('owner', 'g', 'socket:o')
    tables.create_table('owner', 'g')
    tables.join_table('guest', 'TEST', 'Guest', account_id='outsider')
    repo.group = replace(repo.group, memberships=repo.group.memberships + (
        GroupMembership('new', 'g', 'outsider', 'member', 1),))
    assert not groups.is_member('outsider', 'g')
    with pytest.raises(ValueError):
        tables.join_table('bad', 'TEST', '', account_id='member')
    assert ('member', 'g') not in groups._leases
    tables.leave_table('guest')
    groups.admit('outsider', 'g', 'socket:new')
    assert groups.is_member('outsider', 'g')


def test_group_defaults_use_admitted_role_and_update_live_snapshots():
    repo, groups, _, _ = setup()
    groups.admit('owner', 'g', 'socket:o')
    groups.admit('member', 'g', 'socket:m')
    reads = repo.reads
    with pytest.raises(PermissionError):
        groups.update_defaults('member', 'g', {}, 2)
    groups.update_defaults('owner', 'g', {'target': 100}, 2)
    assert groups.get_group('member', 'g').default_seat_count == 2
    assert repo.reads == reads


class Accounts:
    def __init__(self): self.reads = 0
    def find_by_auth_identity(self, provider, subject):
        self.reads += 1
        return SimpleNamespace(id=subject)


class Auth:
    def verify_token(self, token):
        if token not in ('member', 'owner', 'outsider'):
            raise ValueError('Invalid token')
        return SimpleNamespace(provider='test', subject=token)


def test_socket_list_admission_presence_and_table_refresh_have_no_repeat_db_auth():
    async def run():
        repo, groups, registry, tables = setup()
        sio = AsyncServer(async_mode='asgi')
        sio.manager.is_connected = lambda sid, namespace: True
        events, entered, disconnected = [], [], []
        async def emit(event, data=None, **kwargs): events.append((event, data, kwargs))
        async def enter_room(sid, room): entered.append((sid, room))
        async def leave_room(sid, room): pass
        async def disconnect(sid): disconnected.append(sid)
        sio.emit, sio.enter_room, sio.leave_room = emit, enter_room, leave_room
        sio.on('disconnect', disconnect)
        sio.manager.is_connected = lambda sid, namespace: True
        accounts = Accounts()
        sockets = GroupSocketSessions(sio, accounts, groups, Auth())
        register_group_presence_events(sio, accounts, groups, Auth(), registry, sessions=sockets)
        register_group_table_events(sio, accounts, tables, Auth(), sessions=sockets)
        payload = {'token': 'member', 'group_id': 'g'}
        await sockets.list_groups('s', payload)
        assert repo.reads == accounts.reads == 1
        await sockets.enter('s', payload)
        tables.create_table('member', 'g')
        for _ in range(10):
            result = await sio.handlers['/']['group:presence']('s', payload)
            assert result['active_members'] == [{'account_id': 'member', 'table_code': None}]
            result = await sio.handlers['/']['group:tables']('s', payload)
            assert len(result['tables']) == 1
        assert repo.reads == accounts.reads == 1
        assert ('s', 'group:g') in entered
        await sockets.leave('s', 'g')
        assert not groups.is_member('member', 'g')
        await sockets.enter('s', payload)
        assert repo.reads == 2
        await sio.handlers['/']['disconnect']('s')
        assert disconnected == ['s']
        assert not groups.is_member('member', 'g')
    asyncio.run(run())


def test_socket_account_switch_drops_previous_authorization():
    async def run():
        repo, groups, _, _ = setup()
        sio = AsyncServer(async_mode='asgi')
        sio.manager.is_connected = lambda sid, namespace: True
        async def room(*args): pass
        sio.enter_room = sio.leave_room = room
        sockets = GroupSocketSessions(sio, Accounts(), groups, Auth())
        await sockets.enter('s', {'token': 'member', 'group_id': 'g'})
        with pytest.raises(ValueError):
            await sockets.enter('s', {'token': 'invalid', 'group_id': 'g'})
        with pytest.raises(PermissionError):
            await sockets.enter('s', {'token': 'outsider', 'group_id': 'g'})
        assert not groups.is_member('member', 'g')
        assert not groups.is_member('outsider', 'g')
    asyncio.run(run())


def test_revocation_blocks_reentry_and_notifies_only_affected_socket():
    async def run():
        _, groups, _, _ = setup()
        sio = AsyncServer(async_mode='asgi')
        sio.manager.is_connected = lambda sid, namespace: True
        events = []
        async def room(*args): pass
        async def emit(event, data, **kwargs): events.append((event, data, kwargs))
        sio.enter_room = sio.leave_room = room
        sio.emit = emit
        sockets = GroupSocketSessions(sio, Accounts(), groups, Auth())
        await sockets.enter('s', {'token': 'member', 'group_id': 'g'})
        await sockets.enter('other', {'token': 'owner', 'group_id': 'g'})
        await sockets.revoke('member', 'g')
        with pytest.raises(PermissionError):
            await sockets.enter('s', {'token': 'member', 'group_id': 'g'})
        assert groups.is_member('owner', 'g')
        assert events == [('group:access_revoked', {'group_id': 'g'}, {'room': 's'})]
    asyncio.run(run())


@pytest.mark.parametrize('exit_action', ['disconnect', 'leave'])
def test_inflight_admission_cannot_resurrect_departed_presence(exit_action):
    from threading import Event
    async def run():
        repo, groups, _, _ = setup()
        sio = AsyncServer(async_mode='asgi')
        sio.manager.is_connected = lambda sid, namespace: True
        async def room(*args): pass
        sio.enter_room = sio.leave_room = room
        sockets = GroupSocketSessions(sio, Accounts(), groups, Auth())
        started, finish = Event(), Event()
        original = repo.get_by_id
        def delayed(group_id):
            started.set()
            assert finish.wait(5)
            return original(group_id)
        repo.get_by_id = delayed
        pending = asyncio.create_task(sockets.enter('s', {'token': 'member', 'group_id': 'g'}))
        assert await asyncio.to_thread(started.wait, 5)
        if exit_action == 'disconnect':
            await sio.handlers['/']['disconnect']('s')
        else:
            await sockets.leave('s', 'g')
        finish.set()
        with pytest.raises(PermissionError):
            await pending
        assert not groups.is_member('member', 'g')
        assert 'g' not in sockets.rooms.get('s', set())
    asyncio.run(run())


def test_socket_seat_changes_are_database_free_and_notify_only_group_room():
    from game_table.application.table_service import TableService
    from game_table.application.table_service_router import TableServiceRouter
    from game_table.api.ws.session_registry import SessionRegistry
    from game_table.api.ws.table_ws import register_table_events
    async def run():
        repo, groups, registry, tables = setup()
        sio = AsyncServer(async_mode='asgi')
        sio.manager.is_connected = lambda sid, namespace: True
        events = []
        async def room(*args): pass
        async def emit(event, data=None, **kwargs): events.append((event, data, kwargs))
        sio.enter_room = sio.leave_room = room
        sio.emit = emit
        router = TableServiceRouter(TableService(registry=registry), tables, registry)
        sessions = SessionRegistry()
        register_table_events(sio, router, None, sessions, None)
        sockets = GroupSocketSessions(sio, Accounts(), groups, Auth())
        await sockets.list_groups('s', {'token': 'member'})
        await sockets.enter('s', {'token': 'member', 'group_id': 'g'})
        tables.create_table('member', 'g')
        sessions.bind_connection('s', 'browser')
        member = sessions.get_or_create_member_id('s')
        tables.join_table(member, 'TEST', 'Member', account_id='member')
        reads = repo.reads
        for event, data in [('table:assign_seat', {'seat_index': 0}),
                            ('table:unassign_seat', {'seat_index': 0}),
                            ('table:remove_seat', {}), ('table:add_seat', {})]:
            response = await sio.handlers['/'][event]('s', data)
            assert 'error' not in response
        assert repo.reads == reads
        notices = [event for event in events if event[0] == 'group:tables_changed']
        assert len(notices) == 4
        assert all(data == {'group_id': 'g'} and kwargs == {'room': 'group:g'}
                   for _, data, kwargs in notices)
    asyncio.run(run())


def test_shared_chat_transport_separates_group_and_table_and_uses_server_identity():
    from game_table.application.activity_service import ActivityService
    from game_table.application.table_service import TableService
    from game_table.application.table_service_router import TableServiceRouter
    from game_table.api.ws.activity_ws import register_activity_events
    from game_table.api.ws.session_registry import SessionRegistry
    async def run():
        repo, groups, registry, tables = setup()
        sio = AsyncServer(async_mode='asgi')
        sio.manager.is_connected = lambda sid, namespace: True
        events = []
        async def room(*args): pass
        async def emit(event, data=None, **kwargs): events.append((event, data, kwargs))
        sio.enter_room = sio.leave_room = room
        sio.emit = emit
        sockets = GroupSocketSessions(sio, Accounts(), groups, Auth())
        registry_sessions = SessionRegistry()
        router = TableServiceRouter(TableService(registry=registry), tables, registry)
        register_activity_events(sio, router, ActivityService(), registry_sessions, group_sessions=sockets)
        handler = sio.handlers['/']['activity:chat_message']
        payload = {'text': '  Hello  ', 'client_message_id': 'message', 'sender_id': 'forged', 'group_id': 'g'}
        assert 'error' in await handler('s', payload)
        assert events == []
        await sockets.enter('s', {'token': 'member', 'group_id': 'g'})
        tables.create_table('member', 'g')
        registry_sessions.bind_connection('s', 'browser')
        member = registry_sessions.get_or_create_member_id('s')
        tables.join_table(member, 'TEST', 'Member', account_id='member')
        reads = repo.reads
        assert (await handler('s', payload))['ok']
        event, message, destination = events[-1]
        assert event == 'activity:chat_message'
        assert message['sender_id'] == 'member'
        assert message['text'] == 'Hello'
        assert message['group_id'] == 'g'
        assert 'table_code' not in message
        assert destination == {'room': 'group:g'}
        assert (await handler('s', {k: v for k, v in payload.items() if k != 'group_id'}))['ok']
        _, message, destination = events[-1]
        assert message['sender_id'] == member
        assert message['table_code'] == 'TEST'
        assert 'group_id' not in message
        assert destination == {'room': 'TEST'}
        for invalid in [dict(payload, text=' '), dict(payload, text='x' * 10000),
                        dict(payload, group_id='other')]:
            assert 'error' in await handler('s', invalid)
        assert len(events) == 2
        await sockets.leave('s', 'g')
        assert 'error' in await handler('s', payload)
        # Table membership survives lobby exit, but cannot authorize group chat.
        assert groups.is_member('member', 'g')
        assert repo.reads == reads
    asyncio.run(run())


def test_group_chat_denies_guests_and_revoked_members():
    from game_table.application.activity_service import ActivityService
    from game_table.api.ws.activity_ws import register_activity_events
    async def run():
        _, groups, _, _ = setup()
        sio = AsyncServer(async_mode='asgi')
        sio.manager.is_connected = lambda sid, namespace: True
        async def room(*args): pass
        async def emit(*args, **kwargs): pass
        sio.enter_room = sio.leave_room = room
        sio.emit = emit
        sockets = GroupSocketSessions(sio, Accounts(), groups, Auth())
        register_activity_events(sio, None, ActivityService(), None, group_sessions=sockets)
        with pytest.raises(PermissionError):
            await sockets.enter('guest', {'token': 'outsider', 'group_id': 'g'})
        send = sio.handlers['/']['activity:chat_message']
        payload = {'group_id': 'g', 'text': 'hello', 'client_message_id': 'id'}
        assert 'error' in await send('guest', payload)
        await sockets.enter('member', {'token': 'member', 'group_id': 'g'})
        await sockets.revoke('member', 'g')
        assert 'error' in await send('member', payload)
    asyncio.run(run())
