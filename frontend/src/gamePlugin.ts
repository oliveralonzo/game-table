import type { ComponentType } from "react";

export type GameScreenProps = {
    gameId: string;
    mySeat: number | null;
    onBackToLobby: () => void;
    features: PlatformFeatures;
};

export type PlatformFeatures = {
    accounts: boolean;
    settings: boolean;
};

export type FrontendGamePlugin = {
    features: PlatformFeatures;
    GameScreen: ComponentType<GameScreenProps>;
    SettingsPanel: ComponentType<Record<string, unknown>>;
    defaultSettings: unknown;
    resolveSettings: (settings: unknown) => unknown;
};
