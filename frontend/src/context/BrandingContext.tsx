import { createContext, useContext, type ReactNode } from "react";

export type PlatformBranding = {
    name: string;
};

const BrandingContext = createContext<PlatformBranding>({ name: "GameTable" });

export function BrandingProvider({
    branding,
    children,
}: {
    branding: PlatformBranding;
    children: ReactNode;
}) {
    return (
        <BrandingContext.Provider value={branding}>
            {children}
        </BrandingContext.Provider>
    );
}

export function useBranding() {
    return useContext(BrandingContext);
}

