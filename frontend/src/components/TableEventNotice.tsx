import { useTranslation } from "react-i18next";
import { useTable } from "game-table/context/TableState";
import DismissibleNotice from "game-table/components/DismissibleNotice";

export default function TableEventNotice({ groupId = null }: { groupId?: string | null }) {
    const { t } = useTranslation();
    const { state, dispatch } = useTable();
    const event = state.lastTableEvent;
    if (!event) return null;
    const destinationGroup = event.group_member === false ? null : event.group_id ?? null;
    if (destinationGroup !== groupId) return null;
    return <DismissibleNotice onDismiss={() => dispatch({ type: "SET_LAST_TABLE_EVENT", payload: null })}>
        {t(event.type === "removed" ? "join.status.tableRemoved"
            : event.type === "replaced" ? "join.status.tableReplaced" : "join.status.tableClosed",
            { code: event.table_code })}
    </DismissibleNotice>;
}
