import { Globe, Ratio, UsersRound, UserRound } from "lucide-react";
import { Tabbar, TabbarLink, ToolbarPane } from "konsta/react";
import { useTranslation } from "react-i18next";

export type HomeTab = "open-play" | "tables" | "groups" | "you";

const tabs = [
    { id: "tables", icon: Ratio },
    { id: "groups", icon: UsersRound },
    { id: "open-play", icon: Globe },
    { id: "you", icon: UserRound },
] as const;

export default function HomeTabbar({ activeTab, onChange }: {
    activeTab: HomeTab;
    onChange: (tab: HomeTab) => void;
}) {
    const { t } = useTranslation();
    return (
        <Tabbar labels icons component="nav" aria-label={t("navigation.label")}
            className="!fixed bottom-[env(safe-area-inset-bottom)] left-0 z-20 w-full">
            <ToolbarPane>
            {tabs.map(({ id, icon: Icon }) => (
                <TabbarLink key={id} active={activeTab === id}
                    label={t(`navigation.${id}`)} icon={<Icon size={24} aria-hidden="true" />}
                    linkProps={{ component: "button", type: "button", "aria-current": activeTab === id ? "page" : undefined }}
                    onClick={() => {
                        if (id !== activeTab) onChange(id);
                    }}
                />
            ))}
            </ToolbarPane>
        </Tabbar>
    );
}
