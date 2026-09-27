import { useTranslation } from "react-i18next";

export default function TableSponsor({ className = "" }: { className?: string }) {
    const { t } = useTranslation();
    const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    if (today < "2026-09-26" || today > "2026-09-30") return null;

    return (
        <span className={`mt-1 block text-xs text-black/55 dark:text-white/55 ${className}`}>
            {t("table.label.sponsoredBy", { sponsor: "@RafaMarchena" })}
        </span>
    );
}
