/**
 * Table types
 * Author: Oliver Alonzo
 * Supported by ChatGPT (GPT-5)
 * Date: 2026-02-23
 * Version: 0.1
 *
 * Shared type definitions for table state across state management
 * and UI layers. Mirrors the transport-safe snapshot returned by
 * TableService.get_table_view on the backend.
 */

/**
 * Possible lifecycle states of a table.
 * Must stay aligned with backend TableState values.
 */
export type TableState = "open" | "in_game" | "game_blocked";

/**
 * Minimal member view as exposed by the backend.
 * Keyed by member_id in the TableView.members record.
 */
export interface TableMember {
    /** Display name chosen by the member. */
    name: string;

    /** Durable account id when this member is signed in, otherwise null. */
    account_id?: string | null;

    /** Username for the attached account, when signed in. */
    account_username?: string | null;
}

/**
 * Transport-safe snapshot of a table.
 *
 * This is the canonical frontend representation of table state.
 * It should match exactly what the backend emits via
 * `table:updated` (TableService.get_table_view).
 *
 * No derived UI fields should be added here.
 */
export interface TableView {
    /** Unique table identifier. */
    table_code: string;

    /** Member ID of the current host. */
    host_id: string;

    /**
     * All members currently associated with the table.
     * Keyed by member_id.
     */
    members: Record<string, TableMember>;

    /**
     * Positional seats by index.
     * Each entry is either a member_id or null (empty seat).
     */
    seats: Array<string | null>;

    /** Current number of seats configured on the table. */
    seat_count: number;

    /** Current lifecycle state of the table. */
    state: TableState;

    /** Whether the table is marked persistent (survives idle cleanup). */
    is_persistent: boolean;

    /**
     * Pending rules for the next game.
     */
    pending_rules: unknown;

    /** Active game identifier, or null if no game attached. */
    active_game_id: string | null;

    /** Convenience flag indicating whether a game is attached. */
    has_game: boolean;

    /** Active hand-view grants keyed by seated player member id. */
    hand_view_grants?: Record<string, string[]>;
}

/**
 * Metadata view of a table for lobby listing.
 * Mirrors TableService.list_tables() payload.
 */
export interface TableList {
    /** Unique table identifier. */
    table_code: string;

    /** Current lifecycle state of the table. */
    state: TableState;

    /** Display name of the host. */
    host_name: string | null;

    /** Number of members currently associated with the table. */
    member_count: number;

    /** Number of seats configured on the table. */
    seat_count: number;

    /** Active game identifier, or null if no game attached. */
    active_game_id: string | null;

    /** Convenience flag indicating whether a game is attached. */
    has_game: boolean;

    /** Whether the table is marked persistent. */
    is_persistent: boolean;
}
