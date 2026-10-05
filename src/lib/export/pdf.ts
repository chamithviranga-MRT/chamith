import PDFDocument from "pdfkit";
import { fmtDate } from "@/lib/report/format";
import type { Report, ReportItem } from "@/lib/report/types";
import { COMPONENT_LABEL, COMPONENT_ORDER, gateSummaryLines, pdfSafe, profileLines } from "./text";

const INDIGO = "#4338ca";
const FUCHSIA = "#a21caf";
const GREY = "#475569";
const M = 48;

export async function renderPdf(report: Report, opts: { compress?: boolean } = {}): Promise<Buffer> {
  const doc = new PDFDocument({ size: "LETTER", margin: M, bufferPages: true, compress: opts.compress ?? true, info: { Title: "LendMatch report", Author: "LendMatch", Subject: "Ranked US lending matches (informational only)" } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  const W = doc.page.width - M * 2;
  const t = (s: string) => pdfSafe(s);
  const ensure = (h: number) => {
    if (doc.y + h > doc.page.height - M - 30) doc.addPage();
  };
  const h1 = (s: string) => {
    ensure(40);
    doc.x = M;
    doc.moveDown(0.6).font("Helvetica-Bold").fontSize(15).fillColor(INDIGO).text(t(s), M, undefined, { width: W }).moveDown(0.2);
    doc.fillColor("black").font("Helvetica").fontSize(9.5);
  };
  const para = (s: string, o: { bold?: boolean; color?: string; size?: number; indent?: number } = {}) => {
    doc.font(o.bold ? "Helvetica-Bold" : "Helvetica").fontSize(o.size ?? 9.5).fillColor(o.color ?? "black").text(t(s), M + (o.indent ?? 0), undefined, { width: W - (o.indent ?? 0) });
  };
  const bullet = (s: string, o: { color?: string; size?: number } = {}) => {
    doc.font("Helvetica").fontSize(o.size ?? 9).fillColor(o.color ?? "black").text(t(`- ${s}`), M + 10, undefined, { width: W - 10 });
  };
  const link = (url: string, prefix: string) => {
    doc.font("Helvetica").fontSize(8.5).fillColor(GREY).text(t(prefix), M, undefined, { width: W, continued: true });
    doc.fillColor("#1d4ed8").text(url, { link: url, underline: true, continued: false });
    doc.fillColor("black");
  };

  // ---- title + notice -----------------------------------------------------------------------
  doc.font("Helvetica-Bold").fontSize(24).fillColor(INDIGO).text("Lend", { continued: true }).fillColor(FUCHSIA).text("Match").fillColor("black");
  doc.font("Helvetica").fontSize(10).fillColor(GREY).text(t(`Ranked lender matches | generated ${fmtDate(report.generatedAt)} | ${report.stats.sourcesRead} sources read live, ${report.stats.sourcesFromCache} from cache`));
  doc.moveDown(0.6);
  const noticeY = doc.y;
  doc.font("Helvetica").fontSize(9);
  const noticeH = doc.heightOfString(t(`NOTICE: ${report.disclaimer}`), { width: W - 16 }) + 14;
  doc.roundedRect(M, noticeY, W, noticeH, 4).fillAndStroke("#fffbeb", "#f59e0b");
  doc.fillColor("#78350f").text(t(`NOTICE: ${report.disclaimer}`), M + 8, noticeY + 7, { width: W - 16 });
  doc.x = M;
  doc.y = noticeY + noticeH + 8;
  doc.fillColor("black");

  // ---- profile -------------------------------------------------------------------------------
  h1("Your profile");
  for (const [k, v] of profileLines(report.profile)) {
    doc.font("Helvetica-Bold").fontSize(9).text(t(`${k}: `), M, undefined, { continued: true, width: W }).font("Helvetica").text(t(v));
  }
  if (report.profile.assumptions.length) {
    doc.moveDown(0.3);
    para("Assumptions made:", { bold: true, size: 9 });
    for (const a of report.profile.assumptions) bullet(a, { color: GREY, size: 8.5 });
  }

  // ---- summary table -------------------------------------------------------------------------
  h1(`Top ${report.items.length} matches`);
  if (!report.items.length) para("No product passed every hard filter. See near misses and the gates that removed products below.");
  const cols: Array<[string, number]> = [["#", 20], ["Lender", 86], ["Product", 108], ["Score", 32], ["Amount", 84], ["Rate", 78], ["Term", 60], ["Speed", 48]]; // = 516pt = page width minus margins
  const cell = (it: ReportItem): string[] => [String(it.rank), it.lenderName, it.productName, it.score.toFixed(1), it.amountRange, it.rateRange, it.termRange, it.speed];
  const drawRow = (vals: string[], header = false) => {
    doc.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(7.5);
    const heights = vals.map((v, i) => doc.heightOfString(t(v), { width: cols[i][1] - 4 }));
    const h = Math.max(...heights) + 6;
    ensure(h);
    const y = doc.y;
    if (header) doc.rect(M, y, W, h).fill("#e0e7ff");
    doc.fillColor("black");
    let x = M;
    vals.forEach((v, i) => {
      doc.text(t(v), x + 2, y + 3, { width: cols[i][1] - 4 });
      x += cols[i][1];
    });
    doc.moveTo(M, y + h).lineTo(M + W, y + h).strokeColor("#cbd5e1").lineWidth(0.5).stroke();
    doc.x = M;
    doc.y = y + h;
  };
  if (report.items.length) {
    drawRow(cols.map((c) => c[0]), true);
    for (const it of report.items) drawRow(cell(it));
  }

  // ---- detail per pick -----------------------------------------------------------------------
  h1("Details, reasoning and sources");
  for (const it of report.items) {
    ensure(180);
    doc.x = M;
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").fontSize(12).fillColor(it.label === "Pink Diamond" ? FUCHSIA : "#0369a1").text(t(`#${it.rank}  ${it.label}  |  ${it.lenderName} - ${it.productName}`), M, undefined, { width: W });
    para(`${it.typeLabel}  |  ${it.category} lender  |  Score ${it.score.toFixed(1)}/100  |  Data ${it.ageDays === 0 ? "scraped today" : `${it.ageDays} day(s) old`}${it.isMarketplace ? "  |  Marketplace" : ""}${it.lenderSource === "discovered" ? "  |  Discovered lender" : ""}`, { color: GREY, size: 8.5 });
    para(`Amount: ${it.amountRange}   Rate: ${it.rateRange}   Term: ${it.termRange}   Speed: ${it.speed}`, { size: 9 });
    if (it.fees.length) para(`Fees: ${it.fees.join("; ")}`, { size: 9 });
    if (it.requirements.length) {
      para("Requirements (as published):", { bold: true, size: 9 });
      for (const r of it.requirements) bullet(r);
    }
    para("Why it fits", { bold: true, size: 9.5 });
    para(it.reasoning.whyItFits, { indent: 8 });
    para("What could block approval", { bold: true, size: 9.5 });
    para(it.reasoning.couldBlock, { indent: 8 });
    para("Estimated monthly payment", { bold: true, size: 9.5 });
    para(it.reasoning.estimatedPayment, { indent: 8 });
    para("Next step", { bold: true, size: 9.5 });
    para(it.reasoning.nextStep, { indent: 8 });
    link(it.sourceUrl, `Source (scraped ${fmtDate(it.scrapedAt)}): `);
    para(`Reasoning written by: ${it.reasoning.source === "claude" ? "Claude, from verified fields only" : "template, from verified fields only"}`, { color: GREY, size: 7.5 });
    doc.moveTo(M, doc.y + 4).lineTo(M + W, doc.y + 4).strokeColor("#e2e8f0").lineWidth(0.5).stroke();
    doc.y += 8;
  }

  // ---- near misses ---------------------------------------------------------------------------
  if (report.nearMisses.length) {
    h1("Near misses: what you would need to change");
    for (const n of report.nearMisses) {
      ensure(60);
      para(`${n.lenderName} - ${n.productName} (${n.typeLabel}, ${n.category})`, { bold: true, size: 9.5 });
      for (const f of n.fixes) bullet(f);
      link(n.sourceUrl, `Source (scraped ${fmtDate(n.scrapedAt)}): `);
      doc.moveDown(0.3);
    }
  }

  // ---- how I decided -------------------------------------------------------------------------
  doc.addPage();
  h1("How I decided");
  para("1. Hard filters", { bold: true });
  para("A product is removed if the lender's published rules rule you out (amount, minimum FICO, time in business, revenue, state or country exclusions, residency/citizenship, permitted use, and collateral / guarantee / lien terms you will not accept). Unpublished rules are never treated as a pass; they are flagged for you to confirm.", { size: 9 });
  for (const l of gateSummaryLines(report)) bullet(l);
  if (!Object.keys(report.gateSummary).length) bullet("No product was removed by a hard filter.");
  for (const n of report.notes) bullet(n, { color: GREY });
  doc.moveDown(0.4);
  para("2. Weighted score (0-100)", { bold: true });
  para(COMPONENT_ORDER.map((k) => `${COMPONENT_LABEL[k]} ${report.weights[k]}`).join("  |  "), { size: 9 });
  para("Ranking never depends on commissions or referral fees.", { size: 9, color: GREY });
  for (const it of report.items) {
    ensure(34);
    para(`#${it.rank} ${it.lenderName} - ${it.productName}: ${COMPONENT_ORDER.map((k) => `${COMPONENT_LABEL[k]} ${it.breakdown[k].toFixed(0)}`).join(", ")}  =>  ${it.score.toFixed(1)}`, { size: 8 });
  }
  doc.moveDown(0.4);
  para("3. Cost and payment formulas (estimates)", { bold: true });
  const seen = new Set<string>();
  for (const it of report.items) {
    if (!seen.has(it.cost.formula)) {
      seen.add(it.cost.formula);
      bullet(it.cost.formula, { size: 8.5 });
    }
  }
  for (const it of report.items) {
    ensure(30);
    para(`#${it.rank} ${it.lenderName}: assumptions`, { bold: true, size: 8.5 });
    for (const a of it.cost.assumptions) bullet(a, { size: 8, color: GREY });
  }
  const unavailable = report.lenders.filter((l) => l.status === "unavailable" || l.status === "blocked");
  if (unavailable.length) {
    doc.moveDown(0.4);
    para("4. Lenders with data unavailable (no numbers were invented)", { bold: true });
    for (const l of unavailable) bullet(`${l.name}: ${l.reason ?? "no usable data"}`, { size: 8.5 });
  }

  // ---- footer on every page ------------------------------------------------------------------
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font("Helvetica").fontSize(7).fillColor("#64748b");
    doc.text(t(`LendMatch | Informational only - not financial or legal advice. Rates change; confirm with the lender. | Page ${i + 1} of ${range.count}`), M, doc.page.height - 32, { width: W, align: "center", lineBreak: false });
  }
  doc.end();
  return done;
}
