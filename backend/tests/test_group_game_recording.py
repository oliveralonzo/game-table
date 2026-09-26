from types import SimpleNamespace
from datetime import datetime, timezone
import pytest

from game_table.application.game_table_service import GameTableService
from game_table.application.game_history_recorder import GameHistoryRecorder
from game_table.application.history_service import HistoryService
from game_table.application.group_table_service import GroupTableService
from game_table.application.table_service import TableService
from game_table.application.table_registry import TableRegistry
from game_table.application.table_service_router import TableServiceRouter

START = int(datetime(2026, 9, 30, 23, 59, tzinfo=timezone.utc).timestamp()*1000)
END = START + 120000


class Groups:
    members = None
    def __init__(self):
        self.members = {'a', 'b', 'c'}
    def get_group(self, account, group):
        if account not in self.members:
            raise PermissionError('Not a member.')
        members = set(self.members)
        return SimpleNamespace(public_id='a12bc345', membership_for=lambda account: account in members)
    def is_member(self, account, group):
        return account in self.members


class Games:
    def __init__(self):
        self.next_id = 0
        self.completed = False
        self.removed = []
    def create_game(self, player_count, settings):
        assert player_count == 4
        self.completed = False
        self.next_id += 1
        return f'game_{self.next_id}'
    def remove_game(self, id):
        self.removed.append(id)
    def is_over(self, id):
        return self.completed
    def get_result(self, id):
        if not self.completed:
            return None
        return dict(rounds_played=3, team_scores=[100,80], team_player_counts=[2,2],
                    winning_team_index=0, seat_team_indices={0:0,1:1,2:0,3:1})


class History:
    def __init__(self):
        self.games = []
        self.results = []
        self.fail = False
    def save_game_with_results(self, game, results):
        if self.fail:
            raise RuntimeError('Database unavailable')
        self.games.append(game)
        self.results = results


def setup(private=False, database=True):
    registry = TableRegistry()
    groups = Groups()
    public = GroupTableService(groups, registry, lambda: 'CODE-1234')
    private_tables = TableService(registry=registry)
    tables = TableServiceRouter(private_tables, public, registry)
    if private:
        tables.create_table('m0', 'CODE-1234', 'A', account_id='a')
    else:
        public.create_table('a', 'g')
    for seat, account in enumerate(['a','guest','b','c']):
        if not private or seat != 0:
            tables.join_table(f'm{seat}', 'CODE-1234', account, account_id=account)
        tables.assign_seat(f'm{seat}', seat)
    repo = History()
    recorder = GameHistoryRecorder(HistoryService(repo, clock_ms=lambda: END) if database else None)
    games = Games()
    service = GameTableService(games, tables, game_history_recorder=recorder, clock_ms=lambda: START)
    return SimpleNamespace(groups=groups, tables=tables, games=games, repo=repo, service=service)


def test_group_context_is_captured_at_start_and_membership_changes_do_not_rewrite_it():
    s = setup()
    id = s.service.start_game_for_table('m0')
    s.groups.members.remove('b')
    s.groups.members.add('guest')
    s.games.completed = True
    s.service.record_completed_game_for_table('CODE-1234', id)
    game = s.repo.games[0]
    assert (game.group_id, game.started_at, game.completed_at) == ('g', START, END)
    assert game.id == f'hist_{id}'
    assert {r.account_id:r.group_participation for r in s.repo.results} == {
        'a':'member','guest':'guest','b':'member','c':'member'}
    s.service.record_completed_game_for_table('CODE-1234', id)
    assert len(s.repo.games) == 1


@pytest.mark.parametrize('removal', ['unseat', 'leave'])
def test_changed_seat_gives_neither_original_nor_replacement_credit(removal):
    s = setup()
    id = s.service.start_game_for_table('m0')
    if removal == 'unseat':
        s.tables.unassign_seat('m0', 2)
    else:
        s.tables.leave_table('m2')
    s.tables.join_table('replacement', 'CODE-1234', 'Replacement', account_id='replacement')
    s.tables.assign_seat('replacement', 2)
    s.games.completed = True
    s.service.record_completed_game_for_table('CODE-1234', id)
    assert {r.account_id for r in s.repo.results} == {'a','guest','c'}
    assert s.repo.games[0].team_player_counts == [2,2]


def test_returning_to_seat_does_not_restore_credit_but_account_reconnect_preserves_it():
    s = setup()
    id = s.service.start_game_for_table('m0')
    s.tables.unassign_seat('m0', 2)
    s.tables.assign_seat('m2', 2)
    s.tables.join_table('new-device', 'CODE-1234', 'A', account_id='a')
    s.games.completed = True
    s.service.record_completed_game_for_table('CODE-1234', id)
    assert {r.account_id for r in s.repo.results} == {'a','guest','c'}


def test_private_history_keeps_null_group_and_real_start_without_database_requirement():
    s = setup(private=True)
    id = s.service.start_game_for_table('m0')
    s.games.completed = True
    s.service.end_game_for_table('m0')
    assert s.repo.games[0].group_id is None
    assert s.repo.games[0].started_at == START
    assert all(r.group_participation is None for r in s.repo.results)
    s = setup(private=True, database=False)
    s.service.start_game_for_table('m0')
    s.games.completed = True
    s.service.end_game_for_table('m0')
    assert not s.repo.games


def test_only_members_start_and_completed_games_can_be_restarted():
    s = setup()
    with pytest.raises(PermissionError):
        s.service.start_game_for_table('m1')
    id = s.service.start_game_for_table('m2')
    with pytest.raises(PermissionError):
        s.service.end_game_for_table('m1')
    assert not s.repo.games
    s.games.completed = True
    next_id = s.service.start_game_for_table('m0')
    assert next_id != id
    assert len(s.repo.games) == 1
    assert s.games.removed == [id]


def test_failed_save_keeps_game_attached_for_retry_and_preserves_completion_snapshot():
    s = setup()
    id = s.service.start_game_for_table('m0')
    s.games.completed = True
    s.repo.fail = True
    with pytest.raises(RuntimeError):
        s.service.end_game_for_table('m0')
    assert s.tables.get_table('CODE-1234').active_game_id == id
    assert not s.games.removed
    s.tables.unassign_seat('m0', 2)
    s.repo.fail = False
    s.service.end_game_for_table('m0')
    assert len(s.repo.results) == 4
    assert s.tables.get_table('CODE-1234').active_game_id is None


def test_group_game_without_eligible_accounts_still_has_group_history():
    s = setup()
    id = s.service.start_game_for_table('m0')
    for seat in range(4):
        s.tables.unassign_seat('m0', seat)
    s.games.completed = True
    s.service.record_completed_game_for_table('CODE-1234', id)
    assert len(s.repo.games) == 1
    assert s.repo.results == []


def test_failed_attach_does_not_leave_a_game_or_context():
    s = setup()
    s.tables.attach_game = lambda *args: (_ for _ in ()).throw(ValueError('Attach failed'))
    with pytest.raises(ValueError):
        s.service.start_game_for_table('m0')
    assert s.games.removed == ['game_1']
    assert len(s.service._history_contexts) == 0


def test_member_can_start_a_table_of_anonymous_guests_without_player_credit():
    s = setup()
    for seat in range(4):
        s.tables.unassign_seat('m0', seat)
        s.tables.join_table(f'anon{seat}', 'CODE-1234', f'Guest {seat}')
        s.tables.assign_seat(f'anon{seat}', seat)
    id = s.service.start_game_for_table('m0')
    s.games.completed = True
    s.service.record_completed_game_for_table('CODE-1234', id)
    assert s.repo.games[0].group_id == 'g'
    assert s.repo.results == []


@pytest.mark.parametrize('completed', [False, True])
@pytest.mark.parametrize('actor,allowed', [('m0', True), ('m2', True), ('m1', False), ('viewer', False)])
def test_group_game_end_requires_both_membership_and_a_seat(completed, actor, allowed):
    s = setup()
    s.groups.members.add('viewer-account')
    s.tables.join_table('viewer', 'CODE-1234', 'Viewer', account_id='viewer-account')
    game_id = s.service.start_game_for_table('m0')
    s.games.completed = completed
    if not allowed:
        with pytest.raises(PermissionError):
            s.service.end_game_for_table(actor)
        assert s.tables.get_table('CODE-1234').active_game_id == game_id
        assert not s.games.removed
        assert not s.repo.games
        return
    s.service.end_game_for_table(actor)
    table = s.tables.get_table('CODE-1234')
    assert table.active_game_id is None
    assert len(table.members) == 5
    assert table.seats[0].member_id == 'm0'
    assert s.games.removed == [game_id]
    assert len(s.repo.games) == int(completed)


def test_unseated_member_cannot_end_blocked_game_but_another_seated_member_can():
    s = setup()
    game_id = s.service.start_game_for_table('m0')
    s.tables.unassign_seat('m0', 0)
    with pytest.raises(PermissionError):
        s.service.end_game_for_table('m0')
    s.service.end_game_for_table('m2')
    assert s.games.removed == [game_id]
    assert not s.repo.games
