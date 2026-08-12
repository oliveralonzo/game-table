import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useTable } from "game-table/context/TableState";
import { useTableSocket } from "game-table/context/TableSocket";

type Props = {
    className?: string;
};

export default function Logo({ className = "" }: Props) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { state } = useTable();
    const { leaveTable } = useTableSocket();

    function handleClick() {
        if (!state.tableView) {
            navigate("/");
            return;
        }

        const shouldLeave = confirm(t("table.dialog.leaveConfirm"));
        if (!shouldLeave) return;

        leaveTable(
            (message) => alert(message),
            () => navigate("/", { replace: true })
        );
    }

    return (
        <button
            type="button"
            onClick={handleClick}
            className={`cursor-pointer text-2xl font-bold font-lexend transition duration-150 hover:opacity-75 active:scale-95 active:opacity-65 ${className}`}
        >
            doble6
        </button>
    );
}
