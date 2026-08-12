/**
 * TableContext.tsx
 * Author: Oliver Alonzo
 * Supported by ChatGPT (GPT-5)
 * Date: 2026-02-23
 * Version: 0.1
 *
 * React context wrapper for table reducer state.
 *
 * Responsibilities:
 * - Own the table reducer instance.
 * - Expose { state, dispatch } to the component tree.
 *
 * Does NOT:
 * - Create or manage sockets.
 * - Derive UI-specific values.
 * - Perform side effects.
 */

import {
    createContext,
    useContext,
    useReducer,
    type ReactNode,
    type Dispatch,
} from "react";

import {
    tableReducer,
    initialTableState,
    type TableAction,
    type TableStateContainer,
} from "game-table/state/tableReducer";

/**
 * Context value shape.
 */
type TableContextValue = {
    state: TableStateContainer;
    dispatch: Dispatch<TableAction>;
};

/**
 * React context (undefined until provided).
 */
const TableContext = createContext<TableContextValue | undefined>(
    undefined
);

/**
 * Provider component.
 *
 * Wrap your app (or subtree) with this.
 */
export function TableProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(
        tableReducer,
        initialTableState
    );

    return (
        <TableContext.Provider value={{ state, dispatch }}>
            {children}
        </TableContext.Provider>
    );
}

/**
 * Hook for consuming table context.
 */
export function useTable() {
    const ctx = useContext(TableContext);
    if (!ctx) {
        throw new Error("useTable must be used within TableProvider");
    }
    return ctx;
}