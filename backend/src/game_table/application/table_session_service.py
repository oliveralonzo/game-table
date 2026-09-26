"""Shared table sessions, seating, snapshots, and hand visibility.

Private/group services own authorization and lifecycle decisions.
"""
import time
from typing import Dict, Generic, TypeVar
from game_table.table.table import Table

RulesT = TypeVar("RulesT")


class TableSessionService(Generic[RulesT]):
    def __init__(self, tables, member_to_table):
        self._tables = tables
        self._member_to_table = member_to_table
        self._last_activity: dict[str, float] = {}

    @staticmethod
    def table_preview(table: Table) -> dict:
        return {
            'table_code': table.table_code, 'instance_id': table.instance_id,
            'group_id': table.group_id, 'host_id': table.host_id, 'state': table.state.value,
            'seat_count': table.seat_count, 'seats': [seat.member_id for seat in table.seats],
            'members': [{'member_id': key, 'name': member.name, 'account_username': member.account_username}
                        for key, member in table.members.items()],
        }

    def get_table(self, table_code: str) -> Table:
        return self._get_table(table_code)


    def join_table(
        self,
        member_id: str,
        table_code: str,
        name: str,
        account_id: str | None = None,
        account_username: str | None = None,
        creator_identity: str | None = None,
    ) -> str | None:
        """
        Join an existing table as a new member.

        Rules:
        - Table must exist.
        - Member must not already belong to a table.

        Returns:
            removed_member_id if this join replaced an existing member with the
            same account in the same table.
        """

        if table_code not in self._tables:
            raise ValueError("Table does not exist.")

        if member_id in self._member_to_table:
            raise ValueError("Member already belongs to a table.")

        table = self._tables[table_code]
        removed_member_id = table.find_member_id_by_account_id(account_id)

        if removed_member_id is not None:
            table.replace_member_id(
                old_member_id=removed_member_id,
                new_member_id=member_id,
                account_id=account_id,
                account_username=account_username,
            )
            self._remove_member_identity(removed_member_id)
        else:
            table.add_member(
                member_id=member_id,
                name=name,
                account_id=account_id,
                account_username=account_username,
            )

        self._member_to_table[member_id] = table_code
        self._last_activity[table_code] = time.time()
        return removed_member_id


    def update_name(self, member_id: str, name: str) -> None:
        """
        Update acting member's display name.

        Rules:
        - Member must belong to a table.
        - Domain enforces member existence, non-empty name, and uniqueness.
        - Updates last activity timestamp.
        """

        table_code, table = self._get_table_for_member(member_id)

        table.update_name(
            member_id=member_id,
            name=name,
        )

        self._last_activity[table_code] = time.time()


    def assign_seat(self, member_id: str, seat_index: int) -> None:
        """
        Assign acting member to a seat.

        Rules:
        - Acting member must belong to a table.
        - Domain enforces:
            - Member existence
            - Valid seat index
            - Seat vacancy
            - Single-seat constraint
            - Game state transitions (block/resume)
        - Updates last activity timestamp.
        """

        table_code, table = self._get_table_for_member(member_id)

        table.assign_seat(member_id=member_id, seat_index=seat_index)

        self._last_activity[table_code] = time.time()


    def get_pending_rules(self, table_code: str) -> RulesT | None:
        """
        Retrieve pending configuration.

        Rules:
        - Table must exist.
        - Read-only operation.
        """

        table = self._get_table(table_code)
        return table.pending_rules


    def validate_game_end(self, member_id: str, *, completed: bool = False) -> None:
        _, table = self._get_table_for_member(member_id)
        if table.host_id != member_id:
            raise PermissionError("Only host may detach the game.")
        if table.active_game_id is None:
            raise ValueError("No active game.")

    def get_seat_account_participants(self, table_code: str) -> list[dict]:
        table = self._get_table(table_code)
        participants = []

        for seat in table.seats:
            if seat.member_id is None:
                continue

            member = table.members[seat.member_id]
            participants.append({
                "member_id": member.member_id,
                "account_id": member.account_id,
                "seat_index": seat.index,
            })

        return participants


    def block_game(self, member_id: str) -> None:
        """
        Explicitly block the current game.

        Rules:
        - Acting member must belong to a table.
        - Domain enforces:
            - Game existence
            - Current state is IN_GAME
        - No host restriction (per spec: everyone may block).
        - Updates last activity timestamp.
        """

        table_code, table = self._get_table_for_member(member_id)

        table.block_game()

        self._last_activity[table_code] = time.time()


    def resume_game(self, member_id: str) -> None:
        """
        Explicitly resume a blocked game.

        Rules:
        - Acting member must belong to a table.
        - Domain enforces:
            - Game existence
            - Current state is GAME_BLOCKED
            - All seats filled
        - No host restriction (per spec: everyone may resume).
        - Updates last activity timestamp.
        """

        table_code, table = self._get_table_for_member(member_id)

        table.resume_game()

        self._last_activity[table_code] = time.time()


    def enable_hand_visibility(self, member_id: str) -> None:
        """
        Enable visibility of acting member's hand.

        Rules:
        - Acting member must belong to a table.
        - Domain enforces:
            - Game existence
            - Acting member is seated
        - Updates last activity timestamp.
        """

        table_code, table = self._get_table_for_member(member_id)
        
        table.enable_hand_visibility(member_id)

        self._last_activity[table_code] = time.time()


    def disable_hand_visibility(self, member_id: str) -> None:
        """
        Disable visibility of acting member's hand.

        Rules:
        - Acting member must belong to a table.
        - Domain enforces:
            - Game existence
            - Acting member is seated
        - Updates last activity timestamp.
        """

        table_code, table = self._get_table_for_member(member_id)

        table.disable_hand_visibility(member_id)

        self._last_activity[table_code] = time.time()


    def grant_hand_view(self, member_id: str, viewer_id: str) -> None:
        """
        Grant a viewer permission to see acting member's hand.

        Rules:
        - Acting member must belong to a table.
        - Viewer must belong to the same table.
        - Domain enforces:
            - Game existence
            - Acting member is seated
            - Viewer existence
            - Viewer is not seated
            - Acting member cannot grant to self
        - Updates last activity timestamp.
        """

        table_code, table = self._get_table_for_member(member_id)

        self._ensure_member_in_same_table(viewer_id, table_code)

        table.grant_hand_view(member_id, viewer_id)

        self._last_activity[table_code] = time.time()


    def revoke_hand_view(self, member_id: str, viewer_id: str) -> None:
        """
        Revoke a viewer's permission to see acting member's hand.

        Rules:
        - Acting member must belong to a table.
        - Viewer must belong to the same table.
        - Domain enforces:
            - Game existence
            - Acting member is seated
            - Viewer existence
            - Viewer is not seated
            - Acting member cannot revoke self
        - Updates last activity timestamp.
        """

        table_code, table = self._get_table_for_member(member_id)

        self._ensure_member_in_same_table(viewer_id, table_code)

        table.revoke_hand_view(member_id, viewer_id)

        self._last_activity[table_code] = time.time()


    def can_view_hand(self, table_code: str, player_id: str, viewer_id: str) -> bool:
        """
        Check whether viewer may see player's hand.

        Rules:
        - Table must exist.
        - Both members must belong to the specified table.
        - Pure read operation.
        """

        table = self._get_table(table_code)

        self._ensure_member_in_same_table(player_id, table_code)
        self._ensure_member_in_same_table(viewer_id, table_code)

        return table.can_view_hand(player_id, viewer_id)


    def get_table_view(self, table_code: str) -> Dict[str, object]:
        """
        Return full transport-safe view of a table.

        Rules:
        - Table must exist.
        - Read-only operation.
        - Explicit projection (no domain leakage).
        """

        table = self._get_table(table_code)

        # Members (identity-keyed)
        members = {
            member_id: {
                "name": member.name,
                "account_id": member.account_id,
                "account_username": member.account_username,
            }
            for member_id, member in table.members.items()
        }

        # Positional seats
        seats = [seat.member_id for seat in table.seats]

        return {
            "table_code": table.table_code,
            "instance_id": table.instance_id,
            "host_id": table.host_id,
            "group_id": table.group_id,
            "members": members,
            "seats": seats,
            "seat_count": table.seat_count,
            "state": table.state.value,
            "is_persistent": table.is_persistent,
            "pending_rules": table.pending_rules,
            "active_game_id": table.active_game_id,
            "has_game": table.active_game_id is not None,
            "hand_view_grants": table.get_hand_view_grants(),
        }


    def get_table_member_name_for_account(
        self,
        table_code: str,
        account_id: str,
    ) -> str | None:
        table = self._get_table(table_code)
        member_id = table.find_member_id_by_account_id(account_id)
        if member_id is None:
            return None

        return table.members[member_id].name


    def table_exists(self, table_code: str) -> bool:
        """
        Check whether a table currently exists.

        Rules:
        - Pure read operation.
        - Does not raise.
        - Application-layer boundary (no domain leakage).
        """
        return table_code in self._tables


    def _remove_member_identity(self, member_id: str) -> None:
        """
        Remove member → table mapping.
        """

        self._member_to_table.pop(member_id, None)


    def _remove_table_identities(self, table_code: str) -> None:
        """
        Remove all identity mappings associated with a table.

        Cleans:
        - member_id → table_code mappings
        """

        members_to_remove = [
            member_id
            for member_id, code in self._member_to_table.items()
            if code == table_code
        ]

        for member_id in members_to_remove:
            self._remove_member_identity(member_id)


    def _find_table_member_by_account_id(
        self,
        table: Table,
        account_id: str | None,
    ) -> str | None:
        if not account_id:
            return None

        for member_id, member in table.members.items():
            if member.account_id == account_id:
                return member_id

        return None


    def _get_table(self, table_code: str) -> Table:
        if table_code not in self._tables:
            raise ValueError("Table does not exist.")
        return self._tables[table_code]


    def _get_table_for_member(self, member_id: str) -> tuple[str, Table]:
        if member_id not in self._member_to_table:
            raise ValueError("Member not associated with any table.")
        table_code = self._member_to_table[member_id]
        return table_code, self._get_table(table_code)


    def _ensure_member_in_same_table(self, member_id: str, table_code: str) -> None:
        """
        Ensure that a member belongs to the specified table.

        Application-layer boundary guard.
        """

        if self._member_to_table.get(member_id) != table_code:
            raise ValueError("Member must belong to same table.")


    def get_table_code_for_member(self, member_id: str) -> str:
        table_code, _ = self._get_table_for_member(member_id)
        return table_code


    def get_seat_index_for_member(self, member_id: str) -> int | None:
        _, table = self._get_table_for_member(member_id)

        for seat in table.seats:
            if seat.member_id == member_id:
                return seat.index

        return None


