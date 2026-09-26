"""Socket admission and group rooms shared by all group endpoints."""
import asyncio
from asyncio import to_thread


def group_room(group_id):
    return f'group:{group_id}'


class GroupSocketSessions:
    def __init__(self, sio, accounts, groups, auth, *, session_registry=None, tables=None, settings=None):
        self.sio, self.accounts, self.groups, self.auth = sio, accounts, groups, auth
        self.registry, self.tables, self.settings = session_registry, tables, settings
        if self.registry:
            self.registry.presence_coordinator = self
        self.identities = {}
        self.locks = {}
        self.generations = {}
        self.rooms = {}
        self.room_epochs = {}
        # Compose with table disconnect cleanup rather than replacing it.
        previous = sio.handlers.get('/', {}).get('disconnect')

        async def disconnect(sid, *args):
            self.generations.pop(sid, None)
            self.room_epochs.pop(sid, None)
            self.groups.release(f'socket:{sid}')
            self.identities.pop(sid, None)
            self.rooms.pop(sid, None)
            self.locks.pop(sid, None)
            if previous:
                await previous(sid)
        sio.on('disconnect', disconnect)

    async def _account(self, sid, payload):
        if not self.sio.manager.is_connected(sid, "/"):
            raise PermissionError("Connection ended.")
        generation = self.generations.setdefault(sid, object())
        # Verify tokens (including expiry and account switches), but only
        # resolve the database account when its authenticated identity changes.
        identity = await to_thread(self.auth.verify_token, payload.get('token'))
        key = (identity.provider, identity.subject)
        if generation is not self.generations.get(sid):
            raise PermissionError("Connection ended.")
        cached = self.identities.get(sid)
        if cached and cached[0] == key:
            return cached[1]
        account = await to_thread(self.accounts.find_by_auth_identity, *key)
        if account is None:
            raise PermissionError('Account does not exist.')
        if generation != self.generations.get(sid):
            raise PermissionError('Connection ended.')
        if cached and self.registry:
            await self.leave(sid, None)
        self.groups.release(f'socket:{sid}')
        for group_id in self.rooms.pop(sid, set()):
            await self.sio.leave_room(sid, group_room(group_id))
        if generation is not self.generations.get(sid):
            raise PermissionError("Connection ended.")
        self.identities[sid] = (key, account)
        return account

    async def enter(self, sid, payload):
        async with self.locks.setdefault(sid, asyncio.Lock()):
            group_id = payload.get('group_id')
            if not isinstance(group_id, str) or not group_id.strip():
                raise ValueError('Group ID is required.')
            room_epoch = self.room_epochs.setdefault(sid, {}).setdefault(group_id, 0)
            account = await self._account(sid, payload)
            generation = self.generations.get(sid)
            await to_thread(self.groups.admit, account.id, group_id, f'socket:{sid}')
            if generation != self.generations.get(sid):
                self.groups.release(f'socket:{sid}')
                raise PermissionError('Connection ended.')
            if room_epoch != self.room_epochs.get(sid, {}).get(group_id, 0):
                self.groups.release(f"socket:{sid}", group_id)
                raise PermissionError("Group presence ended.")
            self.groups.get_group(account.id, group_id)
            await self.sio.enter_room(sid, group_room(group_id))
            if (generation is not self.generations.get(sid)
                    or room_epoch != self.room_epochs.get(sid, {}).get(group_id, 0)):
                self.groups.release(f'socket:{sid}', group_id)
                await self.sio.leave_room(sid, group_room(group_id))
                raise PermissionError('Group presence ended.')
            self.rooms.setdefault(sid, set()).add(group_id)
            if self.registry:
                await self._set_presence(sid, account.id, group_id)
            return account

    async def list_groups(self, sid, payload):
        async with self.locks.setdefault(sid, asyncio.Lock()):
            account = await self._account(sid, payload)
            generation = self.generations.get(sid)
            groups = await to_thread(self.groups.list_groups, account.id)
            if generation != self.generations.get(sid):
                raise PermissionError('Connection ended.')
            for group in groups:
                self.groups.admit(account.id, group.id, f'socket:{sid}', snapshot=group)
            return groups

    async def leave(self, sid, group_id):
        leave_all = group_id is None
        epochs = self.room_epochs.setdefault(sid, {})
        for target in list(epochs) if leave_all else [group_id]:
            epochs[target] = epochs.get(target, 0) + 1
        if self.registry:
            client = self.registry.resolve_client_session_id(sid)
            current = self.registry.group_presences.get(client)
            if current and (group_id is None or current[1] == group_id):
                group_id = current[1]
                await self._leave_table(sid, only_group=group_id)
                await self.expire_presence(client)
        targets = list(self.rooms.get(sid, set())) if leave_all else [group_id]
        for target in targets:
            await self.sio.leave_room(sid, group_room(target))
            self.rooms.get(sid, set()).discard(target)
        self.groups.release(f'socket:{sid}', None if leave_all else group_id)

    async def _leave_table(self, sid, only_group=None):
        member = self.registry.get_member_id(sid)
        if not member:
            return
        try:
            code = self.tables.get_table_code_for_member(member)
            table = self.tables.get_table(code)
        except ValueError:
            return
        if only_group is not None and table.group_id != only_group:
            return
        from game_table.api.ws.table_ws import leave_member_and_broadcast
        sids = self.registry.get_sids_for_member_id(member)
        await leave_member_and_broadcast(self.sio, self.tables, self.registry, self.settings, member)
        for connection in sids:
            await self.sio.leave_room(connection, code)
            await self.sio.leave_room(connection, f'member:{member}')
            await self.sio.emit('group:presence_left', {'group_id': table.group_id, 'table_code': code}, room=connection)

    async def _set_presence(self, sid, account_id, group_id):
        client = self.registry.resolve_client_session_id(sid)
        current = self.registry.group_presences.get(client)
        if current and current != (account_id, group_id):
            await self.leave(sid, current[1])
        member = self.registry.get_member_id(sid)
        if member:
            code = self.tables.get_table_code_for_member(member)
            if self.tables.get_table(code).group_id != group_id:
                await self._leave_table(sid)
        # Admission already happened through entry or joining a table. Retain
        # that snapshot through the same grace period as table membership.
        snapshot = self.groups.get_group(account_id, group_id)
        self.groups.admit(account_id, group_id, f'presence:{client}', snapshot=snapshot)
        self.registry.group_presences[client] = (account_id, group_id)
        await self.sio.enter_room(sid, group_room(group_id))
        if (self.registry.group_presences.get(client) != (account_id, group_id)
                or sid not in self.registry.get_sids_for_client_session(client)):
            await self.sio.leave_room(sid, group_room(group_id))
            raise PermissionError('Group presence ended.')
        self.rooms.setdefault(sid, set()).add(group_id)

    async def table_entered(self, sid, table, member_id):
        member = table.members[member_id]
        if table.group_id and member.account_id in self.groups.admitted_members(table.group_id):
            await self._set_presence(sid, member.account_id, table.group_id)
        else:
            client = self.registry.resolve_client_session_id(sid)
            await self.expire_presence(client)

    async def restore_presence(self, sid):
        client = self.registry.resolve_client_session_id(sid)
        current = self.registry.group_presences.get(client)
        if current:
            account, group_id = current
            if account in self.groups.admitted_members(group_id):
                await self.sio.enter_room(sid, group_room(group_id))
                self.rooms.setdefault(sid, set()).add(group_id)
            else:
                await self.expire_presence(client)

    async def expire_presence(self, client):
        current = self.registry.group_presences.pop(client, None)
        self.groups.release(f'presence:{client}')
        if current:
            for sid in self.registry.get_sids_for_client_session(client):
                await self.sio.leave_room(sid, group_room(current[1]))
                self.rooms.get(sid, set()).discard(current[1])
                self.groups.release(f'socket:{sid}', current[1])

    def presence_snapshot(self, group_id):
        members = self.groups.admitted_members(group_id)
        active = {}
        for client, (account, group) in self.registry.group_presences.items():
            if group != group_id or account not in members:
                continue
            code = None
            member = self.registry.get_member_id_for_client_session(client)
            if member:
                try:
                    candidate = self.tables.get_table_code_for_member(member)
                    if self.tables.get_table(candidate).group_id == group_id:
                        code = candidate
                except ValueError:
                    pass
            active[account] = code or active.get(account)
        return {'group_id': group_id, 'active_members': [
            {'account_id': account, 'table_code': active[account]} for account in sorted(active)]}

    def chat_sender(self, sid, group_id):
        """Resolve the admitted sender without new authorization or storage reads."""
        if self.registry:
            client = self.registry.resolve_client_session_id(sid)
            presence = self.registry.group_presences.get(client)
            if presence and presence[1] == group_id and group_id in self.rooms.get(sid, set()):
                self.groups.get_group(presence[0], group_id)
                return presence[0]
        identity = self.identities.get(sid)
        if identity is None or group_id not in self.rooms.get(sid, set()):
            raise PermissionError('Enter the group before sending messages.')
        account = identity[1]
        self.groups.get_group(account.id, group_id)
        return account.id

    async def revoke(self, account_id, group_id):
        self.groups.revoke(account_id, group_id)
        affected = {sid for sid, (_, account) in self.identities.items() if account.id == account_id}
        if self.registry:
            for client, presence in list(self.registry.group_presences.items()):
                if presence == (account_id, group_id):
                    affected.update(self.registry.get_sids_for_client_session(client))
                    await self.expire_presence(client)
        for sid in affected:
            await self.sio.leave_room(sid, group_room(group_id))
            self.rooms.get(sid, set()).discard(group_id)
            await self.sio.emit('group:access_revoked', {'group_id': group_id}, room=sid)
