import asyncio
from threading import Event
from types import SimpleNamespace

from game_table.api.ws.group_presence_ws import GroupPresence, register_group_presence_events


def test_presence_deduplicates_tabs_and_excludes_other_groups():
    presence = GroupPresence(lambda sid: True, lambda: 0)
    presence.touch('one', 'g', 'a')
    presence.touch('two', 'g', 'a')
    presence.touch('three', 'other', 'b')
    assert presence.active('g') == {'a'}
    presence.leave('one', 'g')
    assert presence.active('g') == {'a'}
    presence.leave('two', 'g')
    assert presence.active('g') == set()


def test_disconnection_and_expiration_remove_stale_activity():
    connected = {'one', 'two'}
    now = [0]
    presence = GroupPresence(lambda sid: sid in connected, lambda: now[0])
    presence.touch('one', 'g', 'a')
    presence.touch('two', 'g', 'b')
    connected.remove('one')
    assert presence.active('g') == {'b'}
    now[0] = 90
    assert presence.active('g') == set()
    assert not presence.entries


class Server:
    def __init__(self):
        self.handlers = {}
        self.manager = SimpleNamespace(is_connected=lambda *args: True)
    def on(self, event):
        def register(fn):
            self.handlers[event] = fn
        return register


class Auth:
    def verify_token(self, token):
        if token != 'valid':
            raise ValueError('Invalid token.')
        return SimpleNamespace(provider='verified', subject='member')


class Accounts:
    def find_by_auth_identity(self, provider, subject):
        assert (provider, subject) == ('verified', 'member')
        return SimpleNamespace(id='member')


class Groups:
    def list_members(self, account, group):
        if (account, group) != ('member', 'g'):
            raise PermissionError('Not a member.')
        return [SimpleNamespace(account_id='member')]


def server(groups=None):
    sio = Server()
    registry = SimpleNamespace(for_group=lambda group: [SimpleNamespace(
        table_code='TEST-1234', members={'m': SimpleNamespace(account_id='member')})])
    register_group_presence_events(sio, Accounts(), groups or Groups(), Auth(), registry)
    return sio


def test_socket_verifies_identity_and_reports_server_table_location():
    sio = server()
    response = asyncio.run(sio.handlers['group:presence']('sid', {
        'token': 'valid', 'group_id': 'g', 'account_id': 'spoofed', 'table_code': 'spoofed'}))
    assert response == {'group_id': 'g', 'active_members': [{'account_id': 'member', 'table_code': 'TEST-1234'}]}
    for payload in [{}, {'token': 'invalid', 'group_id': 'g'}, {'token': 'valid', 'group_id': 'other'}]:
        assert 'error' in asyncio.run(sio.handlers['group:presence']('sid', payload))


def test_leave_during_authorization_does_not_restore_presence():
    started, release = Event(), Event()
    class SlowGroups(Groups):
        def list_members(self, *args):
            started.set()
            assert release.wait(2)
            return super().list_members(*args)
    sio = server(SlowGroups())
    async def exercise():
        request = asyncio.create_task(sio.handlers['group:presence']('sid', {'token':'valid', 'group_id':'g'}))
        assert await asyncio.to_thread(started.wait, 2)
        await sio.handlers['group:presence_leave']('sid', {'group_id':'g'})
        release.set()
        assert (await request)['active_members'] == []
    asyncio.run(exercise())


def test_database_free_configuration_is_safe():
    sio = Server()
    register_group_presence_events(sio, None, None, None, None)
    assert 'error' in asyncio.run(sio.handlers['group:presence']('sid', {}))
