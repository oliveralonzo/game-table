"""Server-owned decisions for the next game, with winner and challenger priority.

This model proposes seats; it does not mutate Table or start a game. The caller
provides time, applies proposals through Table, and broadcasts snapshots. Previous
player IDs must be stable for the duration of the transition.
"""
from dataclasses import dataclass
from enum import Enum
from math import isfinite
from random import choice


class TransitionPhase(str, Enum):
    WINNER_CHECKS = 'winner_checks'
    CHALLENGER_CHECKS = 'challenger_checks'
    PARTNER_SELECTION = 'partner_selection'
    LOSER_CHECKS = 'loser_checks'
    SEATING_READY = 'seating_ready'


class PlayerDecision(str, Enum):
    WAITING = 'waiting'
    READY = 'ready'
    PARTNER_CHOICE = 'partner_choice'
    KEEP_PLAYING = 'keep_playing'
    TEAM_CHOICE = 'team_choice'
    ACCEPTED = 'accepted'
    LEFT = 'left'
    TIMED_OUT = 'timed_out'


class TeamPreference(str, Enum):
    SAME_TEAM = 'same_team'
    MIX_IT_UP = 'mix_it_up'


@dataclass
class _PlayerCheck:
    decision: PlayerDecision = PlayerDecision.WAITING
    deadline: float | None = None
    preference: TeamPreference | None = None


class PostGameTransition:
    """Resolve winner priority, then returning losers, with expiring prompts.

    `teams` maps seat indexes to team identifiers. No seat is retained until
    its occupant accepts. Any winner choosing mix-it-up splits returning winners
    across teams; other accepted players fill the vacated seats deterministically.
    Each new prompt gets its own response window. At its exact deadline, an offer
    has expired. Expiry must also be driven by a server scheduler via `expire`.
    """

    def __init__(self, seats: tuple[str | None, ...], teams: tuple[str, ...],
                 winners: frozenset[str], *, now: float, response_seconds: float, challengers: tuple[str, ...] = ()):
        players = [p for p in seats if p is not None]
        if not 2 <= len(seats) <= 4 or len(set(players)) != len(players) or not all(players):
            raise ValueError('Provide two to four distinct previous players.')
        if len(teams) != len(seats) or not all(teams):
            raise ValueError('Every seat needs a team identifier.')
        if not winners <= set(players):
            raise ValueError('Winners must be previous players.')
        if winners and len({teams[seats.index(player)] for player in winners}) != 1:
            raise ValueError('Winners must belong to one previous team.')
        if not isfinite(now) or not isfinite(response_seconds) or response_seconds <= 0:
            raise ValueError('Provide a finite time and positive response window.')
        if len(winners) > len(set(teams)):
            raise ValueError('There must be enough teams to split returning winners.')
        if (len(set(challengers)) != len(challengers) or not all(challengers)
                or set(challengers) & set(players)):
            raise ValueError('Challengers must be distinct spectators.')
        self._challengers = tuple(challengers)
        self._partner_chooser = None
        self._invited_player = None
        self._invited_by = {}
        self._random_invites = set()
        self._partner_attempted = False
        self._seats = tuple(seats)
        self._teams = tuple(teams)
        self._winners = frozenset(winners)
        self._window = response_seconds
        self._last_time = now
        self._phase = TransitionPhase.WINNER_CHECKS
        self._checks = {player: _PlayerCheck() for player in [*players, *challengers]}
        self._proposed_seats: tuple[str | None, ...] = (None,) * len(seats)
        for player in players:
            if player in winners or not challengers:
                self._offer(player, now)
        self._advance_phase(now)

    @property
    def phase(self) -> TransitionPhase:
        return self._phase

    @property
    def seating_blocked(self) -> bool:
        return self._phase != TransitionPhase.SEATING_READY

    @property
    def proposed_seats(self) -> tuple[str | None, ...]:
        return self._proposed_seats

    def _offer(self, player: str, now: float) -> None:
        check = self._checks[player]
        check.decision = PlayerDecision.KEEP_PLAYING
        check.deadline = now + self._window

    def _advance_time(self, now: float) -> None:
        if not isfinite(now) or now < self._last_time:
            raise ValueError('Time must be finite and cannot move backwards.')
        self._last_time = now

    def expire(self, *, now: float) -> None:
        self._advance_time(now)
        for check in self._checks.values():
            if check.deadline is not None and now >= check.deadline:
                check.decision = (PlayerDecision.ACCEPTED if check.decision == PlayerDecision.PARTNER_CHOICE
                                  else PlayerDecision.TIMED_OUT)
                check.deadline = None
        self._advance_phase(now)

    def respond_keep_playing(self, player: str, keep_playing: bool, *, now: float) -> None:
        if player not in self._checks:
            raise ValueError('Player did not participate in the previous game.')
        if not isinstance(keep_playing, bool):
            raise ValueError('Keep playing must be a boolean.')
        self.expire(now=now)
        check = self._checks[player]
        if check.decision not in (PlayerDecision.KEEP_PLAYING, PlayerDecision.READY):
            raise ValueError('Player has no active keep-playing prompt.')
        if not keep_playing:
            check.decision = PlayerDecision.LEFT
            check.deadline = None
        elif player in self._winners:
            check.decision = PlayerDecision.TEAM_CHOICE
            check.deadline = now + self._window
        else:
            check.decision = PlayerDecision.ACCEPTED
            check.deadline = None
        self._advance_phase(now)

    def choose_team(self, player: str, preference: TeamPreference, *, now: float) -> None:
        if player not in self._winners:
            raise ValueError('Only winners have a team-choice prompt.')
        preference = TeamPreference(preference)
        self.expire(now=now)
        check = self._checks[player]
        if check.decision != PlayerDecision.TEAM_CHOICE:
            raise ValueError('Player has no active team-choice prompt.')
        check.preference = preference
        check.decision = PlayerDecision.ACCEPTED
        check.deadline = None
        self._advance_phase(now)

    def _accepted(self):
        return [p for p, c in self._checks.items()
                if c.decision in (PlayerDecision.ACCEPTED, PlayerDecision.PARTNER_CHOICE)]

    def _remaining_spots(self):
        return len(self._seats) - len(self._accepted())

    def _available_losers(self):
        return [p for p in self._seats if p is not None and p not in self._winners
                and self._checks[p].decision == PlayerDecision.WAITING]

    def _finish(self):
        self._proposed_seats = self._assign_seats()
        self._phase = TransitionPhase.SEATING_READY

    def _offer_partner_choice(self, now):
        candidates = self._available_losers()
        if not candidates or self._remaining_spots() <= 0:
            return False
        chooser = self._partner_chooser
        if chooser is None or self._checks[chooser].decision != PlayerDecision.ACCEPTED:
            return False
        check = self._checks[chooser]
        check.decision = PlayerDecision.PARTNER_CHOICE
        check.deadline = now + self._window
        self._phase = TransitionPhase.PARTNER_SELECTION
        return True

    def choose_player(self, player, selected_player, *, now):
        self.expire(now=now)
        if player != self._partner_chooser or self._checks[player].decision != PlayerDecision.PARTNER_CHOICE:
            raise ValueError('Player has no active selection prompt.')
        candidates = self._available_losers()
        randomly_selected = selected_player == '__random__'
        if randomly_selected and candidates:
            selected_player = choice(candidates)
        if selected_player not in candidates:
            raise ValueError('Selected player is not available.')
        self._checks[player].decision = PlayerDecision.ACCEPTED
        self._checks[player].deadline = None
        self._invited_player = selected_player
        self._invited_by[selected_player] = player
        self._random_invites.discard(selected_player)
        if randomly_selected:
            self._random_invites.add(selected_player)
        self._offer(selected_player, now)
        self._phase = TransitionPhase.LOSER_CHECKS

    def _advance_phase(self, now: float) -> None:
        resolved = {PlayerDecision.ACCEPTED, PlayerDecision.LEFT, PlayerDecision.TIMED_OUT}
        if self._phase == TransitionPhase.WINNER_CHECKS:
            if not all(self._checks[p].decision in resolved for p in self._winners):
                return
            self._phase = TransitionPhase.CHALLENGER_CHECKS
        if self._phase == TransitionPhase.CHALLENGER_CHECKS:
            pending = [p for p in self._challengers if self._checks[p].decision == PlayerDecision.READY]
            waiting = [p for p in self._challengers if self._checks[p].decision == PlayerDecision.WAITING]
            for player in waiting[:max(0, self._remaining_spots() - len(pending))]:
                self._checks[player].decision = PlayerDecision.READY
                self._checks[player].deadline = now + self._window
                pending.append(player)
            if pending:
                return
            if self._remaining_spots() == 0:
                self._finish()
                return
            accepted_challengers = [p for p in self._challengers if self._checks[p].decision == PlayerDecision.ACCEPTED]
            if len(accepted_challengers) == 1 and not self._partner_attempted:
                self._partner_attempted = True
                self._partner_chooser = accepted_challengers[0]
                if self._offer_partner_choice(now):
                    return
            self._phase = TransitionPhase.LOSER_CHECKS
        if self._phase == TransitionPhase.PARTNER_SELECTION:
            if self._checks[self._partner_chooser].decision == PlayerDecision.PARTNER_CHOICE:
                return
            self._phase = TransitionPhase.LOSER_CHECKS
        if self._phase == TransitionPhase.LOSER_CHECKS:
            if self._invited_player is not None:
                invited = self._checks[self._invited_player]
                if invited.decision == PlayerDecision.KEEP_PLAYING:
                    return
                self._invited_player = None
                if invited.decision != PlayerDecision.ACCEPTED and self._offer_partner_choice(now):
                    return
            pending = [p for p in self._seats if p is not None and self._checks[p].decision == PlayerDecision.KEEP_PLAYING]
            for player in self._available_losers()[:max(0, self._remaining_spots() - len(pending))]:
                self._offer(player, now)
                pending.append(player)
            if not pending:
                self._finish()

    def _assign_seats(self) -> tuple[str | None, ...]:
        accepted = self._accepted()
        mix = any(self._checks[p].preference == TeamPreference.MIX_IT_UP for p in self._winners)
        seats: list[str | None] = [None] * len(self._seats)
        used_teams: set[str] = set()
        # Winners decide placement; challengers take priority over returning losers.
        order = [p for p in self._seats if p in self._winners and p in accepted]
        order += [p for p in self._challengers if p in accepted]
        order += [p for p in self._seats if p is not None and p not in self._winners and p in accepted]
        for player in order:
            original = self._seats.index(player) if player in self._seats else None
            candidates = ([original] if original is not None else []) + [i for i in range(len(seats)) if i != original]
            target = next(i for i in candidates if seats[i] is None and
                          (not mix or player not in self._winners or self._teams[i] not in used_teams))
            seats[target] = player
            if player in self._winners:
                used_teams.add(self._teams[target])
        return tuple(seats)

    def withdraw(self, player: str) -> None:
        """A participant leaving forfeits even an already accepted offer.

        The application drives expiry afterwards with its current server time.
        """
        if player in self._checks:
            check = self._checks[player]
            check.decision = PlayerDecision.LEFT
            check.deadline = None
            check.preference = None

    def replace_player(self, old: str, new: str) -> None:
        """Transfer an offer when Table replaces a session for the same account."""
        if old not in self._checks:
            return
        if new in self._checks:
            raise ValueError('Player already participates in this transition.')
        self._challengers = tuple(new if p == old else p for p in self._challengers)
        if self._partner_chooser == old:
            self._partner_chooser = new
        if self._invited_player == old:
            self._invited_player = new
        self._invited_by = {new if p == old else p: new if chooser == old else chooser
                            for p, chooser in self._invited_by.items()}
        self._random_invites = {new if p == old else p for p in self._random_invites}
        self._checks[new] = self._checks.pop(old)
        self._seats = tuple(new if p == old else p for p in self._seats)
        self._winners = frozenset(new if p == old else p for p in self._winners)
        self._proposed_seats = tuple(new if p == old else p for p in self._proposed_seats)

    def snapshot(self) -> dict:
        """Return detached transport-safe data, including prompt deadlines."""
        return {
            'phase': self._phase.value,
            'challengers': list(self._challengers),
            'selection_candidates': self._available_losers() if self._phase == TransitionPhase.PARTNER_SELECTION else [],
            'invited_by': dict(self._invited_by),
            'random_invites': sorted(self._random_invites),
            'seating_blocked': self.seating_blocked,
            'previous_seats': list(self._seats),
            'previous_teams': list(self._teams),
            'winners': [p for p in self._seats if p in self._winners],
            'proposed_seats': list(self._proposed_seats),
            'players': {p: {
                'decision': check.decision.value,
                'deadline': check.deadline,
                'team_preference': check.preference.value if check.preference else None,
            } for p, check in self._checks.items()},
        }
