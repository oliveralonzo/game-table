"""
TableService class
Author: Oliver Alonzo
Supported by ChatGPT (GPT-5)
Date: 2026-02-21
Version: 0.2

Application-layer service coordinating Table aggregates.

Responsibilities:
- Maintain in-memory registry of tables.
- Enforce lifecycle rules (idle cleanup, empty destruction).
- Delegate invariant enforcement to Table.

Design:
- Application-layer boundary.
- Owns aggregate registry.
- Owns session mapping.
- No domain rule duplication.
"""

from typing import Dict, Generic, TypeVar
from uuid import uuid4
import time

from game_table.table.table import Table

RulesT = TypeVar("RulesT")

class TableService(Generic[RulesT]):
    """
    Application-layer aggregate manager for Table.

    MVP Constraints:
    - In-memory only.
    - Single server instance.
    - Tables fully independent.
    """

    DEFAULT_IDLE_TIMEOUT_SECONDS = 60 * 60 * 24 # 1 hour

    def __init__(
        self,
        idle_timeout_seconds: int = DEFAULT_IDLE_TIMEOUT_SECONDS,
    ):
        self._tables: Dict[str, Table[RulesT]] = {}
        self._member_to_table: Dict[str, str] = {}
        self._last_activity: Dict[str, float] = {}
        self._idle_timeout_seconds: int = idle_timeout_seconds


    # ---------------------------- Table Control ---------------------------- #

    def create_table(
        self,
        member_id: str,
        table_code: str,
        host_name: str | None = None,
        account_id: str | None = None,
        account_username: str | None = None,
        rules: RulesT | None = None,
    ) -> None:
        """
        Create a new table and assign creator as host.

        Rules:
        - Table code must be unique.
        - Member must not already belong to a table.
        - Host must provide a non-empty display name.
        - Creator becomes host.
        """

        if table_code in self._tables:
            raise ValueError("Table already exists.")

        if member_id in self._member_to_table:
            raise ValueError("Member already belongs to a table.")

        table = Table(
            table_code=table_code,
            host_member_id=member_id,
            host_name=host_name or member_id,
            host_account_id=account_id,
            host_account_username=account_username,
            rules=rules,
        )

        self._tables[table_code] = table
        self._member_to_table[member_id] = table_code
        self._last_activity[table_code] = time.time()

    def delete_table(self, member_id: str, table_code: str) -> str | None:
        """
        Manually delete a table.

        Returns:
            active_game_id if a game was attached, otherwise None.

        Rules:
        - Table must exist.
        - Acting member must belong to the specified table.
        - Acting member must be host.
        """

        table = self._get_table(table_code)

        member_table_code, _ = self._get_table_for_member(member_id)

        if member_table_code != table_code:
            raise ValueError("Acting member not in specified table.")

        if table.host_id != member_id:
            raise PermissionError("Only host may delete table.")

        active_game_id = table.active_game_id

        # Remove all identity mappings for this table
        self._remove_table_identities(table_code)

        # Remove table and lifecycle tracking
        self._tables.pop(table_code, None)
        self._last_activity.pop(table_code, None)

        return active_game_id


    def get_table(self, table_code: str) -> Table:
        return self._get_table(table_code)

    # ---------------------------- Membership ---------------------------- #

    def join_table(
        self,
        member_id: str,
        table_code: str,
        name: str,
        account_id: str | None = None,
        account_username: str | None = None,
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

    def leave_table(self, member_id: str) -> None:
        """
        Leave the current table.

        Rules:
        - Member must belong to a table.
        - If table becomes empty and not persistent, destroy it.
        """

        table_code, table = self._get_table_for_member(member_id)

        table.remove_member(member_id)

        self._remove_member_identity(member_id)

        # Update activity
        self._last_activity[table_code] = time.time()

        self._maybe_destroy_table(table_code)


    def remove_member(self, member_id: str, target_member_id: str) -> None:
        """
        Remove another member from the table.

        Rules:
        - Acting member must belong to a table.
        - Acting member must be host (enforced by domain).
        - Target member must belong to same table.
        - If table becomes empty and not persistent, destroy it.
        """

        table_code, table = self._get_table_for_member(member_id)

        # Ensure target is in same table
        if self._member_to_table.get(target_member_id) != table_code:
            raise ValueError("Target member not in same table.")

        # Delegate host enforcement to domain
        table.remove_member(target_member_id)

        self._remove_member_identity(target_member_id)

        self._last_activity[table_code] = time.time()

        self._maybe_destroy_table(table_code)


    def transfer_host(self, member_id: str, new_host_id: str) -> None:
        """
        Transfer host role to another member.

        Rules:
        - Acting connection must be bound.
        - Acting member must belong to a table.
        - New host must belong to the same table.
        - Domain enforces host permission and validity.
        """

        table_code, table = self._get_table_for_member(member_id)

        # Ensure new host is in same table
        if self._member_to_table.get(new_host_id) != table_code:
            raise ValueError("New host must belong to same table.")

        table.transfer_host(member_id, new_host_id)

        self._last_activity[table_code] = time.time()


    # ---------------------------- Seat Control ---------------------------- #

    def add_seat(self, member_id: str) -> None:
        """
        Add a seat to the current table.

        Rules:
        - Acting member must belong to a table.
        - Only host may add seats.
        - Domain enforces:
            - Table state (must be OPEN)
            - MAX_SEATS constraint
        - Updates last activity timestamp.
        """

        table_code, table = self._get_table_for_member(member_id)

        table.add_seat(member_id)

        self._last_activity[table_code] = time.time()


    def remove_seat(self, member_id: str) -> None:
        """
        Remove the last seat from the current table.

        Rules:
        - Acting member must belong to a table.
        - Only host may remove seats.
        - Domain enforces:
            - MIN_SEATS constraint
            - No active game
            - Automatic unassignment of last seat
        - Updates last activity timestamp.
        """

        table_code, table = self._get_table_for_member(member_id)

        table.remove_seat(member_id)

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


    def unassign_seat(self, member_id: str, seat_index: int) -> None:
        """
        Unassign a seat.

        Rules:
        - Acting member must belong to a table.
        - Members may unassign themselves.
        - Host may unassign any seat.
        - Domain enforces:
            - Valid seat index
            - Game state transitions (block)
            - Permission cleanup
        - Updates last activity timestamp.
        """

        table_code, table = self._get_table_for_member(member_id)

        # Determine occupant
        if not (0 <= seat_index < table.seat_count):
            raise ValueError("Invalid seat index.")

        seat = table._seats[seat_index]  # application-level read only

        if seat.member_id is None:
            return  # no-op

        # Permission rule (application layer)
        if seat.member_id != member_id and table.host_id != member_id:
            raise PermissionError("Only host may unassign other members.")

        table.unassign_seat(seat_index=seat_index)

        self._last_activity[table_code] = time.time()


    # ---------------------------- Configuration ---------------------------- #

    def update_rules(self, member_id: str, rules: RulesT) -> None:
        """
        Update pending game rules.

        Rules:
        - Acting member must belong to a table.
        - Domain enforces:
            - Host-only restriction
            - OPEN state requirement
        - Updates last activity timestamp.
        """

        table_code, table = self._get_table_for_member(member_id)

        table.update_rules(member_id, rules)

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


    # ---------------------------- Game Control ---------------------------- #

    def prepare_game_start(self, member_id: str) -> dict:
        """
        Validate that a game may start and return data required
        for composition-layer game creation.

        Returns:
        {
            "table_code": str,
            "player_count": int,
            "config": dict
        }
        """

        table_code, table = self._get_table_for_member(member_id)

        player_count = table.prepare_game_start(member_id)

        self._last_activity[table_code] = time.time()

        return {
            "table_code": table_code,
            "player_count": player_count,
            "rules": table.pending_rules,
        }


    def attach_game(self, member_id: str, game_id: str) -> None:
        """
        Attach externally created game_id to table.
        """

        table_code, table = self._get_table_for_member(member_id)

        table.attach_game(member_id, game_id)

        self._last_activity[table_code] = time.time()

    def detach_game(self, member_id: str) -> None:
        """
        Detach (end) the current game.

        Rules:
        - Acting member must belong to a table.
        - Domain enforces:
            - Host-only restriction
            - Game existence
        - Updates last activity timestamp.
        """

        table_code, table = self._get_table_for_member(member_id)

        game_id = table.active_game_id
        table.detach_game(member_id)

        self._last_activity[table_code] = time.time()

        return game_id

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


    # ---------------------------- Persistence ---------------------------- #

    def mark_persistent(self, member_id: str) -> None:
        """
        Mark current table as persistent.

        Rules:
        - Acting member must belong to a table.
        - Domain enforces host-only restriction.
        - Updates last activity timestamp.
        """

        table_code, table = self._get_table_for_member(member_id)

        table.mark_persistent(member_id)

        self._last_activity[table_code] = time.time()


    def unmark_persistent(self, member_id: str) -> None:
        """
        Remove persistence flag from current table.

        Rules:
        - Acting member must belong to a table.
        - Domain enforces host-only restriction.
        - Updates last activity timestamp.
        """

        table_code, table = self._get_table_for_member(member_id)

        table.unmark_persistent(member_id)

        self._last_activity[table_code] = time.time()


    # ---------------------------- Hand Visibility ---------------------------- #

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

    # ---------------------------- Table Listing ---------------------------- #

    def list_tables(self) -> list[Dict[str, object]]:
        """
        Return metadata for all tables.

        Rules:
        - Read-only operation.
        - Does not expose domain internals.
        - Suitable for lobby UI listing.
        """

        result = []

        for table_code, table in self._tables.items():
            member_count = sum(
                1 for code in self._member_to_table.values()
                if code == table_code
            )

            host_member = table.members.get(table.host_id)

            result.append({
                "table_code": table_code,
                "state": table.state.value,
                "member_count": member_count,
                "seat_count": table.seat_count,
                "active_game_id": table.active_game_id,
                "has_game": table.active_game_id is not None,
                "is_persistent": table.is_persistent,
                "host_name": host_member.name if host_member else None,
            })

        return result

    # ---------------------------- Read Models ---------------------------- #

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
            "host_id": table.host_id,
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

    # ---------------------------- Lifecycle ---------------------------- #

    def table_exists(self, table_code: str) -> bool:
        """
        Check whether a table currently exists.

        Rules:
        - Pure read operation.
        - Does not raise.
        - Application-layer boundary (no domain leakage).
        """
        return table_code in self._tables
    
    def cleanup_idle_tables(self) -> None:
        """
        Destroy tables that exceed idle timeout
        unless marked persistent.

        Rules:
        - Pure application-layer lifecycle enforcement.
        - Persistent tables are never auto-destroyed.
        - All identity mappings are removed.
        """

        now = time.time()

        tables_to_remove = []

        for table_code, last in self._last_activity.items():
            if now - last < self._idle_timeout_seconds:
                continue

            table = self._tables.get(table_code)
            if table is None:
                continue

            if table.is_persistent:
                continue

            tables_to_remove.append(table_code)

        for table_code in tables_to_remove:
            self._remove_table_identities(table_code)
            self._tables.pop(table_code, None)
            self._last_activity.pop(table_code, None)


    # ---------------------------- Identity Helpers ---------------------------- #

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

    def _maybe_destroy_table(self, table_code: str) -> None:
        """
        Destroy table if it has no remaining members
        and is not marked persistent.
        """

        table = self._tables.get(table_code)
        if table is None:
            return

        if table.is_persistent:
            return

        # Check if any member still mapped to this table
        has_members = any(
            code == table_code
            for code in self._member_to_table.values()
        )

        if not has_members:
            self._tables.pop(table_code, None)
            self._last_activity.pop(table_code, None)

    def _get_table(self, table_code: str) -> Table:
        if table_code not in self._tables:
            raise ValueError("Table does not exist.")
        return self._tables[table_code]

    def _get_table_for_member(self, member_id: str) -> tuple[str, Table]:
        if member_id not in self._member_to_table:
            raise ValueError("Member not associated with any table.")
        table_code = self._member_to_table[member_id]
        return table_code, self._tables[table_code]

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
