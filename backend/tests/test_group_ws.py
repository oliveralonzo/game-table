import asyncio
from types import SimpleNamespace

from game_table.api.ws.group_ws import register_group_events


class Server:
    def __init__(self):
        self.handlers = {}

    def on(self, event):
        def register(handler):
            self.handlers[event] = handler
            return handler
        return register


class Accounts:
    def find_by_auth_identity(self, provider, subject):
        assert (provider, subject) == ('clerk', 'verified-subject')
        return SimpleNamespace(id='verified-account')


class Auth:
    def verify_token(self, token):
        if token != 'valid-token':
            raise ValueError('Invalid token.')
        return SimpleNamespace(provider='clerk', subject='verified-subject')


class Groups:
    def __init__(self):
        self.calls = []

    def list_groups(self, account_id):
        self.calls.append(account_id)
        return [SimpleNamespace(id='stable-id', public_id='a12bc345', name='Alpha', member_count=14)]


def request(accounts=None, groups=None, auth=None, data=None):
    server = Server()
    register_group_events(server, accounts, groups, auth)
    return asyncio.run(server.handlers['group:list']('socket-id', data))


def test_group_identity_comes_from_verified_token_and_payload_is_minimal():
    groups = Groups()
    response = request(Accounts(), groups, Auth(), {
        'token': 'valid-token', 'account_id': 'someone-else', 'group_id': 'private-group',
    })
    assert groups.calls == ['verified-account']
    assert response == {'groups': [{'id': 'stable-id', 'public_id': 'a12bc345', 'name': 'Alpha', 'member_count': 14}]}


def test_invalid_or_missing_auth_cannot_read_groups():
    groups = Groups()
    for payload in [None, {}, {'token': 'invalid'}]:
        assert 'error' in request(Accounts(), groups, Auth(), payload)
    assert groups.calls == []


def test_no_account_and_no_memberships_are_empty_results():
    class NoAccount(Accounts):
        def find_by_auth_identity(self, *_):
            return None
    groups = Groups()
    assert request(NoAccount(), groups, Auth(), {'token': 'valid-token'}) == {'groups': []}
    assert groups.calls == []
    groups.list_groups = lambda account_id: []
    assert request(Accounts(), groups, Auth(), {'token': 'valid-token'}) == {'groups': []}


def test_database_free_configuration_returns_controlled_error():
    assert request()['message'] == 'Groups are not configured.'


def test_repository_failure_is_not_reported_as_empty_membership():
    class Unavailable(Groups):
        def list_groups(self, account_id):
            raise RuntimeError('Unavailable')
    response = request(Accounts(), Unavailable(), Auth(), {'token': 'valid-token'})
    assert 'error' in response
    assert 'groups' not in response


def roster_request(service, data):
    server = Server()
    register_group_events(server, Accounts(), service, Auth())
    return asyncio.run(server.handlers['group:members']('socket-id', data))


def test_roster_uses_verified_account_and_only_public_profile_fields():
    from game_table.group.group_member import GroupMember
    class Roster:
        def list_members(self, account_id, group_id):
            assert (account_id, group_id) == ('verified-account', 'g')
            return [GroupMember('verified-account', 'oliver', 'Oliver'),
                    GroupMember('other', 'alex', None)]
    result = roster_request(Roster(), {'token': 'valid-token', 'group_id': 'g', 'account_id': 'other'})
    assert result == {'group_id': 'g', 'members': [
        {'account_id': 'verified-account', 'username': 'oliver', 'name': 'Oliver', 'is_self': True},
        {'account_id': 'other', 'username': 'alex', 'name': 'alex', 'is_self': False},
    ]}


def test_roster_access_denial_has_explicit_cache_invalidation_code():
    class Denied:
        def list_members(self, *_):
            raise PermissionError('Only current members may access the group.')
    result = roster_request(Denied(), {'token': 'valid-token', 'group_id': 'g'})
    assert result['code'] == 'GROUP_ACCESS_DENIED'
    assert 'members' not in result


def test_roster_rejects_missing_group_and_invalid_token_before_reading():
    class Unreachable:
        def list_members(self, *_):
            raise AssertionError('Must not read the roster')
    for payload in [{}, {'token': 'valid-token'}, {'token': 'invalid', 'group_id': 'g'}]:
        assert 'error' in roster_request(Unreachable(), payload)
