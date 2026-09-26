"""Authenticated read-only group requests."""

from asyncio import to_thread

from game_table.api.ws.errors import error_response


def register_group_events(sio, account_service, group_service, auth_verifier, settings_provider=None):
    @sio.on('group:list')
    async def list_groups(sid, data=None):
        try:
            if account_service is None or group_service is None or auth_verifier is None:
                raise RuntimeError('Groups are not configured.')
            token = (data or {}).get('token')

            def read_groups():
                identity = auth_verifier.verify_token(token)
                account = account_service.find_by_auth_identity(identity.provider, identity.subject)
                if account is None:
                    return {'groups': []}
                return {'groups': [
                    {'id': group.id, 'public_id': group.public_id, 'name': group.name, 'member_count': group.member_count}
                    for group in group_service.list_groups(account.id)
                ]}

            return await to_thread(read_groups)
        except Exception as exc:
            return error_response(exc)

    @sio.on('group:members')
    async def group_members(sid, data=None):
        try:
            if account_service is None or group_service is None or auth_verifier is None:
                raise RuntimeError('Groups are not configured.')
            payload = data or {}
            group_id = payload.get('group_id')
            if not isinstance(group_id, str) or not group_id.strip():
                raise ValueError('Group ID is required.')

            def read_members():
                identity = auth_verifier.verify_token(payload.get('token'))
                account = account_service.find_by_auth_identity(identity.provider, identity.subject)
                if account is None:
                    raise PermissionError('Account does not exist.')
                members = group_service.list_members(account.id, group_id)
                return {'group_id': group_id, 'members': [
                    {'account_id': member.account_id, 'username': member.username,
                     'name': member.table_nickname or member.username,
                     'is_self': member.account_id == account.id}
                    for member in members
                ]}
            return await to_thread(read_members)
        except Exception as exc:
            response = error_response(exc)
            if isinstance(exc, PermissionError) or str(exc) == 'Group does not exist.':
                response['code'] = 'GROUP_ACCESS_DENIED'
            return response

    async def settings_request(data, update=False):
        try:
            if not all((account_service, group_service, auth_verifier, settings_provider)):
                raise RuntimeError('Group settings are not configured.')
            payload = data or {}
            def run():
                identity = auth_verifier.verify_token(payload.get('token'))
                account = account_service.find_by_auth_identity(identity.provider, identity.subject)
                if account is None:
                    raise PermissionError('Account does not exist.')
                group_id = payload.get('group_id')
                group = group_service.get_group(account.id, group_id)
                if update:
                    rules = settings_provider.parse_settings(payload.get('rules'))
                    group_service.update_defaults(account.id, group_id,
                        settings_provider.serialize_settings(rules), payload.get('seat_count'))
                    group = group_service.get_group(account.id, group_id)
                rules = (settings_provider.parse_settings(group.default_rules) if group.default_rules is not None
                         else settings_provider.default_settings())
                return {'rules': settings_provider.serialize_settings(rules), 'seat_count': group.default_seat_count,
                        'can_edit': group.membership_for(account.id).role.value in ('owner', 'admin')}
            return await to_thread(run)
        except Exception as exc:
            return error_response(exc)

    @sio.on('group:settings')
    async def group_settings(sid, data=None):
        return await settings_request(data)

    @sio.on('group:update_settings')
    async def update_group_settings(sid, data=None):
        return await settings_request(data, update=True)
