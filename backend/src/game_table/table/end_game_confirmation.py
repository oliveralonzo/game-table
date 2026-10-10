"""Unanimous end-game consent; missing responses default to yes at the deadline."""
from uuid import uuid4

class EndGameConfirmation:
    def __init__(self, game_id, players, *, now, response_seconds):
        if not players or response_seconds <= 0:
            raise ValueError('Players and a positive response window are required.')
        self.id = str(uuid4())
        self.game_id = game_id
        self.deadline = now + response_seconds
        self.responses = {player: None for player in players}
        self.status = 'pending'

    def expire(self, now):
        if self.status == 'pending' and now >= self.deadline:
            self.responses = {p: True if vote is None else vote for p, vote in self.responses.items()}
            self.status = 'approved'

    def respond(self, player, yes, *, now):
        if not isinstance(yes, bool) or player not in self.responses:
            raise ValueError('Only participating players can answer yes or no.')
        self.expire(now)
        if self.status != 'pending' or self.responses[player] is not None:
            raise ValueError('Confirmation is no longer awaiting this response.')
        self.responses[player] = yes
        if not yes:
            self.status = 'cancelled'
        elif all(v is True for v in self.responses.values()):
            self.status = 'approved'

    def replace_player(self, old, new):
        if old in self.responses:
            self.responses[new] = self.responses.pop(old)

    def snapshot(self):
        return {'id': self.id, 'game_id': self.game_id, 'deadline': self.deadline,
                'responses': dict(self.responses), 'status': self.status}
