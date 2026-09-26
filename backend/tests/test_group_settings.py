from dataclasses import replace
import asyncio
from types import SimpleNamespace
import pytest
from game_table.group.group import Group, GroupMembership
from game_table.application.group_service import GroupService
from game_table.application.group_table_service import GroupTableService
from game_table.application.table_registry import TableRegistry
from game_table.api.ws.group_ws import register_group_events

class Repository:
    def __init__(self):
        self.group = Group('g', 'Group', 1, tuple(GroupMembership(role, 'g', role, role, 1)
                                               for role in ('owner', 'admin', 'member')))
    def get_by_id(self, group_id):
        return self.group if group_id == 'g' else None
    def update_defaults(self, group_id, account_id, rules, seat_count):
        self.group = replace(self.group, default_rules=rules, default_seat_count=seat_count)
        return True

class Settings:
    def default_settings(self): return {'target': 100}
    def parse_settings(self, value):
        if not isinstance(value, dict) or type(value.get('target')) is not int or value['target'] <= 0:
            raise ValueError('Invalid target')
        return dict(value)
    def serialize_settings(self, value): return dict(value)

@pytest.mark.parametrize('role', ['owner', 'admin'])
def test_only_privileged_members_can_save_defaults(role):
    repo = Repository()
    service = GroupService(repo)
    service.update_defaults(role, 'g', {'target': 200}, 2)
    assert repo.group.default_rules == {'target': 200}
    assert repo.group.default_seat_count == 2

@pytest.mark.parametrize('role', ['member', 'guest'])
def test_unprivileged_members_cannot_save_defaults(role):
    repo = Repository()
    with pytest.raises(PermissionError):
        GroupService(repo).update_defaults(role, 'g', {'target': 200}, 2)
    assert repo.group.default_rules is None

@pytest.mark.parametrize('seats', [1, 5, True, 2.5, None])
def test_default_seat_count_is_validated(seats):
    with pytest.raises(ValueError):
        GroupService(Repository()).update_defaults('owner', 'g', {}, seats)

def test_defaults_are_copied_at_creation_and_table_overrides_are_isolated():
    repo = Repository()
    groups = GroupService(repo)
    tables = GroupTableService(groups, TableRegistry(), settings_provider=Settings())
    old = tables.create_table('member', 'g')['table_code']
    groups.update_defaults('owner', 'g', {'target': 200}, 2)
    new = tables.create_table('member', 'g')['table_code']
    assert tables.get_pending_rules(old) == {'target': 100}
    assert tables.get_pending_rules(new) == {'target': 200}
    assert len(tables.get_table(new).seats) == 2
    tables.join_table('m', new, 'Member', account_id='member')
    tables.join_table('guest', new, 'Guest')
    with pytest.raises(PermissionError): tables.update_rules('guest', {'target': 300})
    tables.update_rules('m', {'target': 300})
    assert tables.get_pending_rules(new) == {'target': 300}
    assert repo.group.default_rules == {'target': 200}
    tables.assign_seat('m', 0)
    tables.assign_seat('guest', 1)
    tables.prepare_game_start('m')
    tables.attach_game('m', 'game')
    with pytest.raises(ValueError): tables.update_rules('m', {'target': 400})

class Server:
    def __init__(self): self.handlers = {}
    def on(self, name):
        def register(fn): self.handlers[name] = fn; return fn
        return register

def test_settings_transport_uses_verified_identity_and_validates_rules():
    repo = Repository()
    server = Server()
    auth = SimpleNamespace(verify_token=lambda token: SimpleNamespace(provider='test', subject=token))
    accounts = SimpleNamespace(find_by_auth_identity=lambda provider, subject: SimpleNamespace(id=subject))
    register_group_events(server, accounts, GroupService(repo), auth, Settings())
    read = server.handlers['group:settings']
    update = server.handlers['group:update_settings']
    assert asyncio.run(read('sid', {'token': 'member', 'group_id': 'g'}))['can_edit'] is False
    assert asyncio.run(read('sid', {'token': 'admin', 'group_id': 'g'}))['can_edit'] is True
    assert 'error' in asyncio.run(update('sid', {'token': 'member', 'account_id': 'owner', 'group_id': 'g', 'rules': {'target': 200}, 'seat_count': 4}))
    assert 'error' in asyncio.run(update('sid', {'token': 'owner', 'group_id': 'g', 'rules': {'target': -1}, 'seat_count': 4}))
    result = asyncio.run(update('sid', {'token': 'owner', 'group_id': 'g', 'rules': {'target': 200}, 'seat_count': 3}))
    assert result == {'rules': {'target': 200}, 'seat_count': 3, 'can_edit': True}
