from dataclasses import FrozenInstanceError, replace

import pytest

from game_table.group.group import Group, GroupMembership, GroupRole


def membership(account='owner', role='owner', **kwargs):
    return GroupMembership(kwargs.pop('id', account), 'g', account, role, 10, **kwargs)


def group(*members, **kwargs):
    return Group('g', 'Alpha', 1, members or (membership(),), **kwargs)


def test_multiple_owners_and_departed_members_are_preserved():
    departed = membership('old', 'member', left_at=20)
    value = group(membership(), membership('second'), departed)
    assert value.member_count == 2
    assert len(value.memberships) == 3
    assert value.membership_for('old') is None
    assert value.membership_for('second').role == GroupRole.OWNER


def test_membership_rejoin_is_a_new_period():
    old = membership('player', 'member', id='old', left_at=20)
    new = GroupMembership('new', 'g', 'player', GroupRole.MEMBER, 30)
    value = group(membership(), old, new)
    assert value.member_count == 2
    assert value.membership_for('player') == new
    assert not old.includes(9)
    assert old.includes(10)
    assert not old.includes(20)
    assert not new.includes(25)
    assert new.includes(30)


def test_capacity_counts_current_members_of_every_role_only():
    members = [membership()] + [membership(str(i), 'admin') for i in range(65)]
    value = group(*members, membership('departed', 'member', left_at=20))
    assert value.member_count == 66
    with pytest.raises(ValueError, match='66'):
        group(*members, membership('overflow', 'member'))


@pytest.mark.parametrize('members', [
    (membership('admin', 'admin'),),
    (membership(left_at=20), membership('player', 'member')),
])
def test_active_group_requires_current_owner(members):
    with pytest.raises(ValueError, match='current owner'):
        group(*members)


def test_deleted_group_can_have_no_current_owner():
    assert group(membership(left_at=20), deleted_at=30).member_count == 0


def test_unique_current_membership_and_membership_identity():
    with pytest.raises(ValueError, match='current membership'):
        group(membership(), membership(id='another'))
    with pytest.raises(ValueError, match='IDs must be unique'):
        group(membership(), membership('other', id='owner'))
    with pytest.raises(ValueError, match='another group'):
        group(replace(membership(), group_id='other'))


@pytest.mark.parametrize('kwargs', [{'left_at': 9}, {'role': 'guest'}, {'account_id': ''}])
def test_invalid_membership_rejected(kwargs):
    with pytest.raises(ValueError):
        replace(membership(), **kwargs)


@pytest.mark.parametrize('kwargs', [{'name': ' '}, {'id': ''}, {'deleted_at': 0}])
def test_invalid_group_rejected(kwargs):
    with pytest.raises(ValueError):
        replace(group(), **kwargs)


def test_names_are_not_group_identity_and_values_are_immutable():
    value = group()
    other = Group('other', 'Alpha', 1, (replace(membership(), group_id='other'),))
    assert value.name == other.name
    assert value.id != other.id
    with pytest.raises(FrozenInstanceError):
        value.name = 'Changed'
    supplied = [membership()]
    value = Group('g', 'Alpha', 1, supplied)
    supplied.clear()
    assert value.member_count == 1
