type NicknameLocale = "en" | "es";

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
    "Domino",
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

function randomItem(items: string[]): string {
    const randomIndex = Math.floor(Math.random() * items.length);
    return items[randomIndex];
}

function resolveNicknameLocale(language: string): NicknameLocale {
    return language.toLowerCase().startsWith("es") ? "es" : "en";
}

export function generateNickname(language: string): string {
    const locale = resolveNicknameLocale(language);

    if (locale === "es") {
        return `${randomItem(SPANISH_NOUNS)} ${randomItem(SPANISH_ADJECTIVES)}`;
    }

    return `${randomItem(ENGLISH_ADJECTIVES)} ${randomItem(ENGLISH_NOUNS)}`;
}
