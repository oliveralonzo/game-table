"""Authenticated, member-only group activity reads."""
from asyncio import to_thread
from game_table.api.ws.errors import error_response


def register_group_activity_events(sio, account_service, activity_service, auth_verifier):
    @sio.on('group:player_records')
    async def group_player_records(sid, data=None):
        return await read_activity(data, player_records=True)

    @sio.on('group:activity')
    async def group_activity(sid, data=None):
        return await read_activity(data)

    async def read_activity(data, player_records=False):
        try:
            if account_service is None or activity_service is None or auth_verifier is None:
                raise RuntimeError('Group activity is not configured.')
            payload = data or {}
            group_id = payload.get('group_id')
            if not isinstance(group_id, str) or not group_id.strip():
                raise ValueError('Group ID is required.')
            def read():
                identity = auth_verifier.verify_token(payload.get('token'))
                account = account_service.find_by_auth_identity(identity.provider, identity.subject)
                if account is None:
                    raise PermissionError('Account does not exist.')
                if player_records:
                    return activity_service.player_records(account.id, group_id,
                        payload.get('player_id'), payload.get('season', 'current'),
                        payload.get('relationship', 'teammates'), payload.get('sort', 'games_won'),
                        payload.get('page', 1))
                return activity_service.read(account.id, group_id,
                    payload.get('season', 'current'), payload.get('page', 1))
            return await to_thread(read)
        except Exception as exc:
            result = error_response(exc)
            if isinstance(exc, PermissionError) or str(exc) == 'Group does not exist.':
                result['code'] = 'GROUP_ACCESS_DENIED'
            return result
