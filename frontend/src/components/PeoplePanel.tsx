import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import LobbyRoster, {
    type RosterAction,
    type RosterPerson,
} from "game-table/components/LobbyRoster";

type Props = {
    seatedRoster: RosterPerson[];
    viewerRoster: RosterPerson[];
    queuedRoster?: RosterPerson[];
    seatCount: number;
    showSeatLocation?: boolean;
    showHandViewStatus?: boolean;
    getActions?: (person: RosterPerson) => RosterAction[];
    middleAction?: ReactNode;
};

export default function PeoplePanel({
    seatedRoster,
    viewerRoster,
    queuedRoster = [],
    seatCount,
    showSeatLocation = true,
    showHandViewStatus = false,
    getActions,
    middleAction,
}: Props) {
    const { t } = useTranslation();
    const hasPlayers = seatedRoster.length > 0;
    const hasViewers = viewerRoster.length > 0;

    return (
        <div className="min-h-0 overflow-y-auto pb-3">
            {hasPlayers && (
                <LobbyRoster
                    title={t("table.roster.players")}
                    people={seatedRoster}
                    seatCount={seatCount}
                    flush
                    showSeatLocation={showSeatLocation}
                    showHandViewStatus={showHandViewStatus}
                    getActions={getActions}
                />
            )}
            {queuedRoster.length > 0 ? (
                <LobbyRoster
                    title={t('table.queue.title')}
                    people={queuedRoster}
                    seatCount={seatCount}
                    flush
                    className={hasPlayers ? 'mt-3' : ''}
                    showSeatLocation={false}
                    showHandViewStatus={showHandViewStatus}
                    getActions={getActions}
                />
            ) : null}
            {middleAction}
            {hasViewers && (
                <LobbyRoster
                    title={t("table.roster.viewers")}
                    people={viewerRoster}
                    seatCount={seatCount}
                    flush
                    className={hasPlayers && !middleAction ? "mt-3" : ""}
                    showSeatLocation={showSeatLocation}
                    showHandViewStatus={showHandViewStatus}
                    getActions={getActions}
                />
            )}
        </div>
    );
}
