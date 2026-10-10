"""Durable allocation history: a code/token pair is never issued twice."""
import sqlite3
from secrets import choice

class TableInviteTokens:
    def __init__(self, path=":memory:", database_url=None):
        self.path = path
        self.database_url = database_url
        self.connection = None

    def allocate(self, code):
        if self.database_url:
            from game_table.infrastructure.database import create_database_connection
            with create_database_connection(self.database_url) as connection:
                return self._allocate(connection, code, "%s", True)
        if self.connection is None:
            self.connection = sqlite3.connect(self.path, check_same_thread=False)
        with self.connection:
            return self._allocate(self.connection, code, "?", False)

    def _allocate(self, connection, code, placeholder, postgres):
        connection.execute("CREATE TABLE IF NOT EXISTS table_invite_tokens (code TEXT NOT NULL, token TEXT NOT NULL, PRIMARY KEY (code, token))")
        used = {row[0] for row in connection.execute(f"SELECT token FROM table_invite_tokens WHERE code = {placeholder}", (code,)).fetchall()}
        available = [f"{number:04d}" for number in range(10000) if f"{number:04d}" not in used]
        while available:
            token = choice(available)
            suffix = " ON CONFLICT DO NOTHING RETURNING token" if postgres else " ON CONFLICT DO NOTHING"
            cursor = connection.execute(f"INSERT INTO table_invite_tokens (code, token) VALUES ({placeholder}, {placeholder})" + suffix, (code, token))
            if (cursor.fetchone() is not None if postgres else cursor.rowcount == 1):
                return token
            available.remove(token)
        raise ValueError("Invitation tokens exhausted for this code.")
