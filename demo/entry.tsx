import { createRoot } from "react-dom/client";
import { Chat } from "@/components/Chat";
import { installDemoBackend, snapshotAgeDays, type Snapshot } from "./backend";
import snapshot from "./snapshot.json";

const snap = snapshot as unknown as Snapshot;
installDemoBackend(snap);

function DemoBanner() {
  const age = snapshotAgeDays(snap);
  const stale = age > 7;
  const when = new Date(snap.exportedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  return (
    <div className="demo-banner" role="note">
      <strong>Offline demo.</strong> Ranks a frozen snapshot of real lender pages read on {when} ({snap.lenders.length} lenders, {snap.products.length} products). It cannot browse the web or call Claude:
      profile extraction is simple pattern matching, reasoning is verified templates, and “Refresh this lender” is off. The engine, filters, scoring, cost math, follow-ups and exports are the real ones, and nothing leaves your browser.
      <span className={stale ? "demo-stale" : ""}> Snapshot is {age} day{age === 1 ? "" : "s"} old{stale ? " — older than the 7-day limit, so treat it as illustrative, not current." : "."}</span>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <>
    <DemoBanner />
    <Chat />
  </>
);
