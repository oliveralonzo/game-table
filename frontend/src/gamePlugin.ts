import type { ComponentType, PropsWithChildren, ReactNode } from "react";
import type { PlatformBranding } from "game-table/context/BrandingContext";

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

export type GameTranslations = Record<string, Record<string, unknown>>;

export type FrontendGamePlugin = {
    branding: PlatformBranding;
    features: PlatformFeatures;
    GameScreen: ComponentType<GameScreenProps>;
    SettingsPanel: ComponentType<Record<string, unknown>>;
    defaultSettings: unknown;
    resolveSettings: (settings: unknown) => unknown;
    settingsIndicator?: (rules: unknown, language: string) => { label: string; icon: ReactNode };
    translations?: GameTranslations;
    Provider?: ComponentType<PropsWithChildren>;
};
