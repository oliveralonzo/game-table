import { useTranslation } from "react-i18next";
import GroupTablePreviewCard from "game-table/components/GroupTablePreviewCard";
import PeoplePanel from "game-table/components/PeoplePanel";
import SeatsPanel from "game-table/components/SeatsPanel";
import type { RosterPerson } from "game-table/components/LobbyRoster";
import type { SavedTable } from "game-table/context/SavedTablesContext";
import { Plus } from "lucide-react";
import { glassWithoutLightInsetShadow } from "game-table/styles/glass";

type Preview = Pick<SavedTable, "table_code" | "seats" | "members" | "seat_count"> & { host_id?: string | null };
export default function TableCard({ table, onEnter, pending = false, closing = false, onClosed, onRemove, removeLabel }: {
    table: Preview; onEnter: () => void; pending?: boolean; closing?: boolean;
    onClosed?: (code: string) => void; onRemove?: () => void; removeLabel?: string;
}) {
    const { t } = useTranslation();
    const roster: RosterPerson[] = table.members.map(member => ({
        id: member.member_id, name: member.name, accountUsername: member.account_username,
        isHost: member.member_id === table.host_id, hasSeat: table.seats.includes(member.member_id),
    }));
    return <GroupTablePreviewCard title={table.table_code} pending={pending} closing={closing} onClosed={onClosed}
        participantCount={table.members.length} onEnter={onEnter} onRemove={onRemove} removeLabel={removeLabel}
        peopleLabel={t("groups.preview.peopleAt", { number: table.table_code })}
        enterLabel={pending ? t("join.status.creatingTable") : t("groups.preview.enter", { number: table.table_code })}
        backLabel={t("groups.preview.showTable", { number: table.table_code })}
        roster={roster.length ? <PeoplePanel seatedRoster={roster.filter(person => person.hasSeat)}
            viewerRoster={roster.filter(person => !person.hasSeat)} seatCount={table.seat_count} showSeatLocation={false} />
            : <p className="px-safe-4 py-3 text-sm text-black/45 dark:text-white/45">{t("groups.preview.empty")}</p>}
    >
        <SeatsPanel seats={table.seats.map(id => ({ name: table.members.find(member => member.member_id === id)?.name ?? null, ready: false }))}
            seatCount={table.seat_count} playerIndex={null} isHost={false} tableState="open"
            onAssignSeat={() => {}} onUnassignSeat={() => {}} />
    </GroupTablePreviewCard>;
}

export function NewTableCard({ onCreate, disabled, label }: { onCreate: () => void; disabled: boolean; label?: string }) {
    const { t } = useTranslation();
    return <button type="button" disabled={disabled} aria-label={label ?? t("groups.preview.add")} onClick={onCreate}
        className={`flex flex-col gap-2 aspect-[3/4] w-full min-w-0 cursor-pointer disabled:cursor-default items-center justify-center rounded-[28px] bg-white text-black/45 dark:bg-[#1c1c1e] dark:text-white/45 ${glassWithoutLightInsetShadow} opacity-60 transition-[opacity,transform] duration-150 enabled:hover:opacity-80 motion-safe:enabled:hover:-translate-y-0.5 motion-reduce:transition-none enabled:active:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500`}
    ><Plus size={32} strokeWidth={1.5} aria-hidden="true" />
        {label && <span className="text-sm">{label}</span>}
    </button>;
}
