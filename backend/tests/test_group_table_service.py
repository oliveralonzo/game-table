from concurrent.futures import ThreadPoolExecutor
import re

import pytest

from game_table.application.group_table_service import GroupTableService, generate_table_code
from game_table.application.table_registry import TableRegistry
from game_table.application.table_service import TableService
from game_table.application.group_service import GroupService
from game_table.group.group import Group, GroupMembership
from game_table.table.table import Table


class Groups:
    def is_member(self, account_id, group_id):
        return account_id in ("owner", "member") and group_id != "deleted"

    def get_group(self, account_id, group_id):
        if group_id == 'deleted':
            raise ValueError('Group does not exist.')
        if account_id not in ['owner', 'member']:
            raise PermissionError('Only current members may access the group.')


def test_group_creation_starts_empty_without_host_or_automatic_join():
    registry = TableRegistry()
    service = GroupTableService(Groups(), registry, lambda: 'BABA-1234')
    assert service.list_tables('member', 'g') == []
    result = service.create_table('member', 'g')
    table = registry.group_tables[result['table_code']]
    assert table.group_id == 'g'
    assert table.host_id is None
    assert table.members == {}
    assert result == {'table_code': 'BABA-1234', 'instance_id': table.instance_id, 'host_id': None, 'group_id': 'g', 'state': 'open',
                      'seat_count': 4, 'seats': [None] * 4, 'seat_selection_methods': [None] * 4, 'members': []}
    assert service.list_tables('owner', 'g') == [result]
    assert service.list_tables('owner', 'other') == []


def test_private_and_group_tables_share_code_uniqueness_but_not_discovery():
    registry = TableRegistry()
    private = TableService(registry=registry)
    private.create_table('host', 'BABA-1234')
    codes = iter(['BABA-1234', 'BEBE-1234'])
    groups = GroupTableService(Groups(), registry, lambda: next(codes))
    table = groups.create_table('member', 'g')
    assert table['table_code'] == 'BEBE-1234'
    assert [entry['table_code'] for entry in private.list_tables()] == ['BABA-1234']
    with pytest.raises(ValueError, match='already exists'):
        private.create_table('other', 'BEBE-1234')
    assert not private.table_exists('BEBE-1234')
    assert 'other' not in private._member_to_table
    # Private departure semantics remain unchanged; closed codes are reusable.
    private.leave_table('host')
    assert not registry.contains('BABA-1234')
    assert GroupTableService(Groups(), registry, lambda: 'BABA-1234').create_table('member', 'g')


@pytest.mark.parametrize('account,group,error', [
    ('guest', 'g', PermissionError), ('former', 'g', PermissionError),
    ('member', 'deleted', ValueError),
])
def test_access_denied_before_allocation_or_discovery(account, group, error):
    registry = TableRegistry()
    service = GroupTableService(Groups(), registry)
    with pytest.raises(error):
        service.create_table(account, group)
    with pytest.raises(error):
        service.list_tables(account, group)
    assert registry.group_tables == {}


def test_exhausted_code_factory_does_not_overwrite_any_table():
    registry = TableRegistry()
    service = GroupTableService(Groups(), registry, lambda: 'BABA-1234')
    original = service.create_table('owner', 'a')
    with pytest.raises(RuntimeError):
        service.create_table('member', 'b')
    assert service.list_tables('owner', 'a') == [original]
    assert service.list_tables('member', 'b') == []


def test_registry_reservation_is_atomic_across_private_and_group_creation():
    registry = TableRegistry()
    tables = [Table('SAME', 'host'), Table('SAME', None, group_id='g')]
    def reserve(table):
        try:
            registry.add(table)
            return True
        except ValueError:
            return False
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(reserve, tables)) == [False, True]
    assert len(registry.private_tables) + len(registry.group_tables) == 1


def test_private_host_requirement_is_unchanged_and_group_identity_validated():
    with pytest.raises(ValueError, match='Host member_id'):
        Table('A', None)
    with pytest.raises(ValueError):
        Table('A', 'host', group_id='g')
    with pytest.raises(ValueError):
        Table('A', None, group_id=' ')
    for _ in range(20):
        assert re.fullmatch('[BCDFGJKLMNPRSTV][AEIU][BCDFGJKLMNPRSTV][AEIU]-[0-9]{4}', generate_table_code())


def test_empty_group_closure_requires_membership_matching_lifetime_and_no_people():
    registry = TableRegistry()
    service = GroupTableService(Groups(), registry, lambda: 'BABA-1234')
    preview = service.create_table('owner', 'g')
    with pytest.raises(PermissionError):
        service.close_empty_table('guest', 'g', 'BABA-1234', preview['instance_id'])
    with pytest.raises(ValueError):
        service.close_empty_table('member', 'other', 'BABA-1234', preview['instance_id'])
    with pytest.raises(ValueError):
        service.close_empty_table('member', 'g', 'BABA-1234', 'expired')
    service.join_table('viewer', 'BABA-1234', 'Viewer')
    with pytest.raises(ValueError, match='empty'):
        service.close_empty_table('member', 'g', 'BABA-1234', preview['instance_id'])
    service.leave_table('viewer')
    replacement = service.create_table('owner', 'g')
    with pytest.raises(ValueError):
        service.close_empty_table('member', 'g', 'BABA-1234', preview['instance_id'])
    service.close_empty_table('member', 'g', 'BABA-1234', replacement['instance_id'])
    assert not registry.contains('BABA-1234')


def test_group_reset_seating_requires_current_membership():
    registry = TableRegistry()
    service = GroupTableService(Groups(), registry, lambda: 'BABA-1234')
    service.create_table('member', 'g')
    service.get_table('BABA-1234').set_pending_rules({'seat_selection': 'table'})
    service.join_table('member-session', 'BABA-1234', 'Member', account_id='member')
    service.join_table('guest-session', 'BABA-1234', 'Guest')
    service.assign_seat('guest-session', 0, 'random')
    with pytest.raises(PermissionError):
        service.reset_seating('guest-session')
    service.reset_seating('member-session')
    view = service.get_table_view('BABA-1234')
    assert view['seats'] == [None] * 4
    assert view['has_seating_history'] is False


def test_group_members_can_change_seating_configuration_without_a_host():
    registry = TableRegistry()
    service = GroupTableService(Groups(), registry, lambda: 'BABA-1234')
    service.create_table('member', 'g')
    service.join_table('member-session', 'BABA-1234', 'Member', account_id='member')
    service.join_table('guest-session', 'BABA-1234', 'Guest')
    service.update_rules('member-session', {'seat_selection': 'table'})
    index = service.assign_seat('guest-session', 0, 'random')
    with pytest.raises(PermissionError):
        service.update_rules('guest-session', {'seat_selection': 'seats'})
    with pytest.raises(PermissionError):
        service.remove_seat('guest-session')
    service.update_rules('member-session', {'seat_selection': 'seats'})
    assert service.get_table('BABA-1234').seats[index].member_id == 'guest-session'
    service.update_rules('member-session', {'seat_selection': 'table'})
    service.remove_seat('member-session')
    assert service.get_table('BABA-1234').seat_count == 3
    assert service.get_table('BABA-1234').has_seating_history is True
