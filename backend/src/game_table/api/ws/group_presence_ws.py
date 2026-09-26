"""Ephemeral group presence: authenticated members, one entry per connection."""
from asyncio import to_thread
from time import monotonic
from game_table.api.ws.errors import error_response


class GroupPresence:
    def __init__(self, connected, clock=monotonic):
        self.entries = {}
        self.connected = connected
        self.clock = clock

    def touch(self, sid, group_id, account_id):
        self.entries[sid] = (group_id, account_id, self.clock())

    def leave(self, sid, group_id):
        if sid in self.entries and self.entries[sid][0] == group_id:
            self.entries.pop(sid)

    def active(self, group_id):
        now = self.clock()
        self.entries = {sid: entry for sid, entry in self.entries.items()
                        if now - entry[2] < 90 and self.connected(sid)}
        return {account for group, account, _ in self.entries.values() if group == group_id}


def register_group_presence_events(sio, account_service, group_service, auth_verifier, table_registry, sessions=None):
    presence = GroupPresence(lambda sid: sio.manager.is_connected(sid, '/'))
    pending = {}

    @sio.on('group:presence')
    async def update(sid, data=None):
        request = object()
        pending[sid] = request
        try:
            if account_service is None or group_service is None or auth_verifier is None:
                raise RuntimeError('Groups are not configured.')
            payload = data or {}
            group_id = payload.get('group_id')
            if not isinstance(group_id, str) or not group_id.strip():
                raise ValueError('Group ID is required.')
            if sessions:
                account = await sessions.enter(sid, payload)
                if sessions.registry:
                    return sessions.presence_snapshot(group_id)
                account_id = account.id
                member_ids = group_service.admitted_members(group_id)
            def authorize():
                identity = auth_verifier.verify_token(payload.get('token'))
                account = account_service.find_by_auth_identity(identity.provider, identity.subject)
                if account is None:
                    raise PermissionError('Account does not exist.')
                members = group_service.list_members(account.id, group_id)
                return account.id, {member.account_id for member in members}
            if not sessions:
                account_id, member_ids = await to_thread(authorize)
            if pending.get(sid) is not request or not presence.connected(sid):
                return {'group_id': group_id, 'active_members': []}
            presence.touch(sid, group_id, account_id)
            active = presence.active(group_id) & member_ids
            locations = {member.account_id: table.table_code
                         for table in table_registry.for_group(group_id)
                         for member in table.members.values() if member.account_id in active}
            return {'group_id': group_id, 'active_members': [
                {'account_id': account, 'table_code': locations.get(account)} for account in sorted(active)]}
        except Exception as exc:
            if pending.get(sid) is request:
                presence.entries.pop(sid, None)
            return error_response(exc)
        finally:
            if pending.get(sid) is request:
                pending.pop(sid, None)

    @sio.on('group:presence_leave')
    async def leave(sid, data=None):
        pending.pop(sid, None)
        presence.leave(sid, (data or {}).get('group_id'))
        if sessions:
            await sessions.leave(sid, (data or {}).get('group_id'))
        return {'left': True}
