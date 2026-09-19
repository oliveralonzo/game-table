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
};

export default function PlayerStatsTableSkeleton({
    personColumnLabel,
    rows = 10,
}: Props) {
    const { t } = useTranslation();

    return (
        <div
            className="min-w-0 max-w-full overflow-hidden rounded-2xl bg-ios-light-surface-2 dark:bg-ios-dark-surface-2"
            aria-hidden="true"
        >
            <Table className="table-fixed" style={{ tableLayout: "fixed" }}>
                <colgroup>
                    <col className="w-8" />
                    <col className="w-auto" />
                    <col className="w-10" />
                    <col className="w-10" />
                    <col className="w-10" />
                    <col className="w-10" />
                </colgroup>
                <TableHead>
                    <TableRow header>
                        <TableCell header scope="col" className="truncate !px-3">
                            {t("leaderboard.column.rank")}
                        </TableCell>
                        <TableCell header scope="col" className="truncate !px-3">
                            {personColumnLabel}
                        </TableCell>
                        <TableCell header scope="col" className="truncate !px-2 text-right">
                            {t("leaderboard.column.won")}
                        </TableCell>
                        <TableCell header scope="col" className="truncate !px-2 text-right">
                            {t("leaderboard.column.lost")}
                        </TableCell>
                        <TableCell header scope="col" className="truncate !px-2 text-right">
                            {t("leaderboard.column.played")}
                        </TableCell>
                        <TableCell header scope="col" className="truncate !pl-2 !pr-3 text-right">
                            {t("leaderboard.column.winPercentage")}
                        </TableCell>
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
                            <TableCell className="!px-2">
                                <div className="ml-auto h-4 w-6 rounded-full bg-black/10 dark:bg-white/10" />
                            </TableCell>
                            <TableCell className="!px-2">
                                <div className="ml-auto h-4 w-6 rounded-full bg-black/10 dark:bg-white/10" />
                            </TableCell>
                            <TableCell className="!px-2">
                                <div className="ml-auto h-4 w-6 rounded-full bg-black/10 dark:bg-white/10" />
                            </TableCell>
                            <TableCell className="!pl-2 !pr-3">
                                <div className="ml-auto h-4 w-8 rounded-full bg-black/10 dark:bg-white/10" />
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
