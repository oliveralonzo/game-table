/**
 * OpenTablesList.tsx
 * Author: Oliver Alonzo
 * Supported by ChatGPT (GPT-5)
 * Date: 2025-09-12
 * Version: 1.2
 *
 * Read-only list of currently open tables.
 * - Shows host, member count, seat count, and game status.
 * - Provides a Join button to trigger parent-provided action.
 */

import type { TableList } from "game-table/types/table";
import { glassWithoutLightInsetShadow } from "game-table/styles/glass";
import { useTranslation } from "react-i18next";
import {
    Button,
    Glass,
} from "konsta/react";

type Props = {
    tables: TableList[];
    onJoin: (code: string) => void;
    enableJoin: boolean;
    joiningCode?: string | null;
    accountMemberNamesByCode?: Record<string, string>;
};

function Spinner() {
    return (
        <svg
            className="h-4 w-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
        >
            <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
            />
            <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
        </svg>
    );
}

export default function OpenTablesList({
    tables,
    onJoin,
    enableJoin,
    joiningCode = null,
    accountMemberNamesByCode = {},
}: Props) {
    const { t } = useTranslation();
    const hasTables = tables.length > 0;

    return (
        <section className="mt-6 max-w-md w-full">
            <h2 className="px-4 text-sm font-semibold text-black/70 dark:text-white/70 mb-2">
                {t("join.openTables.heading")}
            </h2>
            {hasTables && (
                <Glass
                    highlight={false}
                    colors={{
                        shadowIos: glassWithoutLightInsetShadow,
                    }}
                    className="rounded-3xl"
                >
                    <ul className="divide-y divide-black/10 dark:divide-white/10">
                        {tables.map((table) => {
                            const isJoining = joiningCode === table.table_code;
                            const isAccountAtTable = !!accountMemberNamesByCode[table.table_code];

                            return (
                                <li
                                    key={table.table_code}
                                    className="flex items-center justify-between gap-3 px-4 py-3"
                                >
                                    <div className="min-w-0">
                                        <div className="truncate text-[17px] font-medium text-black dark:text-white">
                                            {table.table_code}
                                        </div>
                                        <div className="mt-0.5 text-sm text-black/55 dark:text-white/55">
                                            {t("join.openTables.host", {
                                                host: table.host_name ?? "-",
                                            })}
                                            {" | "}
                                            {t("join.openTables.joined", {
                                                count: table.member_count,
                                            })}
                                            {" | "}
                                            {t("join.openTables.seats", {
                                                count: table.seat_count,
                                            })}
                                            {table.has_game && t("join.openTables.gameInProgress")}
                                        </div>
                                    </div>
                                    <Button
                                        type="button"
                                        small
                                        rounded
                                        tonal
                                        onClick={() => onJoin(table.table_code)}
                                        disabled={!enableJoin || !!joiningCode}
                                        className="!w-auto min-h-9 min-w-16 px-3 font-semibold"
                                    >
                                        {isJoining ? (
                                            <span className="inline-flex items-center justify-center">
                                                <Spinner />
                                            </span>
                                        ) : (
                                            t(isAccountAtTable ? "join.action.rejoin" : "join.action.join")
                                        )}
                                    </Button>
                                </li>
                            );
                        })}
                    </ul>
                </Glass>
            )}
            {!hasTables && (
                <Glass
                    highlight={false}
                    colors={{
                        shadowIos: glassWithoutLightInsetShadow,
                    }}
                    className="rounded-3xl p-4"
                >
                    <p className="text-sm text-black/60 dark:text-white/60">
                        {t("join.openTables.empty")}
                    </p>
                </Glass>
            )}
        </section>
    );
}
