import { useTranslation } from "react-i18next";
import { UserRound, Users } from "lucide-react";

export default function TableIdentityBadge({ groupName, hostName, compact = false }: {
    groupName?: string | null; hostName?: string | null; compact?: boolean;
}) {
    const { t } = useTranslation();
    if (!groupName && !hostName) return null;
    const description = groupName || t("table.label.hostBadge", { host: hostName });
    const label = groupName || hostName;
    const Icon = groupName ? Users : UserRound;
    return <span title={description} aria-label={description} className={`inline-flex max-w-full items-center rounded-full bg-black/5 font-medium text-black/65 dark:bg-white/10 dark:text-white/65 ${compact ? "gap-1 px-2 py-1 text-sm" : "min-h-11 gap-2 px-3 py-2 text-base leading-5"}`}>
        <Icon size={compact ? 14 : 18} className="shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
    </span>;
}
