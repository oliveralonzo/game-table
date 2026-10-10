"""Ordered queue membership, independent of game results and seat offers."""
class PlayerQueue:
    def __init__(self):
        self._members = []

    def join(self, member_id):
        if member_id not in self._members:
            self._members.append(member_id)

    def leave(self, member_id):
        self._members = [p for p in self._members if p != member_id]

    def replace(self, old, new):
        self._members = [new if p == old else p for p in self._members]

    def snapshot(self):
        return list(self._members)
