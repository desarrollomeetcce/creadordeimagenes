import test from "node:test";
import assert from "node:assert/strict";
import { MetaReader } from "../lib/meta-ads/provider";
import { videoResponse } from "../lib/creative-studio/media-response";
import {
  campaignConfigSchema,
  launchPlan,
} from "../lib/creative-studio/campaign-policy";
test("Video transport uses the real ad account advideos multipart source endpoint, bearer header and no URL credentials", async () => {
  const fetch = globalThis.fetch;
  let sent = 0;
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input));
    assert.equal(u.pathname, "/v26.0/act_123/advideos");
    assert.equal(u.search, "");
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as any).Authorization, "Bearer synthetic");
    assert(init?.body instanceof FormData);
    assert.equal((init.body.get("source") as Blob).size, 5);
    assert.equal((init?.headers as any)["Content-Type"], undefined);
    sent++;
    return Response.json({ id: "987" });
  };
  try {
    const r = new MetaReader("synthetic", "API", "v26.0");
    const result = await r.launchRequest("123", "advideos", {
      source: new Blob(["video"], { type: "video/mp4" }),
    });
    assert.equal(result.id, "987");
    assert.equal(sent, 1);
  } finally {
    globalThis.fetch = fetch;
  }
});
test("Frozen video plans wait for Meta processing and verify media before creating any campaigns; image plans remain images", () => {
  const c = campaignConfigSchema.parse({
    accountId: "123",
    pageId: "456",
    country: "CO",
    dailyBudget: 10,
    body: "Texto",
    headline: "Título",
    audiences: [{ name: "A" }],
    planVersion: 2,
  });
  const steps = launchPlan(
    [
      {
        subproductId: "s",
        name: "Diplomado",
        variationIds: ["v", "p"],
        mediaTypes: { v: "VIDEO", p: "IMAGE" },
      },
    ],
    false,
    c,
  );
  assert.deepEqual(
    steps
      .filter((s) => ["VIDEO", "VIDEO_READY", "IMAGE"].includes(s.kind))
      .map((s) => s.kind),
    ["VIDEO", "VIDEO_READY", "IMAGE"],
  );
  assert(
    steps.findIndex((s) => s.kind === "VIDEO_READY") <
      steps.findIndex((s) => s.kind === "CAMPAIGN"),
  );
  assert(
    steps.findIndex((s) => s.kind === "VERIFY_CREATIVE") <
      steps.findIndex((s) => s.kind === "CAMPAIGN"),
  );
  assert(!steps.some((s) => s.kind === "ACTIVATE"));
});
test("Video playback honors a single byte range and rejects invalid ranges", async () => {
  const b = Buffer.from("0123456789");
  for (const [header, text] of [
    ["bytes=2-4", "234"],
    ["bytes=-2", "89"],
    ["bytes=7-", "789"],
  ]) {
    const r = videoResponse(b, "video/mp4", header, "id");
    assert.equal(r.status, 206);
    assert.equal(await r.text(), text);
  }
  for (const header of ["bytes=30-", "bytes=2-1", "bytes=-", "bytes=1-2,4-5"])
    assert.equal(videoResponse(b, "video/mp4", header, "id").status, 416);
});
