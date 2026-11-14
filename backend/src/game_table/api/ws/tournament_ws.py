"""Authenticated scheduling API. Account IDs always come from verified tokens."""
from asyncio import to_thread
from dataclasses import asdict
from game_table.api.ws.errors import error_response


def register_tournament_events(sio, accounts, tournaments, auth):
    async def request(data, operation):
        try:
            if accounts is None or tournaments is None or auth is None:
                raise RuntimeError('Tournaments are not configured.')
            payload = data or {}
            def run():
                identity = auth.verify_token(payload.get('token'))
                account = accounts.find_by_auth_identity(identity.provider, identity.subject)
                if account is None:
                    raise PermissionError('Account does not exist.')
                return operation(account.id, payload)
            return await to_thread(run)
        except Exception as exc:
            return error_response(exc)

    @sio.on('tournament:create')
    async def create(sid, data=None):
        return await request(data, lambda account, p: {'tournament': asdict(tournaments.create(
            account, p.get('group_id'), p.get('scheduled_at'), p.get('rules')))})

    @sio.on('tournament:list')
    async def list_tournaments(sid, data=None):
        return await request(data, lambda account, p: {'tournaments': tournaments.list_details(account, p.get('group_id'))})

    @sio.on('tournament:get')
    async def get(sid, data=None):
        return await request(data, lambda account, p: {'tournament': tournaments.details(account, p.get('tournament_id'))})

    @sio.on('tournament:set_attendance_intent')
    async def set_attendance_intent(sid, data=None):
        response = await request(data, lambda account, p: {'tournament': tournaments.set_attendance_intent(
            account, p.get('tournament_id'), p.get('response', p.get('attending')))})
        if 'tournament' in response:
            tournament = response['tournament']
            await sio.emit('tournament:updated', {
                'group_id': tournament['group_id'], 'tournament_id': tournament['id'],
            }, room=f"group-tables:{tournament['group_id']}")
        return response
