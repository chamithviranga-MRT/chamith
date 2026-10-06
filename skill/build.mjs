// Builds the LendMatch skill:
//   .claude/skills/lendmatch/   the installed project skill (Claude Code loads it from the repo)
//   docs/lendmatch.skill        the same folder zipped, for "Save skill" in the Claude app
// Run: npm run skill:build   (re-exports nothing: run `npm run demo:snapshot` first if you want fresh data)
import { build } from "esbuild";
import JSZip from "jszip";
import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const out = resolve(root, ".claude/skills/lendmatch");
const snapshotFile = resolve(root, "demo/snapshot.json");
if (!existsSync(snapshotFile)) throw new Error("demo/snapshot.json is missing: run `npm run demo:snapshot` first.");
const snap = JSON.parse(readFileSync(snapshotFile, "utf8"));

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "scripts"), { recursive: true });
mkdirSync(join(out, "assets"), { recursive: true });
mkdirSync(join(out, "references"), { recursive: true });

// 1. the matcher, bundled into one dependency-free file
await build({
  entryPoints: [resolve(root, "skill/match.ts")],
  outfile: join(out, "scripts/match.mjs"),
  bundle: true, platform: "node", format: "esm", target: "node18", minify: false, logLevel: "warning",
  tsconfig: resolve(root, "tsconfig.json"),
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{
    name: "stub-sdk", // the Anthropic SDK is never used offline (no client is ever created)
    setup(b) {
      b.onResolve({ filter: /^@anthropic-ai\/sdk$/ }, () => ({ path: "sdk-stub", namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default class Anthropic {}; export class BadRequestError extends Error {}", loader: "js" }));
    },
  }],
});
chmodSync(join(out, "scripts/match.mjs"), 0o755);

// 2. data and references
cpSync(snapshotFile, join(out, "assets/lender-snapshot.json"));
writeFileSync(join(out, "references/profile-fields.md"), execFileSync("node", [join(out, "scripts/match.mjs"), "--schema"], { encoding: "utf8" }));

// 3. SKILL.md with the snapshot's own numbers filled in
const date = new Date(snap.exportedAt).toISOString().slice(0, 10);
const skill = readFileSync(resolve(root, "skill/SKILL.md"), "utf8")
  .replaceAll("{{DATE}}", date).replaceAll("{{LENDERS}}", String(snap.lenders.length)).replaceAll("{{PRODUCTS}}", String(snap.products.length));
writeFileSync(join(out, "SKILL.md"), skill);

// 4. validate the frontmatter the way the skill loader does
const fm = /^---\n([\s\S]*?)\n---/.exec(skill)?.[1] ?? "";
const name = /^name:\s*(.+)$/m.exec(fm)?.[1]?.trim() ?? "";
const description = /^description:\s*([\s\S]*?)(?=\n[a-z-]+:|$)/m.exec(fm)?.[1]?.trim() ?? "";
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) throw new Error(`bad skill name: ${name}`);
if (!description || description.length > 1024 || /[<>]/.test(description)) throw new Error(`bad description (${description.length} chars, no angle brackets allowed)`);
if (skill.includes("{{")) throw new Error("unfilled placeholder in SKILL.md");

// 5. zip: <skill-name>/... (the same layout the official packager produces)
const zip = new JSZip();
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
for (const f of walk(out).sort()) zip.file(`lendmatch/${relative(out, f)}`, readFileSync(f), { createFolders: false, unixPermissions: f.endsWith(".mjs") ? 0o755 : 0o644 });
const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", platform: "UNIX" });
mkdirSync(resolve(root, "docs"), { recursive: true });
writeFileSync(resolve(root, "docs/lendmatch.skill"), buf);
console.log(`skill: ${walk(out).length} files, description ${description.length} chars, data read ${date}; docs/lendmatch.skill ${(buf.length / 1024).toFixed(0)} KB`);
