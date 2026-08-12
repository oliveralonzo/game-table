/**
 * tableReducer.ts
 * Author: Oliver Alonzo
 * Supported by ChatGPT (GPT-5)
 * Date: 2026-02-23
 * Version: 0.1
 *
 * Reducer and state container for table domain.
 *
 * Responsibilities:
 * - Hold canonical table snapshot (TableView).
 * - Hold lobby table list (TableList[]).
 * - Hold self member identity (member_id).
 *
 * Does NOT:
 * - Contain socket logic.
 * - Derive UI-specific flags.
 * - Perform side effects.
 */

import type { TableView, TableList } from "game-table/types/table";

/**
 * Canonical frontend table state.
 */
export interface TableStateContainer {
    tableView: TableView | null;
    tableList: TableList[];
    selfMemberId: string | null;
    lastTableEvent: { type: "deleted" | "removed" | "replaced"; table_code: string } | null;
}

/**
 * All possible reducer actions.
 * These correspond directly to server events or
 * explicit local resets.
 */
export type TableAction =
    | { type: "SET_TABLE_VIEW"; payload: TableView }
    | { type: "CLEAR_TABLE_VIEW" }
    | { type: "SET_TABLE_LIST"; payload: TableList[] }
    | { type: "SET_SELF_MEMBER_ID"; payload: string | null }
    | {
        type: "SET_LAST_TABLE_EVENT";
        payload: { type: "deleted" | "removed" | "replaced"; table_code: string } | null;
    }
    | { type: "RESET_ALL" };

/**
 * Initial state.
 */
export const initialTableState: TableStateContainer = {
    tableView: null,
    tableList: [],
    selfMemberId: null,
    lastTableEvent: null,
};

/**
 * Pure reducer function.
 *
 * Takes current state + action,
 * returns next state.
 */
export function tableReducer(
    state: TableStateContainer,
    action: TableAction
): TableStateContainer {
    switch (action.type) {
        case "SET_TABLE_VIEW":
            return {
                ...state,
                tableView: action.payload,
            };

        case "CLEAR_TABLE_VIEW":
            return {
                ...state,
                tableView: null,
            };

        case "SET_TABLE_LIST":
            return {
                ...state,
                tableList: action.payload,
            };

        case "SET_SELF_MEMBER_ID":
            return {
                ...state,
                selfMemberId: action.payload,
            };

        case "SET_LAST_TABLE_EVENT":
            return {
                ...state,
                lastTableEvent: action.payload,
            };

        case "RESET_ALL":
            return initialTableState;

        default:
            return state;
    }
}
