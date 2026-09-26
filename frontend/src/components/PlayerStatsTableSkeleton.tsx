import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
} from "konsta/react";
import { useTranslation } from "react-i18next";

type Props = {
    personColumnLabel: string;
    rows?: number;
    showHeadToHead?: boolean;
    percentageFirst?: boolean;
};

export default function PlayerStatsTableSkeleton({
    personColumnLabel,
    rows = 10,
    showHeadToHead = false,
    percentageFirst = false,
}: Props) {
    const { t } = useTranslation();
    const columns = (percentageFirst
        ? ["winPercentage", "won", "lost", "played", "headToHead"]
        : ["won", "lost", "played", "winPercentage", "headToHead"]
    ).filter(column => column !== "headToHead" || showHeadToHead);

    return (
        <div
            className="min-w-0 max-w-full overflow-hidden rounded-2xl bg-ios-light-surface-2 dark:bg-ios-dark-surface-2"
            aria-hidden="true"
        >
            <Table className="table-fixed" style={{ tableLayout: "fixed" }}>
                <colgroup>
                    <col className="w-8" />
                    <col className="w-auto" />
                    {columns.map(column => <col key={column} className={column === "headToHead" ? "w-20" : "w-10"} />)}
                </colgroup>
                <TableHead>
                    <TableRow header>
                        <TableCell header scope="col" className="truncate !px-3">
                            {t("leaderboard.column.rank")}
                        </TableCell>
                        <TableCell header scope="col" className="truncate !px-3">
                            {personColumnLabel}
                        </TableCell>
                        {columns.map(column => <TableCell key={column} header scope="col" className="truncate !px-2 text-right">
                            {t(`leaderboard.column.${column}`)}
                        </TableCell>)}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {Array.from({ length: rows }).map((_, index) => (
                        <TableRow key={index}>
                            <TableCell className="!px-3">
                                <div className="h-4 w-4 rounded-full bg-black/10 dark:bg-white/10" />
                            </TableCell>
                            <TableCell className="!px-3">
                                <div className="h-4 w-full max-w-28 rounded-full bg-black/10 dark:bg-white/10" />
                            </TableCell>
                            {columns.map(column => <TableCell key={column} className="!px-2">
                                <div className={`ml-auto h-4 rounded-full bg-black/10 dark:bg-white/10 ${column === "headToHead" ? "w-12" : column === "winPercentage" ? "w-8" : "w-6"}`} />
                            </TableCell>)}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
