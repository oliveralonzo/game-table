"""Opt-in PostgreSQL tests; all fixtures live in session-local temporary tables."""
import os
from contextlib import contextmanager
import pytest
from psycopg.types.json import Jsonb
from game_table.infrastructure.database import load_environment, get_platform_database_url, create_database_connection
from game_table.infrastructure.postgres_group_activity_repository import PostgresGroupActivityRepository
from game_table.application.group_activity_service import month_bounds


@pytest.fixture
def repository(request):
    if os.environ.get('RUN_GROUP_ACTIVITY_DB_TESTS') != '1':
        pytest.skip('Set RUN_GROUP_ACTIVITY_DB_TESTS=1 to test the PostgreSQL adapter.')
    load_environment()
    connection = create_database_connection(get_platform_database_url())
    def cleanup():
        if not connection.closed:
            connection.rollback()
            connection.close()
    request.addfinalizer(cleanup)
    @contextmanager
    def session():
        # The repository may finish a read, but only the fixture ends this transaction.
        yield connection
    start, end = month_bounds('2026-09')
    with connection.cursor() as cursor:
        cursor.execute("CREATE TEMP TABLE groups (id text, created_at bigint, deleted_at bigint) ON COMMIT DROP")
        cursor.execute("CREATE TEMP TABLE accounts (id text, username text) ON COMMIT DROP")
        cursor.execute("CREATE TEMP TABLE group_memberships (group_id text, account_id text, joined_at bigint, left_at bigint) ON COMMIT DROP")
        cursor.execute("CREATE TEMP TABLE game_history (id text, group_id text, started_at bigint, completed_at bigint, team_scores jsonb, team_player_counts jsonb, winning_team_index int) ON COMMIT DROP")
        cursor.execute("CREATE TEMP TABLE account_game_results (game_history_id text, account_id text, team_index int, seat_index int, group_participation text) ON COMMIT DROP")
        cursor.execute("INSERT INTO groups VALUES ('g', %s, NULL), ('other', %s, NULL), ('deleted', %s, %s)", (start, start, start, end))
        cursor.execute("INSERT INTO accounts VALUES ('owner', 'oliver'), ('guest', 'guest'), ('later', 'later')")
        cursor.execute("INSERT INTO group_memberships VALUES ('g', 'owner', %s, NULL), ('deleted', 'owner', %s, NULL), ('g', 'later', %s, NULL)", (start, start, end))
        for id, group, began, ended in [
            ('legacy', 'g', None, start), ('crosses', 'g', end-1, end+1),
            ('before', 'g', start-1, start+1), ('after', 'g', end, end+1),
            ('other', 'other', start, start+1), ('private', None, start, start+1),
        ]:
            cursor.execute("INSERT INTO game_history VALUES (%s,%s,%s,%s,%s,%s,0)", (id, group, began, ended, Jsonb([100,90]), Jsonb([1,1])))
            cursor.execute("INSERT INTO account_game_results VALUES (%s,'owner',0,0,'member'), (%s,'guest',1,1,'guest')", (id, id))
    yield PostgresGroupActivityRepository(session)


def test_group_scope_month_boundaries_legacy_dates_and_guest_history(repository):
    result = repository.read('g', 'owner', *month_bounds('2026-09'))
    assert [g['id'] for g in result.games] == ['legacy', 'crosses']
    assert result.members == [{'account_id': 'owner', 'username': 'oliver'}]
    assert result.games[0]['participants'][1]['group_participation'] == 'guest'


@pytest.mark.parametrize('group, account', [('g','guest'), ('other','owner'), ('missing','owner'), ('deleted','owner')])
def test_access_denied_on_same_snapshot(repository, group, account):
    assert repository.read(group, account, None, None) is None


def test_all_time_includes_only_this_group(repository):
    result = repository.read('g', 'owner', None, None)
    assert {g['id'] for g in result.games} == {'legacy', 'crosses', 'before', 'after'}


def test_new_game_writer_preserves_group_start_eligibility_and_private_scope(repository):
    from game_table.application.history_service import HistoryService
    from game_table.infrastructure.postgres_history_repository import PostgresHistoryRepository

    # Extend only this test's temporary tables; all changes are rolled back.
    with repository._connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute("ALTER TABLE game_history ADD PRIMARY KEY (id), ADD table_code text, ADD rounds_played int")
            cursor.execute("ALTER TABLE account_game_results ADD PRIMARY KEY (game_history_id, account_id), ADD won boolean, ADD points_for int, ADD points_against int")
    _, boundary = month_bounds('2026-09')
    service = HistoryService(PostgresHistoryRepository(repository._connection_factory), clock_ms=lambda: boundary + 60000)
    arguments = dict(
        table_code='NEW', rounds_played=3, team_scores=[100, 90],
        team_player_counts=[1, 1], winning_team_index=0,
        account_participants=[
            dict(account_id='owner', seat_index=0, team_index=0, group_participation='member'),
            dict(account_id='guest', seat_index=1, team_index=1, group_participation='guest'),
        ],
        group_id='g', started_at=boundary-60000, history_id='new_group_game',
    )
    service.record_completed_game(**arguments)
    service.record_completed_game(**arguments)
    september = repository.read('g', 'owner', *month_bounds('2026-09'))
    saved = [game for game in september.games if game['id'] == 'new_group_game']
    assert len(saved) == 1
    assert {p['account_id']: p['group_participation'] for p in saved[0]['participants']} == {'owner': 'member', 'guest': 'guest'}
    october = repository.read('g', 'owner', *month_bounds('2026-10'))
    assert 'new_group_game' not in {game['id'] for game in october.games}

    service.record_completed_game(**dict(arguments, group_id=None, history_id='new_private_game', account_participants=[dict(account_id='owner', seat_index=0, team_index=0)]))
    with repository._connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT group_id, started_at FROM game_history WHERE id = 'new_group_game'")
            assert cursor.fetchone() == ('g', boundary-60000)
            cursor.execute("SELECT group_id, group_participation FROM game_history JOIN account_game_results ON game_history.id = game_history_id WHERE id = 'new_private_game'")
            assert cursor.fetchone() == (None, None)
    assert 'new_private_game' not in {game['id'] for game in repository.read('g', 'owner', None, None).games}


def test_live_session_access_reads_history_and_saves_defaults_without_reauthorizing(repository):
    from game_table.application.group_session_service import GroupSessionService
    from game_table.group.group import Group, GroupMembership
    from game_table.infrastructure.postgres_group_repository import PostgresGroupRepository
    groups_repo = PostgresGroupRepository(repository._connection_factory)
    groups = GroupSessionService(groups_repo)
    groups.admit('owner', 'g', 'socket:test', snapshot=Group('g', 'Group', 1, (
        GroupMembership('owner-membership', 'g', 'owner', 'owner', 1),)))
    with repository._connection_factory() as connection:
        connection.execute('ALTER TABLE groups ADD default_rules jsonb, ADD default_seat_count int')
        connection.execute('ALTER TABLE accounts ADD table_nickname text')
        connection.execute('ALTER TABLE group_memberships ADD role text')
        connection.execute("UPDATE group_memberships SET left_at = 2 WHERE account_id = 'owner'")
    # Existing admission is authoritative until release/revocation, even when
    # storage changes. Data operations still enforce group existence.
    assert repository.read('g', 'owner', None, None) is None
    assert len(repository.read('g', 'owner', None, None, authorized=True).games) == 4
    assert [m.account_id for m in groups.list_members('owner', 'g')] == ['later']
    groups.update_defaults('owner', 'g', {'target': 100}, 2)
    with repository._connection_factory() as connection:
        assert connection.execute("SELECT default_rules, default_seat_count FROM groups WHERE id='g'").fetchone() == ({'target': 100}, 2)
    groups.revoke('owner', 'g')
    with pytest.raises(PermissionError):
        groups.update_defaults('owner', 'g', {}, 4)
    assert repository.read('deleted', 'owner', None, None, authorized=True) is None
