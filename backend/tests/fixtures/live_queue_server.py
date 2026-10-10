"""Isolated transport fixture: production adapters, registry and table services."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'src'))
import socketio
import uvicorn
from types import SimpleNamespace
from game_table.application.table_service import TableService
from game_table.application.game_table_service import GameTableService
from game_table.api.ws.table_ws import register_table_events
from game_table.api.ws.session_registry import SessionRegistry

class CompletedGames:
    def __init__(self): self.counter = 0; self.running = set()
    def create_game(self, **kwargs):
        self.counter += 1
        return f'game-{self.counter}'
    def is_over(self, game_id): return game_id not in self.running
    def get_result(self, game_id):
        return {'winning_team_index': 0, 'seat_team_indices': {0: 0, 1: 1, 2: 0, 3: 1}}
    def remove_game(self, game_id): pass

sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins=[])
tables = TableService()
games = CompletedGames()
lifecycle = GameTableService(games, tables, post_game_response_seconds=2)
registry = SessionRegistry()
register_table_events(sio, tables, lifecycle, registry,
                      SimpleNamespace(default_settings=lambda: None, serialize_settings=lambda x: x))
@sio.on('fixture:set_running')
async def set_running(sid, data):
    member = registry.resolve_member_id(sid)
    table = tables.get_table(tables.get_table_code_for_member(member))
    games.running.add(table.active_game_id)
    return {'updated': True}

uvicorn.run(socketio.ASGIApp(sio), host='127.0.0.1', port=int(sys.argv[1]), log_level='warning')
