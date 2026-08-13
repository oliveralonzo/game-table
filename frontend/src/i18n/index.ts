import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "game-table/i18n/resources/en";
import { es } from "game-table/i18n/resources/es";
import { ptBR } from "game-table/i18n/resources/pt-BR";
import type { GameTranslations } from "game-table/gamePlugin";

export const supportedLanguages = ["en", "es", "pt-BR"] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

const languageStorageKey = "game-table:language";
const legacyLanguageStorageKey = "domino:language";

function normalizeLanguage(language: string | undefined): SupportedLanguage | null {
    if (language?.toLowerCase().startsWith("pt")) return "pt-BR";
    const baseLanguage = language?.split("-")[0];
    return supportedLanguages.find((supported) => supported === baseLanguage) ?? null;
}

function getInitialLanguage(): SupportedLanguage {
    const storedLanguage = normalizeLanguage(
        localStorage.getItem(languageStorageKey)
        ?? localStorage.getItem(legacyLanguageStorageKey)
        ?? undefined,
    );
    const browserLanguage = normalizeLanguage(navigator.language);

    return storedLanguage ?? browserLanguage ?? "en";
}

export function saveLanguagePreference(language: SupportedLanguage) {
    localStorage.setItem(languageStorageKey, language);
    void i18n.changeLanguage(language);
}

export function registerGameTranslations(translations?: GameTranslations) {
    if (!translations) return;

    Object.entries(translations).forEach(([language, resources]) => {
        i18n.addResourceBundle(language, "translation", resources, true, true);
    });
}

i18n
    .use(initReactI18next)
    .init({
        resources: {
            en: {
                translation: en,
            },
            es: {
                translation: es,
            },
            "pt-BR": {
                translation: ptBR,
            },
        },
        lng: getInitialLanguage(),
        fallbackLng: "en",
        interpolation: {
            escapeValue: false,
        },
    });

export default i18n;
