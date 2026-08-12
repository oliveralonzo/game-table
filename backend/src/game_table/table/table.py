"""
Table class
Author: Oliver Alonzo
Supported by ChatGPT (GPT-5)
Date: 2026-02-15
Version: 0.1

Manages table lifecycle, membership, seating, host control,
and the attachment/detachment of a single Game instance.

Responsibilities:
- Maintain members (host + viewers + players).
- Enforce seat constraints (min 2, max 4).
- Control host transfer and table closure.
- Attach, block, resume, and detach a Game by ID.
- Halt game automatically if a required seat becomes empty.

Design:
- Aggregate root.
- All mutations occur through Table methods.
- Members and Seats are governed entities.
- Game is attached but not owned conceptually.
"""


from enum import Enum
from typing import Dict, Generic, List, Optional, Set, TypeVar


RulesT = TypeVar("RulesT")


# ----------------------------- Enumerations ----------------------------- #

class TableState(str, Enum):
    OPEN = "open"
    IN_GAME = "in_game"
    GAME_BLOCKED = "game_blocked"


# ------------------------------- Skeleton ------------------------------- #

class Table(Generic[RulesT]):
    """
    Aggregate root for table domain.

    Invariants:
    - Exactly one host while table is OPEN/IN_GAME/GAME_BLOCKED.
    - Seat count between 2 and 4.
    - At most one active Game attached.
    - Game cannot exist without fully populated seats at start.
    """

    MIN_SEATS = 2
    MAX_SEATS = 4

    def __init__(
        self,
        table_code: str,
        host_member_id: str,
        host_name: str | None = None,
        host_account_id: str | None = None,
        host_account_username: str | None = None,
        rules: RulesT | None = None,
    ):
        """
        Create a new Table aggregate.

        Invariants enforced at construction:
        - Table must be created with exactly one host.
        - Host must have a non-empty display name.
        """

        if not host_member_id:
            raise ValueError("Host member_id is required.")

        resolved_host_name = host_name or host_member_id

        if not resolved_host_name or not resolved_host_name.strip():
            raise ValueError("Host name is required.")

        self.table_code: str = table_code

        self._state: TableState = TableState.OPEN

        self._members: Dict[str, "Member"] = {}
        self._seats: List["Seat"] = []

        self._host_id: Optional[str] = None
        self._active_game_id: Optional[str] = None
        self._pending_rules = rules

        self._hand_view_permissions: Dict[str, Set[str]] = {}
        self._hand_visibility_enabled: Set[str] = set()

        self._is_persistent: bool = False

        self._initialize_default_seats()
        self._add_initial_host(
            host_member_id,
            resolved_host_name,
            host_account_id,
            host_account_username,
        )


    # ------------------------- Internal Setup -------------------------- #

    def _initialize_default_seats(self) -> None:
        """
        Initialize table with maximum number of seats.

        Default design:
        - Table starts at MAX_SEATS.
        - Host may reduce later (within bounds).
        """
        self._seats = [Seat(index=i) for i in range(self.MAX_SEATS)]


    def _add_initial_host(
        self,
        member_id: str,
        name: str,
        account_id: str | None = None,
        account_username: str | None = None,
    ) -> None:
        """
        Create and register the initial host member.

        Invariant:
        - Table must always have exactly one host while not CLOSED.
        - Host must have a non-empty display name.
        """

        if member_id in self._members:
            raise ValueError("Host already exists in members.")

        clean_name = name.strip()
        if not clean_name:
            raise ValueError("Host name is required.")

        host = Member(
            member_id=member_id,
            name=clean_name,
            account_id=account_id,
            account_username=account_username,
        )
        self._members[member_id] = host
        self._host_id = member_id


    # ---------------------------- Properties --------------------------- #

    @property
    def state(self) -> TableState:
        return self._state

    @property
    def seat_count(self) -> int:
        return len(self._seats)

    @property
    def members(self) -> Dict[str, "Member"]:
        return self._members.copy()

    @property
    def seats(self) -> List["Seat"]:
        return list(self._seats)

    @property
    def host_id(self) -> str:
        return self._host_id

    @property
    def active_game_id(self) -> Optional[str]:
        return self._active_game_id


    @property
    def pending_rules(self) -> RulesT | None:
        return self._pending_rules

    @property
    def is_persistent(self) -> bool:
        """
        Whether this table is marked to survive idle cleanup.
        """
        return self._is_persistent



    # -------------------------- Member Control ------------------------- #

    ## NEEDS TO CHECK FOR DUPLICATE NAMES
    ## ALSO MISSING: A METHOD TO UPDATE NAME

    def add_member(
        self,
        member_id: str,
        name: str,
        account_id: str | None = None,
        account_username: str | None = None,
    ) -> None:
        """
        Add a new member to the table.

        Rules:
        - Member ID must be unique.
        - Display name must be non-empty.
        - Display name must be unique within the table (case-insensitive).
        - Adding a member does not assign a seat.
        """
        if member_id in self._members:
            raise ValueError("Member already exists.")

        clean_name = name.strip()
        if not clean_name:
            raise ValueError("Name is required.")

        for m in self._members.values():
            if m.name.lower() == clean_name.lower():
                raise ValueError("Name already taken.")

        self._members[member_id] = Member(
            member_id=member_id,
            name=clean_name,
            account_id=account_id,
            account_username=account_username,
        )

    def find_member_id_by_account_id(self, account_id: str | None) -> str | None:
        if not account_id:
            return None

        for member_id, member in self._members.items():
            if member.account_id == account_id:
                return member_id

        return None

    def replace_member_id(
        self,
        old_member_id: str,
        new_member_id: str,
        account_id: str,
        account_username: str | None = None,
    ) -> None:
        self._ensure_member_exists(old_member_id)

        if new_member_id in self._members:
            raise ValueError("Member already exists.")

        old_member = self._members[old_member_id]
        if old_member.account_id != account_id:
            raise ValueError("Member does not represent account.")

        self._members[new_member_id] = Member(
            member_id=new_member_id,
            name=old_member.name,
            account_id=account_id,
            account_username=account_username or old_member.account_username,
        )
        del self._members[old_member_id]

        if self._host_id == old_member_id:
            self._host_id = new_member_id

        for seat in self._seats:
            if seat.member_id == old_member_id:
                seat.member_id = new_member_id

        if old_member_id in self._hand_view_permissions:
            self._hand_view_permissions[new_member_id] = (
                self._hand_view_permissions.pop(old_member_id)
            )

        for viewers in self._hand_view_permissions.values():
            if old_member_id in viewers:
                viewers.discard(old_member_id)
                viewers.add(new_member_id)

        if old_member_id in self._hand_visibility_enabled:
            self._hand_visibility_enabled.discard(old_member_id)
            self._hand_visibility_enabled.add(new_member_id)

    def update_name(self, member_id: str, name: str) -> None:
        """
        Update a member's display name.

        Rules:
        - Member must exist.
        - Display name must be non-empty.
        - Display name must be unique within the table, case-insensitive.
        """

        self._ensure_member_exists(member_id)

        clean_name = name.strip()
        if not clean_name:
            raise ValueError("Name is required.")

        for other_member_id, member in self._members.items():
            if other_member_id == member_id:
                continue

            if member.name.lower() == clean_name.lower():
                raise ValueError("Name already taken.")

        self._members[member_id].name = clean_name


    def remove_member(self, member_id: str) -> None:
        """
        Remove a member from the table.

        Rules:
        - Member must exist.
        - If the removed member is host and other members remain,
        host is automatically transferred to another member.
        - If member occupies a seat, it becomes empty.
        - If a game is active and a seated member leaves,
        the game is automatically blocked.
        - Hand view permissions referencing this member are cleaned up.
        """

        self._ensure_member_exists(member_id)

        was_host = member_id == self._host_id

        # If seated, unassign seat
        seat_index = self._find_seat_by_member(member_id)
        if seat_index is not None:
            self._seats[seat_index].member_id = None

            # If game running, block it
            if self._state == TableState.IN_GAME:
                self._state = TableState.GAME_BLOCKED

            # Remove player-specific permission key
            if member_id in self._hand_view_permissions:
                del self._hand_view_permissions[member_id]

        self._remove_member_from_hand_view_permissions(member_id)

        self._hand_visibility_enabled.discard(member_id)

        # Remove from members
        del self._members[member_id]

        # Host transfer logic (domain-level responsibility)
        if was_host and self._members:
            # Deterministic transfer: first remaining member
            self._host_id = next(iter(self._members.keys()))


    def transfer_host(self, acting_member_id: str, new_host_id: str) -> None:
        """
        Transfer host role.

        Rules:
        - Only current host may transfer.
        - New host must exist.
        - Cannot transfer to self.
        """

        self._ensure_host(acting_member_id, "Only host may transfer host role.")

        if new_host_id not in self._members:
            raise ValueError("New host must be an existing member.")

        if new_host_id == self._host_id:
            raise ValueError("Member is already host.")

        self._host_id = new_host_id


    # --------------------------- Seat Control -------------------------- #

    def add_seat(self, acting_member_id: str) -> None:
        """
        Add one seat to the table.

        Rules:
        - Only host may add seats.
        - Table must be OPEN.
        - Cannot exceed MAX_SEATS.
        """

        self._ensure_host(acting_member_id, "Only host may add seats.")

        self._ensure_state(TableState.OPEN, "Seats can only be modified while table is open.")

        if self.seat_count >= self.MAX_SEATS:
            raise ValueError("Maximum seat count reached.")

        new_index = len(self._seats)
        self._seats.append(Seat(index=new_index))


    def remove_seat(self, acting_member_id: str) -> None:
        """
        Remove the last seat.

        Rules:
        - Only host may modify seat count.
        - Seat count may not go below MIN_SEATS.
        - Cannot modify seats while a game exists.
        - If seat is occupied, member is automatically unassigned.
        """

        self._ensure_host(acting_member_id, "Only host may modify seat count.")

        self._ensure_no_game_exists("Cannot modify seats while a game exists.")

        if self.seat_count <= self.MIN_SEATS:
            raise ValueError("Cannot go below minimum seat count.")

        last_seat = self._seats[-1]

        # Automatically unassign if occupied
        last_seat.member_id = None

        self._seats.pop()


    def assign_seat(self, member_id: str, seat_index: int) -> None:
        """
        Assign a member to a seat.

        Rules:
        - Member must exist.
        - Seat index must be valid.
        - Seat must be empty.
        - Member may occupy at most one seat.
        - If a blocked game becomes fully seated again,
        it may resume.
        """

        if member_id not in self._members:
            raise ValueError("Member does not exist.")

        self._ensure_seat_index_valid(seat_index)

        seat = self._seats[seat_index]

        if seat.member_id is not None:
            raise ValueError("Seat already occupied.")

        # Ensure member is not already seated elsewhere
        existing = self._find_seat_by_member(member_id)
        if existing is not None:
            raise ValueError("Member already occupies a seat.")

        seat.member_id = member_id
        self._remove_member_from_hand_view_permissions(member_id)

        # If game was blocked due to empty seat,
        # and now all seats are filled, resume automatically
        if self._state == TableState.GAME_BLOCKED:
            if self._all_seats_filled():
                self._state = TableState.IN_GAME


    def unassign_seat(self, seat_index: int) -> None:
        """
        Remove a member from a seat.

        Rules:
        - Seat index must be valid.
        - If seat is already empty, do nothing.
        - If a game is active, it becomes blocked.
        - If a player leaves their seat, their hand view grants are removed.
        """

        self._ensure_seat_index_valid(seat_index)

        seat = self._seats[seat_index]

        if seat.member_id is None:
            return  # no-op

        former_player_id = seat.member_id

        seat.member_id = None

        # Remove permission grants from this player
        if former_player_id in self._hand_view_permissions:
            del self._hand_view_permissions[former_player_id]

        if former_player_id in self._hand_visibility_enabled:
            self._hand_visibility_enabled.discard(former_player_id)


        if self._state == TableState.IN_GAME:
            self._state = TableState.GAME_BLOCKED



    # --------------------------- Game Control -------------------------- #

    def update_rules(self, acting_member_id: str, rules: RulesT) -> None:
        """
        Update pending game rules before a game starts.

        Rules:
        - Only host may update config.
        - Config may only be updated while table is OPEN.
        - Table treats rules as an opaque value.
        """

        self._ensure_host(acting_member_id, "Only host may update config.")

        self._ensure_state(TableState.OPEN, "Rules can only be updated while table is open.")

        self._pending_rules = rules

    def prepare_game_start(self, acting_member_id: str) -> int:
        """
        Validate that a game may be started and return the number
        of players that should participate.

        This method performs domain validation only.
        It does NOT create or attach a Game instance.

        Rules:
        - Only host may initiate start.
        - Table must be OPEN.
        - No active game may exist.
        - All seats must be filled.

        Returns:
        - Number of seated players.
        """

        self._ensure_host(acting_member_id, "Only host may start the game.")
        self._ensure_state(TableState.OPEN, "Game can only be started while table is open.")
        self._ensure_no_game_exists("Game already exists.")

        if not self._all_seats_filled():
            raise ValueError("All seats must be filled to start the game.")

        return self.seat_count



    def attach_game(self, acting_member_id: str, game_id: str) -> None:
        """
        Attach an externally created Game to this table.

        This method does NOT create a Game.
        It records the game_id and transitions state.

        Rules:
        - Only host may attach.
        - Table must be OPEN.
        - No active game may already exist.
        - game_id must be provided by application layer.

        Effects:
        - active_game_id is set.
        - Table transitions to IN_GAME.
        """

        self._ensure_host(acting_member_id, "Only host may attach the game.")
        self._ensure_state(TableState.OPEN, "Game can only be attached while table is open.")
        self._ensure_no_game_exists("Game already exists.")

        self._active_game_id = game_id
        self._state = TableState.IN_GAME


    def detach_game(self, acting_member_id: str) -> None:
        """
        Detach current game from the table.

        Rules:
        - Only host may detach.
        - A game must exist.
        - Table returns to OPEN state.
        """

        self._ensure_host(acting_member_id, "Only host may detach the game.")

        self._ensure_game_exists()

        self._active_game_id = None
        self._state = TableState.OPEN


    def block_game(self) -> None:
        """
        Block the active game.

        Rules:
        - A game must exist.
        - Table must currently be IN_GAME.
        """

        self._ensure_game_exists()

        self._ensure_state(TableState.IN_GAME, "Game is not active.")

        self._state = TableState.GAME_BLOCKED


    def resume_game(self) -> None:
        """
        Resume a blocked game.

        Rules:
        - A game must exist.
        - Table must be GAME_BLOCKED.
        - All seats must be filled.
        """

        self._ensure_game_exists()

        self._ensure_state(TableState.GAME_BLOCKED, "Game is not blocked.")

        if not self._all_seats_filled():
            raise ValueError("Cannot resume: seats not fully populated.")

        self._state = TableState.IN_GAME

    # ---------------------- Persistence Control ---------------------- #

    def mark_persistent(self, acting_member_id: str) -> None:
        """
        Mark this table as persistent.

        Rules:
        - Only host may mark persistent.
        """
        self._ensure_host(acting_member_id, "Only host may mark table as persistent.")
        self._is_persistent = True


    def unmark_persistent(self, acting_member_id: str) -> None:
        """
        Remove persistence flag from table.

        Rules:
        - Only host may unmark persistent.
        """
        self._ensure_host(acting_member_id, "Only host may unmark table as persistent.")
        self._is_persistent = False
    
    # ---------------------- Hand Visibility Control ---------------------- #

    def enable_hand_visibility(self, acting_member_id: str) -> None:
        """
        Enable viewing of this player's hand (non-destructive).

        Rules:
        - Game must exist.
        - Acting member must be seated.
        """
        self._ensure_seated_player_in_game(acting_member_id)

        self._hand_visibility_enabled.add(acting_member_id)


    def disable_hand_visibility(self, acting_member_id: str) -> None:
        """
        Temporarily disable viewing of this player's hand.

        Rules:
        - Game must exist.
        - Acting member must be seated.
        """
        self._ensure_seated_player_in_game(acting_member_id)

        self._hand_visibility_enabled.discard(acting_member_id)

    
    # ---------------------- Hand View Permissions ---------------------- #

    def grant_hand_view(self, acting_member_id: str, viewer_id: str) -> None:
        """
        Grant a viewer permission to see the acting player's hand.

        Rules:
        - Game must exist.
        - Acting member must be seated.
        - Viewer must exist.
        - Viewer must not be seated.
        - Acting member may only grant access to their own hand.
        """

        self._ensure_valid_hand_view_pair(acting_member_id, viewer_id)

        if acting_member_id not in self._hand_view_permissions:
            self._hand_view_permissions[acting_member_id] = set()

        self._hand_visibility_enabled.add(acting_member_id)
        self._hand_view_permissions[acting_member_id].add(viewer_id)



    def revoke_hand_view(self, acting_member_id: str, viewer_id: str) -> None:
        """
        Revoke a viewer's permission to see the acting player's hand.

        Rules:
        - Game must exist.
        - Acting member must be seated.
        - Viewer must exist.
        - Viewer must not be seated.
        - Acting member may only revoke access to their own hand.
        """

        self._ensure_valid_hand_view_pair(acting_member_id, viewer_id)

        if acting_member_id not in self._hand_view_permissions:
            return  # nothing to revoke

        self._hand_view_permissions[acting_member_id].discard(viewer_id)

        # Optional cleanup: remove empty permission set
        if not self._hand_view_permissions[acting_member_id]:
            del self._hand_view_permissions[acting_member_id]


    def can_view_hand(self, player_id: str, viewer_id: str) -> bool:
        """
        Determine whether a viewer currently has permission
        to see the specified player's hand.

        Rules:
        - Both members must exist.
        - Pure read; does not enforce seating or game state.
        """

        self._ensure_member_exists(player_id)
        self._ensure_member_exists(viewer_id)

        if player_id not in self._hand_visibility_enabled:
            return False

        if self._find_seat_by_member(viewer_id) is not None:
            return False

        return viewer_id in self._hand_view_permissions.get(player_id, set())

    def get_hand_view_grants(self) -> Dict[str, list[str]]:
        """
        Return active hand-view grants keyed by player member id.
        """

        grants: Dict[str, list[str]] = {}

        for player_id, viewers in self._hand_view_permissions.items():
            if player_id not in self._hand_visibility_enabled:
                continue

            active_viewers = sorted(
                viewer_id
                for viewer_id in viewers
                if self._find_seat_by_member(viewer_id) is None
            )

            if active_viewers:
                grants[player_id] = active_viewers

        return grants

    
    # ------------------------- Internal Helpers ------------------------- #

    def _find_seat_by_member(self, member_id: str) -> Optional[int]:
        for seat in self._seats:
            if seat.member_id == member_id:
                return seat.index
        return None

    def _find_member_by_account_id(self, account_id: str | None) -> "Member | None":
        if not account_id:
            return None

        for member in self._members.values():
            if member.account_id == account_id:
                return member

        return None

    def _all_seats_filled(self) -> bool:
        """
        All current seats must be occupied.
        """
        return all(seat.member_id is not None for seat in self._seats)

    def _ensure_host(self, acting_member_id: str, message: str) -> None:
        if acting_member_id != self._host_id:
            raise PermissionError(message)

    def _ensure_game_exists(self) -> None:
        if self._active_game_id is None:
            raise ValueError("No game attached.")

    def _ensure_state(self, expected: TableState, message: str) -> None:
        if self._state != expected:
            raise ValueError(message)

    def _ensure_seat_index_valid(self, seat_index: int) -> None:
        if not (0 <= seat_index < self.seat_count):
            raise ValueError("Invalid seat index.")

    def _ensure_no_game_exists(self, message: str) -> None:
        if self._active_game_id is not None:
            raise ValueError(message)

    def _ensure_member_exists(self, member_id: str) -> None:
        if member_id not in self._members:
            raise ValueError("Member does not exist.")

    def _remove_member_from_hand_view_permissions(self, member_id: str) -> None:
        empty_player_ids: list[str] = []

        for player_id, viewers in self._hand_view_permissions.items():
            viewers.discard(member_id)
            if not viewers:
                empty_player_ids.append(player_id)

        for player_id in empty_player_ids:
            del self._hand_view_permissions[player_id]

    def _ensure_member_seated(self, member_id: str) -> None:
        if self._find_seat_by_member(member_id) is None:
            raise PermissionError("Member is not seated.")

    def _ensure_member_not_seated(self, member_id: str) -> None:
        if self._find_seat_by_member(member_id) is not None:
            raise ValueError("Member is seated.")

    def _ensure_seated_player_in_game(self, member_id: str) -> None:
        self._ensure_game_exists()
        self._ensure_member_exists(member_id)
        self._ensure_member_seated(member_id)
    
    def _ensure_valid_hand_view_pair(self, acting_member_id: str, viewer_id: str) -> None:
        self._ensure_seated_player_in_game(acting_member_id)

        self._ensure_member_exists(viewer_id)

        if acting_member_id == viewer_id:
            raise ValueError("Cannot grant or revoke hand view to self.")

        self._ensure_member_not_seated(viewer_id)


# ---------------------------- Governed Types ---------------------------- #

class Member:
    """
    Identity + role + metadata.
    No knowledge of Table.
    """
    def __init__(
        self,
        member_id: str,
        name: str,
        account_id: str | None = None,
        account_username: str | None = None,
    ):
        self.member_id = member_id
        self.name = name
        self.account_id = account_id
        self.account_username = account_username


class Seat:
    """
    Position container for a Member reference.
    """
    def __init__(self, index: int):
        self.index = index
        self.member_id: Optional[str] = None
