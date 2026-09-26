from dataclasses import replace

import pytest

from game_table.application.group_service import GroupService
from game_table.group.group import Group, GroupMembership, GroupRole
from game_table.infrastructure.postgres_group_repository import PostgresGroupRepository


def sample_group():
    return Group('g', 'Alpha', 1, (
        GroupMembership('owner', 'g', 'owner', GroupRole.OWNER, 1),
        GroupMembership('former', 'g', 'former', GroupRole.MEMBER, 1, 2),
        GroupMembership('member', 'g', 'member', GroupRole.MEMBER, 1),
    ))


class Repository:
    value = sample_group()

    def get_by_id(self, group_id):
        return self.value if group_id == self.value.id else None

    def list_for_account(self, account_id):
        return [self.value]


def test_current_members_can_read_group_and_full_membership_history():
    service = GroupService(Repository())
    assert len(service.get_group('member', 'g').memberships) == 3
    assert len(service.list_groups('owner')) == 1


@pytest.mark.parametrize('account', ['former', 'guest', 'socket-id'])
def test_nonmembers_cannot_read_private_group(account):
    service = GroupService(Repository())
    with pytest.raises(PermissionError):
        service.get_group(account, 'g')
    assert service.list_groups(account) == []


def test_deleted_and_missing_groups_are_unavailable():
    repo = Repository()
    repo.value = replace(repo.value, deleted_at=3)
    service = GroupService(repo)
    for group_id in ['g', 'missing']:
        with pytest.raises(ValueError, match='does not exist'):
            service.get_group('owner', group_id)
    assert service.list_groups('owner') == []


@pytest.mark.parametrize('account', ['', ' '])
def test_account_identity_required(account):
    service = GroupService(Repository())
    with pytest.raises(ValueError):
        service.list_groups(account)
    with pytest.raises(ValueError):
        service.get_group(account, 'g')


class Connection:
    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def cursor(self, **kwargs):
        return self

    def execute(self, query, params):
        self.calls.append((query, params))

    def fetchall(self):
        return self.rows


def test_postgres_loads_all_membership_periods_and_uses_parameters():
    value = sample_group()
    connection = Connection([{
        'id': value.id, 'name': value.name, 'created_at': value.created_at,
        'deleted_at': None, 'membership_id': member.id, 'account_id': member.account_id,
        'role': member.role.value, 'joined_at': member.joined_at, 'left_at': member.left_at,
    } for member in value.memberships])
    repo = PostgresGroupRepository(lambda: connection)
    assert repo.get_by_id('g') == value
    account = "account'with-quote"
    assert repo.list_for_account(account) == [value]
    query, params = connection.calls[-1]
    assert account not in query
    assert params == (account,)
    assert 'current_member.left_at IS NULL' in query
    assert 'g.deleted_at IS NULL' in query
    assert len(connection.calls) == 2


def test_postgres_handles_missing_and_deleted_empty_groups():
    connection = Connection([])
    repo = PostgresGroupRepository(lambda: connection)
    assert repo.get_by_id('missing') is None
    connection.rows = [{
        'id': 'g', 'name': 'Alpha', 'created_at': 1, 'deleted_at': 2,
        'membership_id': None,
    }]
    assert repo.get_by_id('g').memberships == ()


def test_roster_reads_only_after_current_membership_is_confirmed():
    from game_table.group.group_member import GroupMember
    class RosterRepository(Repository):
        def __init__(self):
            self.calls = []
        def list_members(self, group_id, account_id):
            self.calls.append((group_id, account_id))
            return [GroupMember('owner', 'oliver', 'Oliver')]
    repo = RosterRepository()
    service = GroupService(repo)
    for account in ['former', 'guest']:
        with pytest.raises(PermissionError):
            service.list_members(account, 'g')
    assert repo.calls == []
    assert service.list_members('member', 'g')[0].username == 'oliver'
    assert repo.calls == [('g', 'member')]
    repo.value = replace(repo.value, deleted_at=3)
    with pytest.raises(ValueError):
        service.list_members('owner', 'g')
    assert len(repo.calls) == 1


def test_access_revoked_between_membership_and_roster_reads_is_denied():
    repo = Repository()
    repo.list_members = lambda *_: []
    with pytest.raises(PermissionError):
        GroupService(repo).list_members('member', 'g')


def test_roster_query_filters_departed_members_and_rechecks_access():
    connection = Connection([{'account_id': 'a', 'username': 'alice', 'table_nickname': None}])
    repo = PostgresGroupRepository(lambda: connection)
    result = repo.list_members('group-with-quote\'', 'verified-account')
    assert result[0].username == 'alice'
    query, params = connection.calls[0]
    assert params == ("group-with-quote'", False, 'verified-account')
    assert params[0] not in query
    assert 'm.left_at IS NULL' in query
    assert 'requester.left_at IS NULL' in query
    assert 'g.deleted_at IS NULL' in query
