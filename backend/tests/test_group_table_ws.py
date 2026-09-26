import asyncio
from types import SimpleNamespace

from game_table.api.ws.group_table_ws import register_group_table_events
from game_table.application.group_table_service import GroupTableService
from game_table.application.table_registry import TableRegistry


class Server:
    def __init__(self): self.handlers = {}
    async def emit(self, *args, **kwargs):
        pass
    def on(self, event):
        def register(handler):
            self.handlers[event] = handler
            return handler
        return register


class Auth:
    def verify_token(self, token):
        if token != 'valid': raise ValueError('Invalid token.')
        return SimpleNamespace(provider='clerk', subject='subject')


class Accounts:
    def find_by_auth_identity(self, provider, subject):
        assert (provider, subject) == ('clerk', 'subject')
        return SimpleNamespace(id='verified')


class Groups:
    def get_group(self, account, group):
        assert account == 'verified'
        if group != 'allowed': raise PermissionError('Not a member.')


def test_authenticated_create_and_list_use_server_identity_and_generated_code():
    server = Server()
    registry = TableRegistry()
    service = GroupTableService(Groups(), registry, lambda: 'BABA-1234')
    register_group_table_events(server, Accounts(), service, Auth())
    async def exercise():
        create = server.handlers['group:create_table']
        listing = server.handlers['group:tables']
        assert 'error' in await create('sid', {'token': 'invalid', 'group_id': 'allowed'})
        assert 'error' in await create('sid', {'token': 'valid', 'group_id': 'other'})
        assert registry.group_tables == {}
        result = await create('sid', {'token': 'valid', 'group_id': 'allowed',
                                     'account_id': 'forged', 'table_code': 'FORGED'})
        assert result['table']['table_code'] == 'BABA-1234'
        visible = await listing('sid', {'token': 'valid', 'group_id': 'allowed'})
        assert visible['tables'] == [result['table']]
        assert 'tables' not in await listing('sid', {'token': 'valid', 'group_id': 'other'})
    asyncio.run(exercise())


def test_database_free_configuration_is_disabled():
    server = Server()
    register_group_table_events(server, None, None, None)
    for handler in server.handlers.values():
        assert asyncio.run(handler('sid', {}))['message'] == 'Groups are not configured.'
