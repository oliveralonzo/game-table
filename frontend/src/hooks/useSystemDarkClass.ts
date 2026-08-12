import { useLayoutEffect } from "react";

const DARK_QUERY = "(prefers-color-scheme: dark)";
const LIGHT_THEME_COLOR = "#efeff4";
const DARK_THEME_COLOR = "#000000";

function getCurrentThemeColor() {
    return document.documentElement.classList.contains("dark")
        ? DARK_THEME_COLOR
        : LIGHT_THEME_COLOR;
}

function getOrCreateThemeColorMeta() {
    const themeColorMetas = Array.from(
        document.querySelectorAll<HTMLMetaElement>("meta[name='theme-color']")
    );
    let meta = themeColorMetas.find((candidate) => (
        candidate.dataset.gameTableThemeColor === "true"
    ));

    if (!meta) {
        meta = document.createElement("meta");
        meta.name = "theme-color";
        meta.dataset.gameTableThemeColor = "true";
        document.head.appendChild(meta);
    }

    themeColorMetas.forEach((candidate) => {
        if (candidate !== meta) candidate.remove();
    });

    return meta;
}

export function refreshSafariThemeColor() {
    if (typeof document === "undefined") return;

    const meta = getOrCreateThemeColorMeta();
    const color = getCurrentThemeColor();

    meta.content = color;
    meta.remove();
    document.head.appendChild(meta);

    window.requestAnimationFrame(() => {
        meta.content = color;
    });
}

function syncSystemDarkClass(media: MediaQueryList) {
    const isDark = media.matches;

    document.documentElement.classList.toggle("dark", media.matches);
    document.documentElement.style.colorScheme = isDark
        ? "dark"
        : "light";

    refreshSafariThemeColor();
}

export function useSystemDarkClass() {
    useLayoutEffect(() => {
        const media = window.matchMedia(DARK_QUERY);

        const syncDarkClass = () => syncSystemDarkClass(media);

        syncDarkClass();
        media.addEventListener("change", syncDarkClass);

        return () => {
            media.removeEventListener("change", syncDarkClass);
        };
    }, []);
}

if (typeof window !== "undefined") {
    syncSystemDarkClass(window.matchMedia(DARK_QUERY));
}
