import {
  AlignmentType, BorderStyle, Document, ExternalHyperlink, Footer, HeadingLevel, Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import { fmtDate } from "@/lib/report/format";
import type { Report } from "@/lib/report/types";
import { COMPONENT_LABEL, COMPONENT_ORDER, gateSummaryLines, profileLines } from "./text";

const run = (text: string, o: { bold?: boolean; color?: string; size?: number; italics?: boolean } = {}) => new TextRun({ text, bold: o.bold, color: o.color, size: o.size, italics: o.italics });
const p = (text: string, o: { bold?: boolean; color?: string; size?: number; italics?: boolean; after?: number; indent?: number } = {}) =>
  new Paragraph({ children: [run(text, o)], spacing: { after: o.after ?? 80 }, indent: o.indent ? { left: o.indent } : undefined });
const bullet = (text: string, o: { color?: string; size?: number } = {}) => new Paragraph({ children: [run(text, o)], bullet: { level: 0 }, spacing: { after: 40 } });
const h = (text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_1) => new Paragraph({ text, heading: level, spacing: { before: 240, after: 100 } });
const link = (url: string, prefix: string) =>
  new Paragraph({ children: [run(prefix, { size: 18, color: "475569" }), new ExternalHyperlink({ link: url, children: [new TextRun({ text: url, style: "Hyperlink", size: 18 })] })], spacing: { after: 120 } });

const border = { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" };
const cell = (text: string, o: { bold?: boolean; fill?: string; width?: number } = {}) =>
  new TableCell({
    children: [new Paragraph({ children: [run(text, { bold: o.bold, size: 17 })] })],
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: "auto" } : undefined,
    width: o.width ? { size: o.width, type: WidthType.PERCENTAGE } : undefined,
    borders: { top: border, bottom: border, left: border, right: border },
  });

export async function renderDocx(report: Report): Promise<Buffer> {
  const children: Array<Paragraph | Table> = [];

  children.push(new Paragraph({ children: [run("Lend", { bold: true, size: 48, color: "4338CA" }), run("Match", { bold: true, size: 48, color: "A21CAF" })] }));
  children.push(p(`Ranked lender matches | generated ${fmtDate(report.generatedAt)} | ${report.stats.sourcesRead} sources read live, ${report.stats.sourcesFromCache} from cache`, { color: "475569", size: 20 }));
  children.push(
    new Paragraph({
      children: [run("NOTICE: ", { bold: true, color: "78350F", size: 19 }), run(report.disclaimer, { color: "78350F", size: 19 })],
      shading: { type: ShadingType.CLEAR, fill: "FFFBEB", color: "auto" },
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: "F59E0B" }, bottom: { style: BorderStyle.SINGLE, size: 6, color: "F59E0B" }, left: { style: BorderStyle.SINGLE, size: 6, color: "F59E0B" }, right: { style: BorderStyle.SINGLE, size: 6, color: "F59E0B" } },
      spacing: { before: 120, after: 160 },
    })
  );

  children.push(h("Your profile"));
  for (const [k, v] of profileLines(report.profile)) children.push(new Paragraph({ children: [run(`${k}: `, { bold: true, size: 19 }), run(v, { size: 19 })], spacing: { after: 40 } }));
  if (report.profile.assumptions.length) {
    children.push(p("Assumptions made:", { bold: true, size: 19 }));
    for (const a of report.profile.assumptions) children.push(bullet(a, { color: "475569", size: 18 }));
  }

  children.push(h(`Top ${report.items.length} matches`));
  if (!report.items.length) children.push(p("No product passed every hard filter. See near misses and the gates that removed products below."));
  else {
    const head = ["#", "Lender", "Product", "Score", "Amount", "Rate", "Term", "Speed"];
    const widths = [4, 15, 19, 7, 16, 15, 12, 12];
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ tableHeader: true, children: head.map((t, i) => cell(t, { bold: true, fill: "E0E7FF", width: widths[i] })) }),
          ...report.items.map((it) => new TableRow({ children: [String(it.rank), it.lenderName, it.productName, it.score.toFixed(1), it.amountRange, it.rateRange, it.termRange, it.speed].map((t, i) => cell(t, { width: widths[i] })) })),
        ],
      })
    );
  }

  children.push(h("Details, reasoning and sources"));
  for (const it of report.items) {
    children.push(new Paragraph({ children: [run(`#${it.rank}  ${it.label}  |  ${it.lenderName} - ${it.productName}`, { bold: true, size: 26, color: it.label === "Pink Diamond" ? "A21CAF" : "0369A1" })], heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 60 } }));
    children.push(p(`${it.typeLabel} | ${it.category} lender | Score ${it.score.toFixed(1)}/100 | Data ${it.ageDays === 0 ? "scraped today" : `${it.ageDays} day(s) old`}${it.isMarketplace ? " | Marketplace" : ""}${it.lenderSource === "discovered" ? " | Discovered lender" : ""}`, { color: "475569", size: 18 }));
    children.push(p(`Amount: ${it.amountRange}   Rate: ${it.rateRange}   Term: ${it.termRange}   Speed: ${it.speed}`, { size: 19 }));
    if (it.fees.length) children.push(p(`Fees: ${it.fees.join("; ")}`, { size: 19 }));
    if (it.requirements.length) {
      children.push(p("Requirements (as published):", { bold: true, size: 19 }));
      for (const r of it.requirements) children.push(bullet(r, { size: 18 }));
    }
    children.push(p("Why it fits", { bold: true, size: 20 }), p(it.reasoning.whyItFits, { indent: 200 }));
    children.push(p("What could block approval", { bold: true, size: 20 }), p(it.reasoning.couldBlock, { indent: 200 }));
    children.push(p("Estimated monthly payment", { bold: true, size: 20 }), p(it.reasoning.estimatedPayment, { indent: 200 }));
    children.push(p("Next step", { bold: true, size: 20 }), p(it.reasoning.nextStep, { indent: 200 }));
    children.push(link(it.sourceUrl, `Source (scraped ${fmtDate(it.scrapedAt)}): `));
    children.push(p(`Reasoning written by: ${it.reasoning.source === "claude" ? "Claude, from verified fields only" : "template, from verified fields only"}`, { color: "64748B", size: 15, italics: true }));
  }

  if (report.nearMisses.length) {
    children.push(h("Near misses: what you would need to change"));
    for (const n of report.nearMisses) {
      children.push(p(`${n.lenderName} - ${n.productName} (${n.typeLabel}, ${n.category})`, { bold: true, size: 19 }));
      for (const f of n.fixes) children.push(bullet(f, { size: 18 }));
      children.push(link(n.sourceUrl, `Source (scraped ${fmtDate(n.scrapedAt)}): `));
    }
  }

  children.push(h("How I decided"));
  children.push(p("1. Hard filters", { bold: true }));
  children.push(p("A product is removed if the lender's published rules rule you out. Unpublished rules are never treated as a pass; they are flagged for you to confirm.", { size: 19 }));
  const lines = gateSummaryLines(report);
  for (const l of lines.length ? lines : ["No product was removed by a hard filter."]) children.push(bullet(l, { size: 18 }));
  for (const n of report.notes) children.push(bullet(n, { size: 18, color: "475569" }));
  children.push(p("2. Weighted score (0-100)", { bold: true }));
  children.push(p(COMPONENT_ORDER.map((k) => `${COMPONENT_LABEL[k]} ${report.weights[k]}`).join(" | "), { size: 19 }));
  children.push(p("Ranking never depends on commissions or referral fees.", { size: 18, color: "475569" }));
  if (report.items.length) {
    const comps = [...COMPONENT_ORDER];
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ tableHeader: true, children: ["#", "Lender / product", ...comps.map((c) => COMPONENT_LABEL[c]), "Total"].map((t) => cell(t, { bold: true, fill: "E0E7FF" })) }),
          ...report.items.map((it) => new TableRow({ children: [String(it.rank), `${it.lenderName} - ${it.productName}`, ...comps.map((c) => it.breakdown[c].toFixed(0)), it.score.toFixed(1)].map((t) => cell(t)) })),
        ],
      })
    );
  }
  children.push(p("3. Cost and payment formulas (estimates)", { bold: true }));
  const seen = new Set<string>();
  for (const it of report.items) {
    if (!seen.has(it.cost.formula)) {
      seen.add(it.cost.formula);
      children.push(bullet(it.cost.formula, { size: 18 }));
    }
  }
  for (const it of report.items) {
    children.push(p(`#${it.rank} ${it.lenderName}: assumptions`, { bold: true, size: 18 }));
    for (const a of it.cost.assumptions) children.push(bullet(a, { size: 17, color: "475569" }));
  }
  const unavailable = report.lenders.filter((l) => l.status === "unavailable" || l.status === "blocked");
  if (unavailable.length) {
    children.push(p("4. Lenders with data unavailable (no numbers were invented)", { bold: true }));
    for (const l of unavailable) children.push(bullet(`${l.name}: ${l.reason ?? "no usable data"}`, { size: 18 }));
  }

  const doc = new Document({
    creator: "LendMatch",
    title: "LendMatch report",
    description: "Ranked US lending matches (informational only)",
    sections: [
      {
        children,
        footers: {
          default: new Footer({
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run("LendMatch | Informational only - not financial or legal advice. Rates change; confirm with the lender. | Page ", { size: 14, color: "64748B" }), new TextRun({ children: [PageNumber.CURRENT], size: 14, color: "64748B" })] })],
          }),
        },
      },
    ],
  });
  return Packer.toBuffer(doc);
}
