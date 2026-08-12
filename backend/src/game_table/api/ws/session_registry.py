# backend/api/ws/session_registry.py

from uuid import uuid4


class SessionRegistry:
    def __init__(self):
        self._sid_to_client_session_id: dict[str, str] = {}
        self._client_session_to_member_id: dict[str, str] = {}

    def bind_connection(self, sid: str, client_session_id: str) -> None:
        self._sid_to_client_session_id[sid] = client_session_id

    def unbind_connection(self, sid: str) -> None:
        self._sid_to_client_session_id.pop(sid, None)

    def has_connection(self, client_session_id: str) -> bool:
        return client_session_id in self._sid_to_client_session_id.values()

    def resolve_client_session_id(self, sid: str) -> str:
        client_session_id = self._sid_to_client_session_id.get(sid)
        if client_session_id is None:
            raise ValueError("Unknown client session.")
        return client_session_id

    def get_or_create_member_id(self, sid: str) -> str:
        client_session_id = self.resolve_client_session_id(sid)

        if client_session_id not in self._client_session_to_member_id:
            self._client_session_to_member_id[client_session_id] = uuid4().hex

        return self._client_session_to_member_id[client_session_id]

    def resolve_member_id(self, sid: str) -> str:
        client_session_id = self.resolve_client_session_id(sid)

        member_id = self._client_session_to_member_id.get(client_session_id)
        if member_id is None:
            raise ValueError("Unknown member.")

        return member_id

    def get_member_id(self, sid: str) -> str | None:
        client_session_id = self.resolve_client_session_id(sid)
        return self._client_session_to_member_id.get(client_session_id)

    def get_member_id_for_client_session(
        self,
        client_session_id: str,
    ) -> str | None:
        return self._client_session_to_member_id.get(client_session_id)

    def get_sids_for_member_id(self, member_id: str) -> list[str]:
        client_session_ids = {
            client_session_id
            for client_session_id, mapped_member_id
            in self._client_session_to_member_id.items()
            if mapped_member_id == member_id
        }

        return [
            sid
            for sid, client_session_id
            in self._sid_to_client_session_id.items()
            if client_session_id in client_session_ids
        ]

    def remove_member_sessions(self, member_id: str) -> None:
        sessions_to_remove = [
            client_session_id
            for client_session_id, mapped_member_id
            in self._client_session_to_member_id.items()
            if mapped_member_id == member_id
        ]

        for client_session_id in sessions_to_remove:
            self._client_session_to_member_id.pop(client_session_id, None)

    def remove_client_session_member(self, client_session_id: str) -> None:
        self._client_session_to_member_id.pop(client_session_id, None)
