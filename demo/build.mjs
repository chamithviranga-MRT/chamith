// Builds docs/lendmatch-demo.html: the real UI + engine + a data snapshot, as one self-contained file.
//   npm run build && npx tsx demo/export-snapshot.ts && node demo/build.mjs
import { build } from "esbuild";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const cssDir = resolve(root, ".next/static/css");
const cssFile = readdirSync(cssDir).find((f) => f.endsWith(".css"));
if (!cssFile) throw new Error("Run `npm run build` first: the Tailwind CSS is taken from .next/static/css.");
const css = readFileSync(resolve(cssDir, cssFile), "utf8");

const stubs = {
  // the Anthropic SDK is never used offline (no client is created)
  "@anthropic-ai/sdk": "export default class Anthropic {}; export class BadRequestError extends Error {}",
};
const result = await build({
  entryPoints: [resolve(root, "demo/entry.tsx")],
  bundle: true, write: false, minify: true, format: "iife", platform: "browser", target: "es2020",
  jsx: "automatic", loader: { ".json": "json" }, logLevel: "warning",
  define: { "process.env.NODE_ENV": '"production"' },
  inject: [resolve(root, "demo/shims.js")],
  tsconfig: resolve(root, "tsconfig.json"),
  plugins: [{
    name: "demo-resolve",
    setup(b) {
      b.onResolve({ filter: /^@anthropic-ai\/sdk$/ }, () => ({ path: "anthropic-stub", namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: stubs["@anthropic-ai/sdk"], loader: "js" }));
      b.onResolve({ filter: /^pdfkit$/ }, () => ({ path: resolve(root, "node_modules/pdfkit/js/pdfkit.standalone.js") }));
    },
  }],
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LendMatch (offline demo)</title>
<style>${css}</style>
<style>
.demo-banner{max-width:56rem;margin:.75rem auto 0;padding:.6rem .8rem;border:1px solid #c4b5fd;background:#f5f3ff;color:#3b0764;border-radius:.6rem;font-size:.75rem;line-height:1.45}
.demo-stale{color:#b91c1c;font-weight:600}
@media (prefers-color-scheme:dark){.demo-banner{background:#1e1b4b;border-color:#4c1d95;color:#ddd6fe}.demo-stale{color:#fca5a5}}
@media (max-width:60rem){.demo-banner{margin:.75rem 1rem 0}}
</style>
</head>
<body class="min-h-screen antialiased">
<div id="root"></div>
<script>${js}</script>
</body>
</html>`;
mkdirSync(resolve(root, "docs"), { recursive: true });
const out = resolve(root, "docs/lendmatch-demo.html");
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
