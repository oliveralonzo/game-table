"""Authenticated group-table creation and discovery."""
from asyncio import to_thread
from game_table.api.ws.errors import error_response


def register_group_table_events(sio, accounts, tables, auth):
    async def execute(data, create, close=False):
        try:
            if accounts is None or tables is None or auth is None:
                raise RuntimeError('Groups are not configured.')
            payload = data or {}
            group_id = payload.get('group_id')
            if not isinstance(group_id, str) or not group_id.strip():
                raise ValueError('Group ID is required.')
            def run():
                identity = auth.verify_token(payload.get('token'))
                account = accounts.find_by_auth_identity(identity.provider, identity.subject)
                if account is None:
                    raise PermissionError('Account does not exist.')
                if close:
                    tables.close_empty_table(account.id, group_id, payload.get('table_code'), payload.get('instance_id'))
                    return {'closed': True}
                if create:
                    return {'table': tables.create_table(account.id, group_id)}
                return {'group_id': group_id, 'tables': tables.list_tables(account.id, group_id)}
            return await to_thread(run)
        except Exception as exc:
            response = error_response(exc)
            if isinstance(exc, PermissionError) or str(exc) == 'Group does not exist.':
                response['code'] = 'GROUP_ACCESS_DENIED'
            return response

    @sio.on('group:tables')
    async def list_tables(sid, data=None):
        return await execute(data, False)

    @sio.on('group:create_table')
    async def create_table(sid, data=None):
        result = await execute(data, True)
        if 'table' in result:
            await sio.emit('group:tables_changed')
        return result

    @sio.on('group:close_empty_table')
    async def close_empty_table(sid, data=None):
        result = await execute(data, False, close=True)
        if result.get('closed'):
            await sio.emit('group:tables_changed')
        return result
