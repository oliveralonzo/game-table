type NicknameLocale = "en" | "es" | "pt";

const ENGLISH_ADJECTIVES = [
    "Bright",
    "Calm",
    "Clever",
    "Cozy",
    "Daring",
    "Golden",
    "Happy",
    "Lucky",
    "Nimble",
    "Quiet",
    "Sharp",
    "Sunny",
    "Swift",
    "Warm",
];

const ENGLISH_NOUNS = [
    "Ace",
    "Bridge",
    "Crown",
    "Echo",
    "Harbor",
    "Joker",
    "Key",
    "Marker",
    "Moon",
    "River",
    "Star",
    "Tile",
    "Wave",
];

const SPANISH_NOUNS = [
    "Brisa",
    "Clave",
    "Corona",
    "Dado",
    "Eco",
    "Estrella",
    "Ficha",
    "Luna",
    "Mano",
    "Mesa",
    "Puente",
    "Rio",
    "Sol",
    "Truco",
];

const SPANISH_ADJECTIVES = [
    "Alegre",
    "Brillante",
    "Calma",
    "Clara",
    "Dorada",
    "Firme",
    "Lista",
    "Noble",
    "Nueva",
    "Rapida",
    "Serena",
    "Suave",
    "Valiente",
    "Viva",
];

const PORTUGUESE_NOUNS = [
    "Brisa",
    "Chave",
    "Coroa",
    "Dado",
    "Eco",
    "Estrela",
    "Lua",
    "Mesa",
    "Onda",
    "Ponte",
    "Rio",
    "Sol",
];

const PORTUGUESE_ADJECTIVES = [
    "Alegre",
    "Brilhante",
    "Calma",
    "Clara",
    "Dourada",
    "Firme",
    "Leve",
    "Nobre",
    "Nova",
    "Rápida",
    "Serena",
    "Valente",
    "Viva",
];

function randomItem(items: string[]): string {
    const randomIndex = Math.floor(Math.random() * items.length);
    return items[randomIndex];
}

function resolveNicknameLocale(language: string): NicknameLocale {
    const normalizedLanguage = language.toLowerCase();
    if (normalizedLanguage.startsWith("es")) return "es";
    if (normalizedLanguage.startsWith("pt")) return "pt";
    return "en";
}

export function generateNickname(language: string): string {
    const locale = resolveNicknameLocale(language);

    if (locale === "es") {
        return `${randomItem(SPANISH_NOUNS)} ${randomItem(SPANISH_ADJECTIVES)}`;
    }

    if (locale === "pt") {
        return `${randomItem(PORTUGUESE_NOUNS)} ${randomItem(PORTUGUESE_ADJECTIVES)}`;
    }

    return `${randomItem(ENGLISH_ADJECTIVES)} ${randomItem(ENGLISH_NOUNS)}`;
}
