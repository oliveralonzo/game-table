import { Segmented, SegmentedButton } from "konsta/react";
import { useTranslation } from "react-i18next";

export type GroupActivityView = "standings" | "history";

export default function GroupActivityTabs({ view, onChange }: {
    view: GroupActivityView;
    onChange: (view: GroupActivityView) => void;
}) {
    const { t } = useTranslation();
    return <Segmented strong rounded className="mb-5">
        <SegmentedButton active={view === "standings"} onClick={() => onChange("standings")}>{t("groups.stats.standings")}</SegmentedButton>
        <SegmentedButton active={view === "history"} onClick={() => onChange("history")}>{t("groups.stats.history")}</SegmentedButton>
    </Segmented>;
}
