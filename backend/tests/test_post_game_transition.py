"""Post-game offers coordinate individual decisions without retaining seats."""
import pytest

from game_table.table.post_game_transition import (
    PostGameTransition, TeamPreference, TransitionPhase,
)


def transition():
    return PostGameTransition(('a', 'b', 'c', 'd'), ('A', 'B', 'A', 'B'),
                             frozenset({'a', 'c'}), now=0, response_seconds=10)


def accept_winners(model, first='same_team', second='same_team'):
    for player in ('a', 'c'):
        model.respond_keep_playing(player, True, now=1)
    for player, preference in [('a', first), ('c', second)]:
        model.choose_team(player, TeamPreference(preference), now=2)


def test_initial_state_blocks_seating_but_everyone_can_indicate_intent_without_challengers():
    model = transition()
    state = model.snapshot()
    assert state['seating_blocked']
    assert state['proposed_seats'] == [None] * 4
    assert state['players']['a']['deadline'] == 10
    assert state['players']['b'] == {'decision': 'keep_playing', 'deadline': 10, 'team_preference': None}
    model.respond_keep_playing('b', True, now=0)
    assert model.phase == TransitionPhase.WINNER_CHECKS
    assert model.snapshot()['players']['b']['decision'] == 'accepted'


def test_winner_choices_control_seating_without_delaying_loser_intent():
    model = transition()
    model.respond_keep_playing('a', True, now=1)
    model.respond_keep_playing('c', False, now=1)
    assert model.phase == TransitionPhase.WINNER_CHECKS
    assert model.snapshot()['players']['a']['deadline'] == 11
    model.choose_team('a', TeamPreference.SAME_TEAM, now=2)
    assert model.phase == TransitionPhase.LOSER_CHECKS
    assert model.snapshot()['players']['b']['deadline'] == 10
    assert model.seating_blocked


def test_same_team_requires_every_returning_player_to_accept():
    model = transition()
    accept_winners(model)
    model.respond_keep_playing('b', True, now=3)
    assert model.seating_blocked
    model.respond_keep_playing('d', True, now=3)
    assert model.phase == TransitionPhase.SEATING_READY
    assert not model.seating_blocked
    assert model.proposed_seats == ('a', 'b', 'c', 'd')


@pytest.mark.parametrize('first,second', [('mix_it_up', 'same_team'), ('same_team', 'mix_it_up'), ('mix_it_up', 'mix_it_up')])
def test_any_winner_can_mix_teams_without_duplicate_or_lost_players(first, second):
    model = transition()
    accept_winners(model, first, second)
    model.respond_keep_playing('b', True, now=3)
    model.respond_keep_playing('d', True, now=3)
    seats = model.proposed_seats
    assert set(seats) == {'a', 'b', 'c', 'd'}
    teams = model.snapshot()['previous_teams']
    assert teams[seats.index('a')] != teams[seats.index('c')]


def test_declines_leave_vacancies_instead_of_retaining_seats():
    model = transition()
    model.respond_keep_playing('a', False, now=1)
    model.respond_keep_playing('c', False, now=1)
    model.respond_keep_playing('b', True, now=2)
    model.respond_keep_playing('d', False, now=2)
    assert model.proposed_seats == (None, 'b', None, None)
    assert model.phase == TransitionPhase.SEATING_READY


def test_silence_expires_all_initial_prompts_without_an_extra_loser_wait():
    model = transition()
    model.expire(now=100)
    assert model.phase == TransitionPhase.SEATING_READY
    assert all(player['decision'] == 'timed_out' for player in model.snapshot()['players'].values())
    assert model.proposed_seats == (None,) * 4


def test_team_choice_timeout_loses_winners_spot():
    model = transition()
    model.respond_keep_playing('a', True, now=5)
    model.respond_keep_playing('c', False, now=5)
    model.expire(now=14)
    assert model.phase == TransitionPhase.WINNER_CHECKS
    model.expire(now=15)
    assert model.phase == TransitionPhase.SEATING_READY
    assert model.snapshot()['players']['a']['decision'] == 'timed_out'


def test_response_at_deadline_expires_and_cannot_revive_offer():
    model = transition()
    with pytest.raises(ValueError, match='no active'):
        model.respond_keep_playing('a', True, now=10)
    assert model.snapshot()['players']['a']['decision'] == 'timed_out'


def test_duplicate_responses_and_outsiders_cannot_change_decisions():
    model = transition()
    model.respond_keep_playing('a', True, now=1)
    with pytest.raises(ValueError, match='no active'):
        model.respond_keep_playing('a', False, now=1)
    with pytest.raises(ValueError, match='Only winners'):
        model.choose_team('b', TeamPreference.MIX_IT_UP, now=1)
    with pytest.raises(ValueError, match='previous game'):
        model.respond_keep_playing('viewer', True, now=1)
    model.choose_team('a', TeamPreference.SAME_TEAM, now=1)
    with pytest.raises(ValueError, match='no active'):
        model.choose_team('a', TeamPreference.MIX_IT_UP, now=1)


def test_snapshots_cannot_mutate_model_and_time_cannot_go_backwards():
    model = transition()
    snapshot = model.snapshot()
    snapshot['players']['a']['decision'] = 'accepted'
    snapshot['previous_seats'][0] = 'viewer'
    assert model.snapshot()['players']['a']['decision'] == 'keep_playing'
    model.expire(now=1)
    with pytest.raises(ValueError, match='backwards'):
        model.expire(now=0)


@pytest.mark.parametrize('seats,teams,winners,window', [
    (('a', 'a'), ('A', 'B'), frozenset({'a'}), 10),
    (('a', 'b'), ('A',), frozenset({'a'}), 10),
    (('a', 'b'), ('A', 'B'), frozenset({'viewer'}), 10),
    (('a', 'b'), ('A', 'B'), frozenset({'a', 'b'}), 10),
    (('a', 'b'), ('A', 'B'), frozenset({'a'}), 0),
])
def test_invalid_completed_game_input_is_rejected(seats, teams, winners, window):
    with pytest.raises(ValueError):
        PostGameTransition(seats, teams, winners, now=0, response_seconds=window)


def test_two_player_game():
    model = PostGameTransition(('a', 'b'), ('A', 'B'), frozenset({'a'}), now=0, response_seconds=10)
    model.respond_keep_playing('a', True, now=1)
    model.choose_team('a', TeamPreference.SAME_TEAM, now=1)
    model.respond_keep_playing('b', True, now=2)
    assert model.proposed_seats == ('a', 'b')


def test_challengers_preserve_winner_priority_and_losers_wait_for_a_real_offer():
    model = PostGameTransition(('a','b','c','d'), ('A','B','A','B'), frozenset({'a','c'}),
                               now=0, response_seconds=10, challengers=('x',))
    assert model.snapshot()['players']['b']['decision'] == 'waiting'
    with pytest.raises(ValueError):
        model.respond_keep_playing('b', True, now=1)


def test_early_loser_yes_retains_intent_until_winner_choices_resolve():
    model = transition()
    model.respond_keep_playing('b', True, now=1)
    model.respond_keep_playing('d', False, now=1)
    assert model.phase == TransitionPhase.WINNER_CHECKS
    assert model.proposed_seats == (None,) * 4
    accept_winners(model)
    assert model.phase == TransitionPhase.SEATING_READY
    assert set(model.proposed_seats) == {'a','b','c',None}
