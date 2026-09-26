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
from .private_table_permissions import PrivateTablePermissions
from .table_registry import TableRegistry
from .table_session_service import TableSessionService

RulesT = TypeVar("RulesT")

class TableService(TableSessionService[RulesT]):
    """
    Application service for existing private tables.

    Authorizes seating and game starts before invoking shared table operations.
    The public name remains TableService for existing integrations.

    MVP Constraints:
    - In-memory only.
    - Single server instance.
    - Tables fully independent.
    """

    DEFAULT_IDLE_TIMEOUT_SECONDS = 60 * 60 * 24 # 1 hour

    def __init__(
        self,
        idle_timeout_seconds: int = DEFAULT_IDLE_TIMEOUT_SECONDS,
        *,
        registry: TableRegistry | None = None,
    ):
        self._permissions = PrivateTablePermissions()
        self._registry = registry if registry is not None else TableRegistry()
        self._tables = self._registry.private_tables
        self._member_to_table = self._registry.member_to_table
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

        if self._registry.contains(table_code):
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

        self._registry.add(table)
        self._member_to_table[member_id] = table_code
        self._last_activity[table_code] = time.time()

    def create_empty_table(self, creator_identity: str, rules: RulesT | None = None) -> dict:
        if not creator_identity:
            raise ValueError("Creator identity is required.")
        table = self._registry.create_empty(rules=rules, creator_identity=creator_identity)
        self._last_activity[table.table_code] = time.time()
        return self.table_preview(table)

    def join_table(self, member_id, table_code, name, account_id=None, account_username=None, creator_identity=None):
        replaced = super().join_table(member_id, table_code, name, account_id, account_username)
        self._get_table(table_code).claim_reserved_host(member_id, creator_identity)
        return replaced

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


    # ---------------------------- Membership ---------------------------- #


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

        if not self._permissions.can_modify_seat_count(table, member_id):
            raise PermissionError("Only host may add seats.")

        table.add_seat()

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

        if not self._permissions.can_modify_seat_count(table, member_id):
            raise PermissionError("Only host may modify seat count.")

        table.remove_seat()

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

        occupant_id = table.get_seat_occupant(seat_index)
        if occupant_id is None:
            return  # no-op
        if not self._permissions.can_unseat(table, member_id, occupant_id):
            raise PermissionError("Only host may unassign other members.")

        table.unassign_seat(seat_index)

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

        if not self._permissions.can_start_game(table, member_id):
            raise PermissionError("Only host may start the game.")

        player_count = table.prepare_game_start()

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

        if not self._permissions.can_start_game(table, member_id):
            raise PermissionError("Only host may attach the game.")

        table.attach_game(game_id)

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


    # ---------------------------- Lifecycle ---------------------------- #

    
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
