from copy import deepcopy
from datetime import datetime, timezone
from types import SimpleNamespace
import asyncio
import pytest

from game_table.application.group_activity_service import GroupActivityService, month_bounds
from game_table.group.group_activity import GroupActivitySnapshot
from game_table.api.ws.group_activity_ws import register_group_activity_events


def ms(value):
    return int(datetime.fromisoformat(value).replace(tzinfo=timezone.utc).timestamp() * 1000)


class Groups:
    def get_group(self, account, group):
        if (account, group) != ('owner', 'g'):
            raise PermissionError('Not a member.')


class Repository:
    def __init__(self, games=()):
        self.games = games
        self.calls = []

    def read(self, group, account, start, end):
        self.calls.append((group, account, start, end))
        return GroupActivitySnapshot(ms('2026-07-01'), ms('2026-07-01'),
            [dict(account_id=id, username=id) for id in ['a', 'b', 'c', 'd', 'idle']], list(self.games))


def game(id='1', winner=0, guest=False, reverse=False):
    people = [dict(account_id=id, username=id, team_index=team, seat_index=seat,
                   group_participation='guest' if guest and id == 'b' else 'member')
              for seat, (id, team) in enumerate([('a', 0), ('c', 1), ('b', 0), ('d', 1)])]
    if reverse:
        people.reverse()
        for seat, person in enumerate(people):
            person['seat_index'] = seat
    return dict(id=id, completed_at=ms('2026-09-02')+int(id), started_at=None,
                team_scores=[100, 80] if winner == 0 else [80, 100], team_player_counts=[2, 2],
                winning_team_index=winner, participants=people)


def service(repo):
    return GroupActivityService(Groups(), repo, lambda: ms('2026-09-24'))


def test_roster_guests_teams_streaks_and_history():
    repo = Repository([game('1'), game('2', reverse=True), game('3', winner=1), game('4', guest=True)])
    result = service(repo).read('owner', 'g')
    players = {p['username']: p for p in result['players']}
    assert players['a']['games_played'] == 4
    assert players['a']['games_won'] == 3
    assert players['a']['win_streak'] == 1
    assert players['a']['best_win_streak'] == 2
    assert players['b']['games_played'] == 3  # Guest game never becomes member credit.
    assert players['idle']['games_played'] == 0
    teams = {tuple(p['usernames']): p for p in result['teams']}
    assert len(teams) == 2
    assert teams[('a', 'b')]['games_played'] == 3
    assert teams[('a', 'b')]['games_won'] == 2
    assert result['highlights']['win_streak'] == {'value': 2, 'usernames': ['a', 'b']}
    assert result['highlights']['best_percentage']['value'] is None
    assert result['history']['entries'][0]['winners'][1] == {'username': 'b', 'is_guest': True}
    assert result['history']['entries'][1]['score'] == '100–80'
    assert result['seasons'] == ['2026-09', '2026-08', '2026-07']
    assert repo.calls[0][2:] == month_bounds('2026-09')


def test_missing_participants_are_history_placeholders_not_invented_teams():
    value = game()
    value['participants'] = [p for p in value['participants'] if p['account_id'] != 'b']
    result = service(Repository([value])).read('owner', 'g')
    assert len(result['teams']) == 1
    assert result['history']['entries'][0]['winners'] == [
        {'username': 'a', 'is_guest': False}, {'username': None, 'is_guest': True}]


def test_guest_only_and_empty_history_do_not_produce_false_leaders():
    value = game()
    for p in value['participants']:
        p['group_participation'] = 'guest'
    for games in [[], [value]]:
        result = service(Repository(games)).read('owner', 'g')
        assert all(p['games_played'] == 0 for p in result['players'])
        assert not result['teams']
        assert all(h['value'] is None and h['usernames'] == [] for h in result['highlights'].values())


def test_pagination_and_minimum_percentage_eligibility():
    repo = Repository([game(str(i)) for i in range(1, 24)])
    result = service(repo).read('owner', 'g', 'all', 2)
    assert repo.calls[0][2:] == (None, None)
    assert result['highlights']['best_percentage'] == {'value': 1, 'usernames': ['a', 'b']}
    assert result['history']['total_games'] == 23
    assert result['history']['total_pages'] == 3
    assert [g['id'] for g in result['history']['entries']] == [str(i) for i in range(13, 3, -1)]
    assert len(service(repo).read('owner', 'g', 'all', 99)['history']['entries']) == 3


def test_month_boundary_and_leap_year():
    assert month_bounds('2024-02') == (ms('2024-02-01'), ms('2024-03-01'))
    assert month_bounds('2025-12') == (ms('2025-12-01'), ms('2026-01-01'))


@pytest.mark.parametrize('season', ['2026-13', 'bad', None, '0000-01', '9999-12', '2026-09-01'])
def test_invalid_seasons_are_rejected_before_database_read(season):
    repo = Repository()
    with pytest.raises(ValueError):
        service(repo).read('owner', 'g', season)
    assert not repo.calls


@pytest.mark.parametrize('page', [True, 0, -1, '2', 1.5])
def test_invalid_pages_are_rejected(page):
    with pytest.raises(ValueError):
        service(Repository()).read('owner', 'g', page=page)


def test_access_is_checked_before_read_and_rechecked_by_repository():
    repo = Repository()
    with pytest.raises(PermissionError):
        service(repo).read('outsider', 'g')
    assert not repo.calls
    repo.read = lambda *args: None
    with pytest.raises(PermissionError):
        service(repo).read('owner', 'g')


class Server:
    def on(self, event):
        def register(handler):
            if not hasattr(self, 'handlers'):
                self.handlers = {}
            self.handlers[event] = handler
            self.handler = handler
        return register


class Auth:
    def verify_token(self, token):
        if token != 'valid':
            raise ValueError('Invalid token.')
        return SimpleNamespace(provider='verified', subject='owner')


class Accounts:
    def find_by_auth_identity(self, provider, subject):
        assert provider == 'verified'
        return SimpleNamespace(id=subject)


def test_socket_uses_verified_identity_and_database_free_config_is_safe():
    server = Server()
    repo = Repository()
    register_group_activity_events(server, Accounts(), service(repo), Auth())
    response = asyncio.run(server.handler('sid', {'token': 'valid', 'account_id': 'outsider', 'group_id': 'g'}))
    assert 'error' not in response
    assert repo.calls[0][1] == 'owner'
    for payload in [{}, {'token': 'bad', 'group_id': 'g'}, {'token': 'valid', 'group_id': 'other'}]:
        assert 'error' in asyncio.run(server.handler('sid', payload))
    denied = asyncio.run(server.handler('sid', {'token': 'valid', 'group_id': 'other'}))
    assert denied['code'] == 'GROUP_ACCESS_DENIED'
    register_group_activity_events(server, None, None, None)
    assert 'error' in asyncio.run(server.handler('sid', {}))


def percentage_results(records):
    games = []
    for username, won, played in records:
        for index in range(played):
            value = game(str(len(games) + 1), winner=0 if index < won else 1)
            value['participants'] = [dict(account_id=username, username=username,
                team_index=0, seat_index=0, group_participation='member')]
            games.append(value)
    return games


def test_percentage_highlight_ties_on_displayed_whole_percentage():
    games = percentage_results([('RafaMarchena', 45, 84), ('Omar', 98, 183),
                                ('lower', 53, 100), ('too_few', 1, 1)])
    result = service(Repository(games)).read('owner', 'g', 'all')
    assert result['highlights']['best_percentage'] == {
        'value': 0.54, 'usernames': ['Omar', 'RafaMarchena']}
    players = {p['username']: p for p in result['players']}
    assert players['RafaMarchena']['win_percentage'] > players['Omar']['win_percentage']


def test_percentage_highlight_rounds_halves_up_and_keeps_zero_percent_ties():
    games = percentage_results([('half', 5, 40), ('whole', 13, 100)])
    assert service(Repository(games)).read('owner', 'g')['highlights']['best_percentage'] == {
        'value': 0.13, 'usernames': ['half', 'whole']}
    games = percentage_results([('first', 0, 10), ('second', 0, 12)])
    assert service(Repository(games)).read('owner', 'g')['highlights']['best_percentage'] == {
        'value': 0, 'usernames': ['first', 'second']}


def test_head_to_head_pools_opponents_across_teamings_and_counts_each_once():
    values = [game('1'), game('2'), game('3', winner=1)]
    switched = game('4', winner=1)
    for p in switched['participants']:
        p['team_index'] = 0 if p['account_id'] in ('a', 'c') else 1
    values.append(switched)
    values = [dict(deepcopy(value), id=str(i * 4 + j + 1))
              for i in range(10) for j, value in enumerate(values)]
    result = service(Repository(values)).read('owner', 'g')
    players = {p['account_id']: p for p in result['players']}
    # a leads c 20–10, ties d 20–20, trails b 0–10. Teammate games add nothing.
    assert players['a']['head_to_head'] == dict(ahead=1, tied=1, behind=1)
    assert players['idle']['head_to_head'] == dict(ahead=0, tied=0, behind=0)
    assert all('head_to_head' not in team for team in result['teams'])


def test_head_to_head_requires_both_players_to_be_members_in_each_game():
    first = game('1', winner=0, guest=True)
    second = game('2', winner=1)
    second['participants'] = [p for p in second['participants'] if p['account_id'] != 'd']
    values = [dict(deepcopy(value), id=str(i * 2 + j + 1))
              for i in range(10) for j, value in enumerate([first, second])]
    result = service(Repository(values)).read('owner', 'g')
    players = {p['account_id']: p for p in result['players']}
    assert players['b']['head_to_head'] == dict(ahead=0, tied=0, behind=1)
    assert players['c']['head_to_head'] == dict(ahead=1, tied=1, behind=0)
    assert players['d']['head_to_head'] == dict(ahead=0, tied=0, behind=1)


def test_head_to_head_uses_selected_season_and_all_games_not_history_page():
    class ScopedRepository(Repository):
        def read(self, group, account, start, end):
            snapshot = super().read(group, account, start, end)
            snapshot.games[:] = [g for g in snapshot.games if start is None or start <= (g['started_at'] or g['completed_at']) < end]
            return snapshot
    values = [game(str(i)) for i in range(1, 12)]
    for value in values:
        value['started_at'] = ms('2026-08-31T23:59:00')
    values.append(game('12', winner=1))
    reader = service(ScopedRepository(values))
    def record(season, page=1):
        return next(p['head_to_head'] for p in reader.read('owner', 'g', season, page)['players'] if p['account_id'] == 'a')
    assert record('2026-09') == dict(ahead=0, tied=0, behind=2)
    assert record('2026-08') == dict(ahead=2, tied=0, behind=0)
    assert record('all', 2) == dict(ahead=2, tied=0, behind=0)


@pytest.mark.parametrize('opponent_total, expected', [
    (1, dict(ahead=1, tied=0, behind=0)),
    (9, dict(ahead=1, tied=0, behind=0)),
    (10, dict(ahead=1, tied=0, behind=0)),
])
def test_head_to_head_includes_opponents_below_ten_total_group_games(opponent_total, expected):
    first = game('1')
    first['participants'] = [p for p in first['participants'] if p['account_id'] in ('a', 'c')]
    values = [first]
    for i in range(1, opponent_total):
        extra = game(str(i + 1))
        extra['participants'] = [p for p in extra['participants'] if p['account_id'] in ('b', 'c')]
        values.append(extra)
    # Guest appearances still do not count as member games.
    guest = game(str(opponent_total + 1))
    guest['participants'] = [p for p in guest['participants'] if p['account_id'] == 'c']
    guest['participants'][0]['group_participation'] = 'guest'
    values.append(guest)
    result = service(Repository(values)).read('owner', 'g')
    players = {p['account_id']: p for p in result['players']}
    assert players['a']['games_played'] == 1
    assert players['c']['games_played'] == opponent_total
    assert players['a']['head_to_head'] == expected
    # Every member opponent faced counts, including unranked players.
    assert players['c']['head_to_head'] == dict(ahead=0, tied=0, behind=1 if opponent_total == 1 else 2)


def test_hth_highlight_shows_eligible_tied_leaders_and_their_records():
    result = service(Repository([game(str(i)) for i in range(1, 11)])).read('owner', 'g')
    assert result['highlights']['head_to_head'] == dict(value=None, usernames=['a', 'b'], records=[
        dict(username='a', ahead=2, tied=0, behind=0),
        dict(username='b', ahead=2, tied=0, behind=0),
    ])
    assert 'most_played' not in result['highlights']


def test_hth_highlight_excludes_unranked_players():
    games = [game(str(i), winner=1) for i in range(1, 11)]
    for value in games:
        value['participants'] = [p for p in value['participants'] if p['account_id'] != 'a']
    games.append(game('11'))
    result = service(Repository(games)).read('owner', 'g')
    assert result['highlights']['head_to_head']['usernames'] == ['c', 'd']
    assert 'a' not in result['highlights']['head_to_head']['usernames']


def test_highlight_ties_order_by_hth_without_removing_tied_leaders():
    games = []
    def add(player, opponent, won):
        value = game(str(len(games) + 1), winner=0 if won else 1)
        value['participants'] = [dict(account_id=name, username=name, team_index=team,
            seat_index=team, group_participation='member')
            for team, name in enumerate([player, opponent]) if name is not None]
        games.append(value)
    for i in range(10):
        add('alpha', 'x', i < 5)
    for i in range(5):
        add('zeta', 'y', True)
    for i in range(5):
        add('zeta', 'w', False)
        add('y', None, False)
        add('w', None, False)
    result = service(Repository(games)).read('owner', 'g')
    for field in ['best_percentage', 'most_wins', 'win_streak']:
        names = result['highlights'][field]['usernames']
        assert 'alpha' in names and 'zeta' in names
        assert names.index('zeta') < names.index('alpha')


def test_player_records_use_group_season_and_only_member_results():
    repo = Repository([game('1'), game('2', winner=1), game('3', guest=True)])
    result = service(repo).player_records('owner', 'g', 'a', '2026-08')
    assert repo.calls == [('g', 'owner', *month_bounds('2026-08'))]
    assert [(p['username'], p['games_played'], p['games_won']) for p in result['records']] == [('b', 2, 1)]
    result = service(repo).player_records('owner', 'g', 'a', 'all', 'opponents')
    assert repo.calls[-1] == ('g', 'owner', None, None)
    assert [(p['username'], p['games_played'], p['games_won']) for p in result['records']] == [('c', 3, 2), ('d', 3, 2)]
    # A player's games as a guest never become member results.
    result = service(repo).player_records('owner', 'g', 'b', 'all')
    assert result['records'][0]['games_played'] == 2
    assert service(repo).player_records('owner', 'g', 'idle')['records'] == []


def test_player_records_access_validation_and_pagination():
    repo = Repository([game(str(i)) for i in range(12)])
    for i, value in enumerate(repo.games):
        value['participants'][2]['account_id'] = f'partner-{i:02d}'
        value['participants'][2]['username'] = f'partner-{i:02d}'
    result = service(repo).player_records('owner', 'g', 'a')
    assert len(result['records']) == 10 and result['has_more']
    second = service(repo).player_records('owner', 'g', 'a', page=2)
    assert len(second['records']) == 2 and not second['has_more']
    assert not ({p['account_id'] for p in result['records']} & {p['account_id'] for p in second['records']})
    with pytest.raises(PermissionError):
        service(repo).player_records('outsider', 'g', 'a')
    for options in [dict(player_id='unknown'), dict(player_id=''), dict(relationship='invalid'),
                    dict(sort='invalid'), dict(page=True), dict(page=0), dict(season='2026-13')]:
        args = dict(player_id='a')
        args.update(options)
        with pytest.raises(ValueError):
            service(repo).player_records('owner', 'g', **args)
    repo.read = lambda *args: None
    with pytest.raises(PermissionError):
        service(repo).player_records('owner', 'g', 'a')


def test_player_record_socket_uses_verified_requester_and_explicit_target():
    server, repo = Server(), Repository([game()])
    register_group_activity_events(server, Accounts(), service(repo), Auth())
    handler = server.handlers['group:player_records']
    response = asyncio.run(handler('sid', dict(token='valid', group_id='g', player_id='a', account_id='outsider')))
    assert response['records'][0]['username'] == 'b'
    assert repo.calls[0][1] == 'owner'
    assert 'error' in asyncio.run(handler('sid', dict(token='bad', group_id='g', player_id='a')))
    assert 'error' in asyncio.run(handler('sid', dict(token='valid', group_id='other', player_id='a')))


def test_player_record_percentage_uses_rounded_percentages_without_minimum_games():
    games = []
    for name, played, won in [('lower-volume', 20, 11), ('higher-volume', 31, 17), ('unranked', 1, 1)]:
        for index in range(played):
            value = game(str(len(games) + 1), winner=0 if index < won else 1)
            value['participants'][2].update(account_id=name, username=name)
            games.append(value)
    result = service(Repository(games)).player_records('owner', 'g', 'a', sort='win_percentage')
    assert [p['username'] for p in result['records']] == ['unranked', 'higher-volume', 'lower-volume']
