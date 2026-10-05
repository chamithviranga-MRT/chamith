import { describe, expect, it } from "vitest";
import { initialProgress, progressReducer, scanningTicker, type ProgressState } from "@/lib/client/progress";
import { readNdjson, type StreamEvent } from "@/lib/client/ndjson";
import { ndjsonResponse } from "@/lib/ndjson";

const fold = (events: Array<[string, any]>): ProgressState => events.reduce((s, [event, data]) => progressReducer(s, { event, data }), initialProgress);

describe("progress reducer", () => {
  it("tracks lenders, live source counts and discoveries", () => {
    const s = fold([
      ["stage", { message: "Scanning 3 lenders…" }],
      ["lender", { slug: "sofi", name: "SoFi", status: "scanning" }],
      ["lender", { slug: "bhg", name: "BHG Financial", status: "scanning" }],
      ["counts", { sourcesRead: 2, sourcesFromCache: 1, lendersDone: 0, lendersTotal: 3, productsFound: 0 }],
      ["lender", { slug: "sofi", name: "SoFi", status: "done", products: 2 }],
      ["discovered", { name: "Acme CDFI", domain: "acmecdfi.org" }],
      ["discovered", { name: "Acme CDFI", domain: "acmecdfi.org" }],
      ["lender", { slug: "bluevine", name: "Bluevine", status: "scanning" }],
      ["counts", { sourcesRead: 5, sourcesFromCache: 1, lendersDone: 1, lendersTotal: 3, productsFound: 2 }],
    ]);
    expect(s).toMatchObject({ sourcesRead: 5, sourcesFromCache: 1, lendersDone: 1, lendersTotal: 3, productsFound: 2 });
    expect(s.lenders.find((l) => l.slug === "sofi")).toMatchObject({ status: "done", products: 2 });
    expect(s.discovered).toHaveLength(1);
    expect(scanningTicker(s)).toBe("Scanning BHG Financial... Bluevine...");
  });
  it("ticker truncates when many lenders are active; reports completion and errors", () => {
    const events: Array<[string, any]> = ["A", "B", "C", "D", "E"].map((n) => ["lender", { slug: n, name: n, status: "scanning" }]);
    expect(scanningTicker(fold(events))).toBe("Scanning C... D... E... (+2 more)");
    expect(scanningTicker(fold([["pipeline_done", {}]]))).toBe("Finished scanning.");
    expect(fold([["error", { message: "Firecrawl rejected the request (402)" }]]).error).toMatch(/402/);
  });
});

describe("NDJSON transport (server -> client round trip)", () => {
  it("streams events in order, split across arbitrary chunk boundaries", async () => {
    const req = new Request("http://x/api/research", { method: "POST" });
    const res = ndjsonResponse(async (send) => {
      send("stage", { message: "a" });
      send("lender", { slug: "x", name: "Ünïcode Lender 🚀", status: "scanning" });
      send("counts", { sourcesRead: 1 });
    }, req);
    expect(res.headers.get("content-type")).toMatch(/ndjson/);
    const got: StreamEvent[] = [];
    await readNdjson(res, (e) => got.push(e));
    expect(got.map((g) => g.event)).toEqual(["stage", "lender", "counts"]);
    expect(got[1].data.name).toBe("Ünïcode Lender 🚀");
  });
  it("converts a thrown error into an error event and still closes the stream", async () => {
    const res = ndjsonResponse(async () => {
      throw new Error("boom");
    }, new Request("http://x"));
    const got: StreamEvent[] = [];
    await readNdjson(res, (e) => got.push(e));
    expect(got).toEqual([{ event: "error", data: { message: "boom" } }]);
  });
  it("reassembles lines split mid-JSON", async () => {
    const enc = new TextEncoder();
    const line = JSON.stringify({ event: "stage", data: { message: "héllo" } }) + "\n";
    const bytes = enc.encode(line);
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < bytes.length; i += 3) c.enqueue(bytes.slice(i, i + 3));
        c.close();
      },
    });
    const got: StreamEvent[] = [];
    await readNdjson(new Response(stream), (e) => got.push(e));
    expect(got).toEqual([{ event: "stage", data: { message: "héllo" } }]);
  });
});
