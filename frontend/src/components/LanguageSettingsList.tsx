import { useTranslation } from "react-i18next";
import { List, ListItem, Radio } from "konsta/react";
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
    const { i18n, t } = useTranslation();
    const currentLanguage: SupportedLanguage =
        i18n.resolvedLanguage?.split("-")[0] === "es" ? "es" : "en";
    const languageOptions = [
        { code: "en" as const, label: t("common.language.english") },
        { code: "es" as const, label: t("common.language.spanish") },
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
                <ListItem
                    key={language.code}
                    title={language.label}
                    link
                    chevron={false}
                    onClick={() => saveLanguagePreference(language.code)}
                    after={(
                        <Radio
                            component="div"
                            name={radioName}
                            value={language.code}
                            checked={language.code === currentLanguage}
                            onChange={() => saveLanguagePreference(language.code)}
                        />
                    )}
                    strongTitle={false}
                    titleFontSizeIos="text-[17px]"
                />
            ))}
        </List>
    );
}
