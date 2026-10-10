import asyncio
from game_table.infrastructure.table_invite_tokens import TableInviteTokens
from game_table.application.table_registry import TableRegistry, generate_table_code
from game_table.application.table_service import TableService
from test_saved_table_preview import setup


def test_numeric_codes_and_unique_tokens_across_reuse_and_restart(tmp_path):
    path = str(tmp_path / 'tokens.sqlite3')
    used = set()
    for _ in range(3):
        registry = TableRegistry(TableInviteTokens(path))
        table = registry.create_empty(code_factory=lambda: '000123')
        assert len(table.invite_token) == 4 and table.invite_token.isdecimal()
        assert table.invite_token not in used
        used.add(table.invite_token)
    assert all(len(generate_table_code()) == 6 and generate_table_code().isdecimal() for _ in range(20))


def test_expired_links_rejected_on_lookup_join_and_membership_bare_code_works():
    server, tables, sessions = setup()
    old = tables.get_table('TEST-1234').invite_token
    tables.delete_table('host', 'TEST-1234')
    tables.create_table('new-host', 'TEST-1234', 'New host')
    current = tables.get_table('TEST-1234').invite_token
    assert old != current
    sessions.bind_connection('sid', 'browser')
    stale = dict(table_code='TEST-1234', invite_token=old)
    assert asyncio.run(server.handlers['table:lookup']('sid', stale))['code'] == 'INVITATION_EXPIRED'
    assert asyncio.run(server.handlers['table:join']('sid', dict(stale, name='Guest')))['code'] == 'INVITATION_EXPIRED'
    assert asyncio.run(server.handlers['table:membership']('sid', stale))['member'] is False
    for token in ['', 'bad', '12345']:
        assert asyncio.run(server.handlers['table:lookup']('sid', dict(stale, invite_token=token)))['code'] == 'INVITATION_EXPIRED'
    assert asyncio.run(server.handlers['table:lookup']('sid', dict(stale, invite_token=current)))['joinable']
    assert asyncio.run(server.handlers['table:join']('sid', dict(table_code='TEST-1234', name='Guest')))['table_code'] == 'TEST-1234'
    assert asyncio.run(server.handlers['table:membership']('sid', stale))['member'] is False
    tables.transfer_host('new-host', sessions.get_member_id('sid'))
    assert tables.get_table('TEST-1234').invite_token == current


def test_exhausted_code_is_skipped(tmp_path):
    store = TableInviteTokens(str(tmp_path / 'tokens.sqlite3'))
    store.allocate('123456')
    store.connection.executemany('INSERT OR IGNORE INTO table_invite_tokens VALUES (?, ?)', [('123456', f'{i:04d}') for i in range(10000)])
    store.connection.commit()
    codes = iter(['123456', '654321'])
    registry = TableRegistry(store)
    assert registry.create_empty(code_factory=lambda: next(codes)).table_code == '654321'
