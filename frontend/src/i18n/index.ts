import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "game-table/i18n/resources/en";
import { es } from "game-table/i18n/resources/es";

export const supportedLanguages = ["en", "es"] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

const languageStorageKey = "game-table:language";
const legacyLanguageStorageKey = "domino:language";

function normalizeLanguage(language: string | undefined): SupportedLanguage | null {
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
        },
        lng: getInitialLanguage(),
        fallbackLng: "en",
        interpolation: {
            escapeValue: false,
        },
    });

export default i18n;
