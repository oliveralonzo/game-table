import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
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
};

export default function PlatformSettingsPanel({
    displayName,
    onDisplayNameDraftChange,
    onDisplayNameChange,
    showDisplayNameGenerator = false,
    compactProfile = false,
    showProfile = true,
    showLanguage = true,
    gameSettings,
}: Props) {
    const { t } = useTranslation();

    return (
        <div className="grid min-w-0 gap-5">
            {showProfile && displayName !== undefined && onDisplayNameChange ? (
                <section>
                    {!compactProfile ? (
                        <h3 className="mb-2 px-safe-4 text-xs font-semibold uppercase text-black/45 dark:text-white/45">
                            {t("table.label.profile")}
                        </h3>
                    ) : null}
                    <NicknameSettings
                        value={displayName}
                        onDraftChange={onDisplayNameDraftChange}
                        onChange={onDisplayNameChange}
                        showGenerator={showDisplayNameGenerator}
                        compact={compactProfile}
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

