import { Users } from "lucide-react";
import { useTable } from "game-table/context/TableState";
import { useTranslation } from "react-i18next";

export default function TableIdentity() {
    const { state } = useTable();
    const { t } = useTranslation();
    const table = state.tableView;
    if (!table) return null;
    const host = table.host_id ? table.members[table.host_id] : null;
    const username = host?.account_username ?? table.host_username;
    const hostName = username ? `@${username}` : host?.name ?? table.host_name;
    return <div className="min-w-0 text-center">
        <p className="text-base leading-6 text-black/65 dark:text-white/65">
            {t(table.group_name ? "table.label.groupTable" : "table.label.individualTableBy")}{" "}
            {table.group_name && <><Users size={18} className="inline-block align-[-3px]" aria-hidden="true" />{" "}</>}
            <span className="font-medium [overflow-wrap:anywhere]">{table.group_name || hostName}</span>
        </p>
        <p className="mt-2 text-base text-black/55 dark:text-white/55">{t("table.label.code")} <span className="font-mono">{table.table_code}</span></p>
    </div>;
}
