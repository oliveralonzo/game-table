import { useTranslation } from "react-i18next";

export type RatingProfile = { rating: number; reliability: number; career_high?: number };

export default function RatingDetailsCard({ profile }: { profile?: RatingProfile | null }) {
    const { t } = useTranslation();
    const confidence = profile ? Math.max(0, Math.min(100, profile.reliability)) : 0;
    return <section className="grid gap-3">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div className="w-fit">
            <h3 className="text-xs font-medium opacity-60">{t("table.label.rating")}</h3>
            <div className="text-2xl font-semibold tabular-nums">
                {profile ? <>{profile.rating.toFixed(2)} <span className="text-sm font-normal opacity-55">/66</span></>
                    : profile === null ? t("table.label.unrated") : "-"}
            </div>
            {profile && <div className="mt-2 grid gap-1">
                <span className="text-xs font-medium opacity-60">{t("table.label.ratingConfidence")}</span>
                <div role="progressbar" aria-label={t("table.label.ratingConfidence")} aria-valuenow={confidence}
                    className="relative h-3.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
                    <div className="h-full bg-primary/40" style={{ width: `${confidence}%` }} />
                    <span aria-hidden="true" className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-medium tabular-nums"
                        style={{ left: `clamp(18px, ${confidence}%, calc(100% - 18px))` }}>{confidence}%</span>
                </div>
            </div>}
        </div>
        {profile?.career_high != null && <div className="grid gap-1 text-xs opacity-60">
            <span>{t("table.label.ratingCareerHigh")}</span>
            <span className="font-semibold tabular-nums">{profile.career_high.toFixed(2)}</span>
        </div>}
        </div>
        <p className="m-0 text-sm opacity-65">{t("table.label.ratingExplanation")}</p>
    </section>;
}
