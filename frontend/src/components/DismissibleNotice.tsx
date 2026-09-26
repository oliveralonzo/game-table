import type { ReactNode } from "react";
import { Button, Glass } from "konsta/react";
import { useTranslation } from "react-i18next";
import { glassWithoutLightInsetShadow } from "game-table/styles/glass";

export default function DismissibleNotice({ children, onDismiss }: { children: ReactNode; onDismiss: () => void }) {
    const { t } = useTranslation();
    return <Glass highlight={false} colors={{ shadowIos: glassWithoutLightInsetShadow }}
        className="relative max-w-md w-full mt-3 rounded-2xl p-3 pr-12 text-sm text-black dark:text-white">
        <span role="alert" className="pr-3">{children}</span>
        <Button type="button" clear rounded aria-label={t("join.action.dismiss")} title={t("join.action.dismiss")}
            onClick={onDismiss} className="absolute inset-y-1 right-1 w-10">×</Button>
    </Glass>;
}
