"""Competition state and its assignment queue, independent of sockets and tables."""
from collections import Counter
from dataclasses import dataclass, field
from fractions import Fraction
from itertools import combinations
from random import Random


@dataclass(frozen=True)
class Assignment:
    id: str
    seats: tuple[str, str, str, str]

    @property
    def pairs(self):
        a, b, c, d = self.seats
        return (a, c), (b, d)


@dataclass(frozen=True)
class Result:
    points: tuple[int, int]
    hands: tuple[int, int]
    winner: int | None
    forfeiting: frozenset[str] = frozenset()


@dataclass
class TournamentQueue:
    assignments: dict[str, Assignment] = field(default_factory=dict)
    results: dict[str, Result | None] = field(default_factory=dict)

    def replace(self, assignments):
        if not self.complete:
            raise ValueError('Assignments are still active.')
        assignments = tuple(assignments)
        players = [player for assignment in assignments for player in assignment.seats]
        if len(players) != len(set(players)):
            raise ValueError('Players cannot have overlapping assignments.')
        self.assignments = {assignment.id: assignment for assignment in assignments}
        self.results.clear()

    @property
    def complete(self):
        return self.assignments.keys() == self.results.keys()

    def record(self, assignment_id, result):
        if assignment_id not in self.assignments:
            raise ValueError('Unknown assignment.')
        if assignment_id in self.results:
            if self.results[assignment_id] != result:
                raise ValueError('Conflicting game result.')
            return False
        self.results[assignment_id] = result
        return True


@dataclass
class Competition:
    scheduled_at: int
    stage: str = 'scheduled'
    queue: TournamentQueue = field(default_factory=TournamentQueue)
    invited: frozenset[str] = frozenset()
    ready: set[str] = field(default_factory=set)
    responded: set[str] = field(default_factory=set)
    deadline: int | None = None
    players: tuple[str, ...] = ()
    round: int = 0
    round_byes: set[str] = field(default_factory=set)
    byes: Counter = field(default_factory=Counter)
    forfeits: Counter = field(default_factory=Counter)
    partners: Counter = field(default_factory=Counter)
    history: list[tuple[Assignment, Result]] = field(default_factory=list)
    seeds: tuple[str, ...] = ()
    draft_picks: dict[int, str] = field(default_factory=dict)
    draft_confirmed: set[int] = field(default_factory=set)
    draft_deadlines: dict[int, int] = field(default_factory=dict)
    draft_unavailable: set[str] = field(default_factory=set)
    teams: dict[int, tuple[str, str]] = field(default_factory=dict)

    matches: tuple[tuple[int, int], ...] = ()
    knockout_game_scores: dict[tuple[int, int], list[tuple[int, int]]] = field(default_factory=dict)
    series: dict[tuple[int, int], list[int]] = field(default_factory=dict)
    match_assignments: dict[str, tuple[int, int]] = field(default_factory=dict)
    champions: tuple[str, str] | None = None

    def offer_start(self, now, connected):
        connected = frozenset(connected)
        if self.stage != 'scheduled' or self.deadline is not None or now < self.scheduled_at or len(connected) < 4:
            raise ValueError('Cannot open readiness.')
        self.invited, self.deadline = connected, now + 30_000
        self.ready.clear()
        self.responded.clear()

    def confirm(self, player, now, *, accepted=True):
        if self.deadline is None or now >= self.deadline or player not in self.invited:
            raise ValueError('No active readiness offer.')
        if player not in self.responded:
            self.responded.add(player)
            if accepted:
                self.ready.add(player)

    def close_readiness(self, now):
        if self.deadline is None or now < self.deadline:
            raise ValueError('Readiness is still open.')
        self.deadline = None
        if len(self.ready) < 4:
            return False
        self.players = tuple(sorted(self.ready))
        self.stage = 'qualification'
        return True

    def late_join(self, player):
        if self.stage != 'qualification' or self.round != 1 or self.queue.complete or player in self.players:
            raise ValueError('Late entry is closed.')
        self.players += (player,)
        self.forfeits[player] += 1

    def assign_round(self, connected, rng: Random):
        if self.stage != 'qualification' or self.round >= 6 or not self.queue.complete:
            raise ValueError('Cannot assign another round.')
        connected = set(connected)
        eligible = [player for player in self.players if player in connected]
        if len(eligible) < 4:
            raise ValueError('Fewer than four available players.')
        rng.shuffle(eligible)
        eligible.sort(key=self.byes.__getitem__)
        bye_count = len(eligible) % 4
        self.round_byes = set(eligible[:bye_count])
        for player in self.round_byes:
            self.byes[player] += 1
        remaining = eligible[bye_count:]
        assignments = []
        self.round += 1
        while remaining:
            a = remaining.pop(0)
            c = min(remaining, key=lambda p: self.partners[frozenset((a, p))])
            remaining.remove(c)
            b = remaining.pop(0)
            d = min(remaining, key=lambda p: self.partners[frozenset((b, p))])
            remaining.remove(d)
            assignment = Assignment(f'q{self.round}:{len(assignments)}', (a, b, c, d))
            for pair in assignment.pairs:
                self.partners[frozenset(pair)] += 1
            assignments.append(assignment)
        self.queue.replace(assignments)
        return tuple(assignments)

    def resolve_missing_assignment(self, assignment_id, present, replacements=()):
        if self.stage != 'qualification' or assignment_id in self.queue.results:
            return None
        assignment = self.queue.assignments[assignment_id]
        missing = set(assignment.seats) - set(present)
        if not missing:
            return assignment
        self.forfeits.update(missing)
        assigned = {p for game in self.queue.assignments.values() for p in game.seats}
        available = iter(dict.fromkeys(p for p in replacements if p in self.round_byes and p not in assigned))
        seats = tuple(next(available, None) if player in missing else player for player in assignment.seats)
        if None in seats:
            self.byes.update(player for player in assignment.seats if player not in missing)
            self.queue.results[assignment_id] = None
            return None
        for pair in assignment.pairs:
            self.partners[frozenset(pair)] -= 1
        replacement = Assignment(assignment_id, seats)
        self.queue.assignments[assignment_id] = replacement
        for player in set(seats) - assigned:
            self.byes[player] -= 1
            self.round_byes.discard(player)
        for pair in replacement.pairs:
            self.partners[frozenset(pair)] += 1
        return replacement

    def record_qualification(self, assignment_id, result):
        if self.stage != 'qualification':
            raise ValueError('Qualification is closed.')
        assignment = self.queue.assignments.get(assignment_id)
        if assignment is None or not result.forfeiting.issubset(assignment.seats) or result.winner not in (None, 0, 1):
            raise ValueError('Invalid qualification result.')
        if result.forfeiting and (result.winner is None or result.forfeiting.intersection(assignment.pairs[result.winner])):
            raise ValueError('A forfeiting player cannot win.')
        if self.queue.record(assignment_id, result):
            self.history.append((assignment, result))
            self.forfeits.update(result.forfeiting)

    def rank(self, rng: Random, *, live=False, entries=None):
        games, wins, hands, hand_wins, scored, score_games = (Counter() for _ in range(6))
        opposed, opposed_wins = Counter(), Counter()
        for assignment, result in self.history:
            for side, pair in enumerate(assignment.pairs):
                if result.forfeiting and result.winner != side:
                    continue
                credit = 1 if result.winner is None else 2 * int(result.winner == side)
                for player in pair:
                    games[player] += 1
                    wins[player] += credit
                    for opponent in assignment.pairs[1 - side]:
                        opposed[player, opponent] += 1
                        opposed_wins[player, opponent] += credit
                    if not result.forfeiting:
                        hands[player] += sum(result.hands)
                        hand_wins[player] += result.hands[side]
                        scored[player] += result.points[side] - result.points[1 - side]
                        score_games[player] += 1
        if entries is not None:
            actual_wins = Counter(player for assignment, result in self.history
                                  if result.winner is not None for player in assignment.pairs[result.winner])
            entries.update({p: {'account_id': p, 'games_played': games[p], 'games_won': actual_wins[p],
                                'win_percentage': wins[p] / (2 * games[p]) if games[p] else 0,
                                'win_streak': 0} for p in self.players})
        tied = {}
        for player in self.players:
            if live or (games[player] and games[player] >= 5 - self.byes[player] and self.forfeits[player] <= 1):
                tied.setdefault(Fraction(wins[player], 2 * (games[player] or 1)), []).append(player)
        ranked = []
        for percentage in sorted(tied, reverse=True):
            peers = tied[percentage]
            comparable = all(opposed[a, b] and opposed[b, a] for a, b in combinations(peers, 2))
            def key(player):
                counts = sum(opposed[player, p] for p in peers if p != player)
                credits = sum(opposed_wins[player, p] for p in peers if p != player)
                return (Fraction(credits, 2 * counts) if comparable and counts else 0,
                        Fraction(hand_wins[player], hands[player] or 1),
                        Fraction(scored[player], score_games[player] or 1))
            rng.shuffle(peers)
            ranked.extend(sorted(peers, key=key, reverse=True))
        return tuple(ranked)

    def standings(self):
        entries = {}
        ranked = self.rank(Random(0), live=True, entries=entries)
        ordered = (*self.seeds, *(p for p in ranked if p not in self.seeds))
        return [entries[p] for p in ordered]

    def open_draft(self, rng: Random):
        if self.stage != 'qualification' or self.round != 6 or not self.queue.complete:
            raise ValueError('Qualification is incomplete.')
        self.seeds = self.rank(rng)
        size = 8 if len(self.seeds) >= 8 else 4 if len(self.seeds) >= 4 else 0
        self.stage = 'draft' if size else 'completed'
        return self.seeds[:size]

    @property
    def captain_count(self):
        return 4 if len(self.seeds) >= 8 else 2

    def draft_candidates(self):
        available = [p for p in self.seeds[self.captain_count:]
                     if p not in self.draft_picks.values() and p not in self.draft_unavailable]
        return available[:max(1, self.captain_count - len(self.draft_picks))]

    def next_pick(self, now):
        for slot in range(1, self.captain_count + 1):
            if slot not in self.draft_picks:
                self.draft_deadlines.setdefault(slot, now + 30_000)
                return slot
        return None

    def pick_partner(self, slot, partner, now):
        if self.stage != 'draft' or slot != self.next_pick(now) or partner not in self.draft_candidates():
            raise ValueError('Invalid partner pick.')
        self.draft_picks[slot] = partner
        self.draft_deadlines[slot] = now + 30_000
        self.next_pick(now)

    def answer_partner(self, slot, accepted, now):
        if slot not in self.draft_picks or slot in self.draft_confirmed:
            raise ValueError('No pending response.')
        if accepted:
            self.draft_confirmed.add(slot)
            del self.draft_deadlines[slot]
        else:
            self.draft_unavailable.add(self.draft_picks.pop(slot))
            self.draft_deadlines.pop(slot, None)
            self.next_pick(now)

    def lock_pairs(self, pairs):
        """Accept the pairs produced by draft confirmation and replacement."""
        count = 4 if len(self.seeds) >= 8 else 2
        if self.stage != 'draft' or set(pairs) != set(range(1, count + 1)):
            raise ValueError('Draft is incomplete.')
        players = [p for pair in pairs.values() for p in pair]
        if any(len(pair) != 2 for pair in pairs.values()) or len(set(players)) != len(players) or not set(players).issubset(self.seeds):
            raise ValueError('Invalid draft pairs.')
        self.teams = dict(pairs)
        self.matches = ((1, 4), (2, 3)) if count == 4 else ((1, 2),)
        self.series = {match: [0, 0] for match in self.matches}
        self.stage = 'knockout'

    def bracket(self):
        semifinals = ((1, 4), (2, 3)) if len(self.teams) == 4 else ()
        final = next((match for match in self.series if match not in semifinals), None)
        rows = []
        for match in (*semifinals, final):
            scores = self.series[match] if match else None
            if match:
                pairs = [self.teams[seed] for seed in match]
            else:
                pairs = [self.teams[m[self.series[m].index(2)]] if max(self.series[m]) == 2 else None
                         for m in semifinals]
            rows.append({
                'stage': 'semifinal' if match in semifinals else 'final',
                'pairs': pairs,
                'scores': scores,
                'games': self.knockout_game_scores.get(match, []),
                'assignment_id': next((key for key, value in self.match_assignments.items() if value == match), None),
            })
        return rows

    def assign_knockouts(self):
        if self.stage != 'knockout' or not self.queue.complete or self.match_assignments:
            raise ValueError('Cannot assign knockout games.')
        games = []
        for match in self.matches:
            wins = self.series[match]
            if max(wins) == 2:
                continue
            a, c = self.teams[match[0]]
            b, d = self.teams[match[1]]
            game = Assignment(f'k{match[0]}:{match[1]}:{sum(wins)}', (a, b, c, d))
            self.match_assignments[game.id] = match
            games.append(game)
        self.queue.replace(games)
        return tuple(games)

    def record_knockout(self, assignment_id, result):
        if assignment_id in self.queue.results:
            self.queue.record(assignment_id, result)
            return
        if self.stage != 'knockout' or result.winner not in (0, 1) or result.forfeiting:
            raise ValueError('Invalid knockout result.')
        self.queue.record(assignment_id, result)
        match = self.match_assignments.pop(assignment_id)
        self.knockout_game_scores.setdefault(match, []).append(result.points)
        self.series[match][result.winner] += 1
        if not self.queue.complete or not all(max(self.series[m]) == 2 for m in self.matches):
            return
        winners = tuple(match[self.series[match].index(2)] for match in self.matches)
        if len(winners) == 1:
            self.champions = self.teams[winners[0]]
            self.stage = 'completed'
        else:
            self.matches = (winners,)
            self.series[winners] = [0, 0]
