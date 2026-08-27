import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { List, ListItem } from "konsta/react";
import LanguageSettingsList from "game-table/components/LanguageSettingsList";
import NicknameSettings, {
    type NicknameChangeHandler,
} from "game-table/components/NicknameSettings";

type Props = {
    displayName?: string;
    onDisplayNameDraftChange?: (name: string) => void;
    onDisplayNameChange?: NicknameChangeHandler;
    showDisplayNameGenerator?: boolean;
    compactProfile?: boolean;
    showProfile?: boolean;
    showLanguage?: boolean;
    gameSettings?: ReactNode;
    gameSettingsNested?: boolean;
    routed?: boolean;
};

type SettingsPane = "general" | "game" | "language";

export default function PlatformSettingsPanel({
    displayName,
    onDisplayNameDraftChange,
    onDisplayNameChange,
    showDisplayNameGenerator = false,
    compactProfile = false,
    showProfile = true,
    showLanguage = true,
    gameSettings,
    gameSettingsNested = false,
    routed = false,
}: Props) {
    const { t } = useTranslation();
    const [pane, setPane] = useState<SettingsPane>("general");

    const hasProfile = showProfile
        && displayName !== undefined
        && !!onDisplayNameChange;

    if (routed) {
        const paneTitle = pane === "general"
            ? t("table.label.general")
            : pane === "game"
                ? t("table.label.game")
                : t("common.language.label");

        return (
            <div className="grid min-w-0 gap-3">
                {!(pane === "game" && gameSettingsNested) ? (
                <div className="grid min-w-0 gap-2 px-safe-4">
                    {pane !== "general" ? (
                        <button
                            type="button"
                            onClick={() => setPane("general")}
                            className="-ml-2 inline-flex w-fit items-center text-sm font-medium text-primary"
                        >
                            <ChevronLeft size={18} />
                            {t("table.label.general")}
                        </button>
                    ) : null}
                    <h2 className="min-w-0 truncate text-[22px] font-bold leading-tight tracking-normal text-black dark:text-white">
                        {paneTitle}
                    </h2>
                </div>
                ) : null}

                <div className="grid w-full min-w-0 max-w-full gap-4">
                    {pane === "general" ? (
                        <>
                            {hasProfile ? (
                                <section className="grid gap-2">
                                    <h3 className="px-safe-4 text-xs font-semibold uppercase text-black/45 dark:text-white/45">
                                        {t("table.label.profile")}
                                    </h3>
                                    <NicknameSettings
                                        value={displayName}
                                        onDraftChange={onDisplayNameDraftChange}
                                        onChange={onDisplayNameChange}
                                        showGenerator={showDisplayNameGenerator}
                                        compact={compactProfile}
                                    />
                                </section>
                            ) : null}
                            {gameSettings || showLanguage ? (
                                <List inset nested={false} outline strong className="m-0 overflow-hidden">
                                    {gameSettings ? (
                                        <ListItem
                                            title={t("table.label.game")}
                                            link
                                            chevron
                                            onClick={() => setPane("game")}
                                            strongTitle={false}
                                            titleFontSizeIos="text-[17px]"
                                        />
                                    ) : null}
                                    {showLanguage ? (
                                        <ListItem
                                            title={t("common.language.label")}
                                            link
                                            chevron
                                            onClick={() => setPane("language")}
                                            strongTitle={false}
                                            titleFontSizeIos="text-[17px]"
                                        />
                                    ) : null}
                                </List>
                            ) : null}
                        </>
                    ) : null}
                    {pane === "game" ? gameSettings : null}
                    {pane === "language" && showLanguage ? (
                        <LanguageSettingsList radioName="platform-language" />
                    ) : null}
                </div>
            </div>
        );
    }

    return (
        <div className="grid min-w-0 gap-5">
            {showProfile && displayName !== undefined && onDisplayNameChange ? (
                <section>
                    {!compactProfile ? (
                        <h2 className="mb-3 min-w-0 truncate px-safe-4 text-[22px] font-bold leading-tight tracking-normal text-black dark:text-white">
                            {t("table.label.profile")}
                        </h2>
                    ) : null}
                    <NicknameSettings
                        value={displayName}
                        onDraftChange={onDisplayNameDraftChange}
                        onChange={onDisplayNameChange}
                        showGenerator={showDisplayNameGenerator}
                        compact
                    />
                </section>
            ) : null}
            {gameSettings}
            {showLanguage ? (
                <section>
                    <h3 className="mb-2 px-safe-4 text-xs font-semibold uppercase text-black/45 dark:text-white/45">
                        {t("common.language.label")}
                    </h3>
                    <LanguageSettingsList radioName="platform-language" />
                </section>
            ) : null}
        </div>
    );
}
