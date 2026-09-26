import asyncio
from types import SimpleNamespace

from game_table.api.ws.table_ws import register_table_events
from game_table.api.ws.session_registry import SessionRegistry
from game_table.application.table_service import TableService


class Server:
    def __init__(self): self.handlers = {}
    def on(self, event):
        def register(handler):
            self.handlers[event] = handler
            return handler
        return register
    def event(self, handler):
        self.handlers[handler.__name__] = handler
        return handler
    async def emit(self, *args, **kwargs): pass
    async def enter_room(self, *args, **kwargs): pass


def setup():
    server, tables, sessions = Server(), TableService(), SessionRegistry()
    settings = SimpleNamespace(default_settings=lambda: None)
    register_table_events(server, tables, None, sessions, settings)
    tables.create_table('host', 'TEST-1234', 'Host')
    return server, tables, sessions


def test_saved_preview_is_bound_to_table_lifetime_and_omits_account_ids():
    server, tables, _ = setup()
    table = tables.get_table('TEST-1234')
    tables.join_table('guest', 'TEST-1234', 'Guest', account_id='private-account-id', account_username='guest')
    tables.assign_seat('guest', 0)
    lookup = server.handlers['table:saved_preview']
    payload = dict(table_code='TEST-1234', instance_id=table.instance_id)
    result = asyncio.run(lookup('sid', payload))['table']
    assert result['seats'][0] == 'guest'
    assert result['host_id'] == 'host'
    assert result['members'][1] == dict(member_id='guest', name='Guest', account_username='guest')
    assert asyncio.run(lookup('sid', dict(payload, instance_id='wrong'))) == {'table': None}
    tables.leave_table('guest')
    assert asyncio.run(lookup('sid', payload))['table']['members'] == [dict(member_id='host', name='Host', account_username=None)]
    tables.delete_table('host', 'TEST-1234')
    assert asyncio.run(lookup('sid', payload)) == {'table': None}
    tables.create_table('replacement', 'TEST-1234', 'Replacement')
    assert tables.get_table('TEST-1234').instance_id != table.instance_id
    assert asyncio.run(lookup('sid', payload)) == {'table': None}


def test_saved_join_guard_rejects_reused_code_but_normal_link_join_still_works():
    server, tables, sessions = setup()
    sessions.bind_connection('sid', 'browser')
    join = server.handlers['table:join']
    result = asyncio.run(join('sid', dict(table_code='TEST-1234', name='Guest', instance_id='expired')))
    assert result['code'] == 'TABLE_NOT_FOUND'
    assert len(tables.get_table('TEST-1234').members) == 1
    result = asyncio.run(join('sid', dict(table_code='TEST-1234', name='Guest')))
    assert result['table_code'] == 'TEST-1234'
    assert len(tables.get_table('TEST-1234').members) == 2


def test_create_empty_reserves_host_for_creator_even_if_someone_else_enters_first():
    server, tables, sessions = setup()
    sessions.bind_connection('creator-sid', 'creator-browser')
    result = asyncio.run(server.handlers['table:create_empty']('creator-sid', {}))
    preview = result['table']
    code = preview['table_code']
    assert preview['members'] == []
    assert preview['host_id'] is None
    assert preview['group_id'] is None
    assert preview['instance_id']
    assert 'pending_rules' not in preview
    assert len(tables.get_table('TEST-1234').members) == 1
    assert tables._member_to_table == {'host': 'TEST-1234'}
    assert asyncio.run(server.handlers['table:saved_preview']('creator-sid', {
        'table_code': code, 'instance_id': preview['instance_id'],
    }))['table'] == preview
    tables.join_table('first', code, 'First')
    tables.join_table('second', code, 'Second')
    assert tables.get_table(code).host_id is None
    tables.join_table('creator', code, 'Creator', creator_identity='session:creator-browser')
    assert tables.get_table(code).host_id == 'creator'
    tables.leave_table('creator')
    assert tables.get_table(code).host_id == 'first'
    tables.leave_table('first')
    assert tables.get_table(code).host_id == 'second'
    tables.leave_table('second')
    assert not tables.table_exists(code)


def test_signed_in_creator_keeps_reservation_across_member_id_changes():
    tables = TableService()
    preview = tables.create_empty_table('account:owner')
    code = preview['table_code']
    tables.join_table('guest', code, 'Guest', creator_identity='session:other')
    assert tables.get_table(code).host_id is None
    tables.join_table('new-member-id', code, 'Owner', account_id='owner', creator_identity='account:owner')
    assert tables.get_table(code).host_id == 'new-member-id'
    tables.transfer_host('new-member-id', 'guest')
    tables.leave_table('new-member-id')
    tables.join_table('returning-owner', code, 'Owner', account_id='owner', creator_identity='account:owner')
    assert tables.get_table(code).host_id == 'guest'
