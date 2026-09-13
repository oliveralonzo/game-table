import assert from "node:assert/strict";
import { test } from "node:test";
import { gameTableLoadingPage } from "../dist/vite.js";

const marker = "<!-- game-table:initial-loader -->";
const page = `<html><head></head><body><div id="root">${marker}</div></body></html>`;

test("inserts a self-contained branded loader inside the React root", () => {
  const result = gameTableLoadingPage({ name: "sessenta6" }, {
    loadingLabel: "Carregando sessenta6",
  }).transformIndexHtml.handler(page);
  assert.match(result.html, /id="root"><div id="game-table-initial-loader"/);
  assert.match(result.html, /aria-label="Carregando sessenta6"/);
  assert.match(result.html, /class="game-table-loader-title">sessenta6</);
  assert.ok(!result.html.includes(marker));
  assert.equal(result.tags[0].injectTo, "head");
  assert.match(result.tags[0].children, /prefers-color-scheme: dark/);
  assert.match(result.tags[0].children, /prefers-reduced-motion: reduce/);
  assert.ok(!result.tags[0].children.includes("url("));
});

test("escapes branding and accessible labels without interpreting replacement tokens", () => {
  const result = gameTableLoadingPage({ name: `<script>"A & B"</script> $&` }, {
    loadingLabel: `Loading 'game' <&>`,
  }).transformIndexHtml.handler(page);
  assert.match(result.html, /&lt;script&gt;&quot;A &amp; B&quot;&lt;\/script&gt; \$&amp;/);
  assert.match(result.html, /Loading &#39;game&#39; &lt;&amp;&gt;/);
  assert.ok(!result.html.includes("<script>"));
  assert.ok(!result.html.includes(marker));
});

test("fails clearly when the loader placeholder is absent or repeated", () => {
  const { handler } = gameTableLoadingPage({ name: "doble6" }).transformIndexHtml;
  assert.throws(() => handler('<div id="root"></div>'), /exactly one/);
  assert.throws(() => handler(marker + marker), /exactly one/);
  assert.match(handler(page).html, /aria-label="Loading doble6"/);
});
