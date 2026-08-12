import { useEffect, useRef } from "react";

function isTextEditable(target: EventTarget | null): target is HTMLElement {
    if (!(target instanceof HTMLElement)) return false;

    const tagName = target.tagName.toLowerCase();
    return tagName === "input" || tagName === "textarea" || target.isContentEditable;
}

export function useRestoreViewportAfterInputBlur() {
    const scrollPositionRef = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const isTouchViewport = window.matchMedia("(pointer: coarse)").matches;
        if (!isTouchViewport) return;

        const rememberScrollPosition = (event: FocusEvent) => {
            if (!isTextEditable(event.target)) return;

            scrollPositionRef.current = {
                x: window.scrollX,
                y: window.scrollY,
            };
        };

        const restoreScrollPosition = (event: FocusEvent) => {
            if (!isTextEditable(event.target)) return;

            const { x, y } = scrollPositionRef.current;

            window.setTimeout(() => {
                window.scrollTo({ left: x, top: y, behavior: "instant" });
            }, 80);
            window.setTimeout(() => {
                window.scrollTo({ left: x, top: y, behavior: "instant" });
            }, 260);
        };

        document.addEventListener("focusin", rememberScrollPosition);
        document.addEventListener("focusout", restoreScrollPosition);

        return () => {
            document.removeEventListener("focusin", rememberScrollPosition);
            document.removeEventListener("focusout", restoreScrollPosition);
        };
    }, []);
}
