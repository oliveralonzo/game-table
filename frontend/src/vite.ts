import type { PlatformBranding } from "./context/BrandingContext.js";

const marker = "<!-- game-table:initial-loader -->";

// Inline and self-contained: these styles must paint before the app bundle arrives.
const styles = `
#game-table-initial-loader {
  position: fixed;
  inset: 0;
  z-index: 2;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  color: #000;
  background: #efeff4;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  text-align: center;
}
#game-table-initial-loader .game-table-loader-title {
  font-family: "Lexend", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 1.875rem;
  line-height: 2.25rem;
  font-weight: 700;
  letter-spacing: 0;
}
#game-table-initial-loader .game-table-loader-bar {
  width: 6rem;
  height: 0.375rem;
  margin: 1rem auto 0;
  overflow: hidden;
  border-radius: 999px;
  background: rgb(0 0 0 / 0.1);
}
#game-table-initial-loader .game-table-loader-bar::before {
  content: "";
  display: block;
  width: 50%;
  height: 100%;
  border-radius: inherit;
  background: currentColor;
  animation: game-table-initial-loading-slide 1.05s ease-in-out infinite;
}
@media (prefers-color-scheme: dark) {
  #game-table-initial-loader { color: #fff; background: #000; }
  #game-table-initial-loader .game-table-loader-bar { background: rgb(255 255 255 / 0.15); }
}
@media (prefers-reduced-motion: reduce) {
  #game-table-initial-loader .game-table-loader-bar::before { animation: none; margin: 0 auto; }
}
@keyframes game-table-initial-loading-slide {
  0% { transform: translateX(-110%); }
  50% { transform: translateX(60%); }
  100% { transform: translateX(210%); }
}
`;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

/** Insert the loader marker inside React's root so the first commit replaces it.
 * This build-only entry point intentionally has no browser or React dependencies.
 */
export function gameTableLoadingPage(branding: PlatformBranding, options: { loadingLabel?: string } = {}) {
  const name = escapeHtml(branding.name);
  const label = escapeHtml(options.loadingLabel ?? `Loading ${branding.name}`);
  return {
    name: "game-table:initial-loader",
    transformIndexHtml: {
      order: "pre" as const,
      handler(html: string) {
        if (html.split(marker).length !== 2) {
          throw new Error(`game-table: put exactly one ${marker} inside your React root in index.html`);
        }
        return {
          html: html.replace(marker, () => `<div id="game-table-initial-loader" role="status" aria-label="${label}">
  <div>
    <div class="game-table-loader-title">${name}</div>
    <div class="game-table-loader-bar" aria-hidden="true"></div>
  </div>
</div>`),
          tags: [{ tag: "style", children: styles, injectTo: "head" as const }],
        };
      },
    },
  };
}
