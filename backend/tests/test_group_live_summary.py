import asyncio

from game_table.api.ws.group_ws import register_group_events
from game_table.api.ws.group_table_notifications import emit_group_table_availability
from test_coordinated_presence import system


def test_live_summary_reuses_admission_and_does_not_join_lobby():
    async def run():
        s = system()
        register_group_events(s.sio, s.sockets.accounts, s.groups, s.sockets.auth, sessions=s.sockets)
        await s.connect('watcher', 'watcher-browser')
        ack = await s.sio.handlers['/']['group:watch_tables']('watcher', {'token': 'owner'})
        assert ack == {'groups': {'g': False}, 'active_counts': {'g': 0}}
        assert s.sessions.group_presences == {}
        assert ('watcher', 'group-tables:g') in s.rooms
        assert ('watcher', 'group:g') not in s.rooms
        await s.connect('player', 'player-browser')
        await s.sockets.enter('player', {'token': 'member', 'group_id': 'g'})
        assert s.events[-1] == ('group:active_count', {'group_id': 'g', 'active_count': 1}, {'room': 'group-tables:g'})
        reads = s.repo.reads
        for _ in range(3):
            await s.sockets.enter('player', {'token': 'member', 'group_id': 'g'})
            assert s.sockets.active_count('g') == 1
        s.group_tables.create_table('member', 'g')
        await emit_group_table_availability(s.sio, s.tables, 'g')
        assert s.events[-1][1]['has_open_tables'] is True
        await s.join('player')
        assert s.sockets.active_count('g') == 1
        await s.sockets.leave('player', 'g')
        assert s.sockets.active_count('g') == 0
        assert s.events[-1][1]['active_count'] == 0
        assert s.repo.reads == reads
        # Reconnect/resubscribe gets current snapshots, without another group read.
        assert await s.sio.handlers['/']['group:watch_tables']('watcher', {'token': 'owner'}) == ack
        assert s.repo.reads == reads
    asyncio.run(run())


def test_counts_deduplicate_accounts_and_update_on_expiry_and_revocation():
    async def run():
        s = system()
        await s.connect('one', 'browser-one')
        await s.connect('two', 'browser-two')
        await s.sockets.enter('one', {'token': 'member', 'group_id': 'g'})
        await s.sockets.enter('two', {'token': 'member', 'group_id': 'g'})
        reads = s.repo.reads
        assert s.sockets.active_count('g') == 1
        await s.sockets.expire_presence('browser-one')
        assert s.events[-1][1]['active_count'] == 1
        await s.sockets.revoke('member', 'g')
        assert s.sockets.active_count('g') == 0
        counts = [data['active_count'] for event, data, _ in s.events if event == 'group:active_count']
        assert counts[-1] == 0
        assert s.repo.reads == reads
    asyncio.run(run())


def test_guest_is_not_active_and_cannot_watch_private_group():
    async def run():
        s = system()
        s.groups.admit('owner', 'g', 'creator')
        s.group_tables.create_table('owner', 'g')
        await s.connect('guest', 'guest-browser')
        assert await s.sockets.watch_tables('guest', {'token': 'outsider'}) == {}
        await s.join('guest', account='outsider')
        assert s.sockets.active_count('g') == 0
        assert ('guest', 'group-tables:g') not in s.rooms
    asyncio.run(run())
