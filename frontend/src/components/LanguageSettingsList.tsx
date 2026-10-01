import { useTranslation } from "react-i18next";
import { useId } from "react";
import { List } from "konsta/react";
import SettingsSelectionItem from "game-table/components/SettingsSelectionItem";
import {
    saveLanguagePreference,
    type SupportedLanguage,
} from "game-table/i18n";

type Props = {
    radioName?: string;
};

export default function LanguageSettingsList({
    radioName = "language",
}: Props) {
    const groupId = useId();
    const { i18n, t } = useTranslation();
    const currentLanguage: SupportedLanguage = i18n.resolvedLanguage
        ?.toLowerCase()
        .startsWith("pt")
        ? "pt-BR"
        : i18n.resolvedLanguage?.split("-")[0] === "es" ? "es" : "en";
    const languageOptions = [
        { code: "en" as const, label: t("common.language.english") },
        { code: "es" as const, label: t("common.language.spanish") },
        { code: "pt-BR" as const, label: t("common.language.portuguese") },
    ];

    return (
        <List
            inset
            nested={false}
            outline
            strong
            className="m-0 overflow-hidden"
        >
            {languageOptions.map((language) => (
                <SettingsSelectionItem
                    key={language.code}
                    title={language.label}
                    type="radio"
                    name={`${radioName}-${groupId}`}
                    checked={language.code === currentLanguage}
                    onChange={() => saveLanguagePreference(language.code)}
                />
            ))}
        </List>
    );
}
