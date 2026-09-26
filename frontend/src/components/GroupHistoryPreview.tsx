import type { GroupActivity } from "game-table/types/groupActivity";
import { useTranslation } from "react-i18next";
import { Button, Table, TableBody, TableCell, TableHead, TableRow } from "konsta/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { HistoryParticipantCell, formatHistoryDate } from "game-table/components/HistoryCells";

const PAGE_SIZE = 10;
export default function GroupHistoryPreview({ data, loading, onPageChange }: {
    data?: GroupActivity["history"]; loading: boolean; onPageChange: (page: number) => void;
}) {
    const { t, i18n } = useTranslation();
    const visibleGames = data?.entries ?? [];
    const page = data?.page ?? 1;
    const totalPages = data?.total_pages ?? 1;
    return <section aria-busy={loading} className={`grid min-w-0 gap-3 ${loading ? "opacity-70" : ""}`} aria-label={t("groups.stats.history")}>
        <div className="flex items-baseline justify-between gap-3 px-1">
            <h2 className="text-[22px] font-bold">{t("groups.stats.totalGames")}</h2>
            <span className="text-[28px] font-bold tabular-nums">{data?.total_games ?? "—"}</span>
        </div>
        <div className="min-w-0 max-w-full overflow-x-auto overflow-y-hidden rounded-2xl bg-ios-light-surface-2 dark:bg-ios-dark-surface-2">
            <Table style={{ width: "max-content", minWidth: "100%" }}>
                <TableHead><TableRow header>
                    <TableCell header scope="col" className="whitespace-nowrap !px-3 !text-left">{t("groups.stats.winners")}</TableCell>
                    <TableCell header scope="col" className="whitespace-nowrap !px-3 !text-left">{t("groups.stats.losers")}</TableCell>
                    <TableCell header scope="col" className="whitespace-nowrap !px-3 !text-right">{t("account.history.column.score")}</TableCell>
                    <TableCell header scope="col" className="whitespace-nowrap !px-3 !text-right">{t("account.history.column.date")}</TableCell>
                </TableRow></TableHead>
                <TableBody>{visibleGames.map(game => <TableRow key={game.id}>
                    <TableCell className="whitespace-nowrap !px-3 !text-left"><HistoryParticipantCell participants={game.winners} guestLabel={t("account.history.guestFallback")} fallback={t("account.history.guestFallback")} /></TableCell>
                    <TableCell className="whitespace-nowrap !px-3 !text-left"><HistoryParticipantCell participants={game.others} guestLabel={t("account.history.guestFallback")} fallback={t("account.history.guestFallback")} /></TableCell>
                    <TableCell className="whitespace-nowrap !px-3 text-right font-semibold tabular-nums">{game.score}</TableCell>
                    <TableCell className="whitespace-nowrap !px-3 text-right text-xs text-black/45 dark:text-white/45">{formatHistoryDate(game.date, i18n.language, "UTC")}</TableCell>
                </TableRow>)}
                {Array.from({ length: PAGE_SIZE - visibleGames.length }, (_, index) => <TableRow key={`empty-${index}`} aria-hidden="true">
                    {Array.from({ length: 4 }, (_, column) => <TableCell key={column} className="!px-3"><span>&nbsp;</span></TableCell>)}
                </TableRow>)}
                </TableBody>
            </Table>
        </div>
        <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-black/45 dark:text-white/45">{t("groups.stats.pageOf", { page, total: totalPages })}</span>
            <div className="flex gap-2">
                <Button rounded outline className="!h-9 !w-9 !px-0" disabled={loading || page === 1} aria-label={t("account.history.previous")} onClick={() => onPageChange(page - 1)}><ChevronLeft size={18} /></Button>
                <Button rounded outline className="!h-9 !w-9 !px-0" disabled={loading || page >= totalPages} aria-label={t("account.history.next")} onClick={() => onPageChange(page + 1)}><ChevronRight size={18} /></Button>
            </div>
        </div>
    </section>;
}
