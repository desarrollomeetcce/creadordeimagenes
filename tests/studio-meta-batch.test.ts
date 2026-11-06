import test from "node:test";
import assert from "node:assert/strict";
import { MetaReader } from "../lib/meta-ads/provider";

test("Campaign verification uses v26 read-only GET batches, never the retired ids query", async () => {
  const original = globalThis.fetch;
  let calls = 0,
    mode = "ok";
  globalThis.fetch = async (input, init) => {
    calls++;
    const url = new URL(String(input)),
      params = new URLSearchParams(String(init?.body));
    assert.equal(url.href, "https://graph.facebook.com/v26.0/");
    assert.equal(init?.method, "POST");
    assert(!url.searchParams.has("ids"));
    assert(!params.has("ids"));
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer synthetic-batch-token",
    );
    const batch = JSON.parse(params.get("batch")!);
    assert.equal(batch.length, 2);
    for (const [i, part] of batch.entries()) {
      assert.equal(part.method, "GET");
      assert.equal(part.omit_response_on_success, false);
      const request = new URL(part.relative_url, "https://graph.facebook.com/");
      assert.equal(request.pathname, "/" + ["12", "13"][i]);
      assert.equal(
        request.searchParams.get("fields"),
        "id,status,effective_status,account_id",
      );
      assert(!request.searchParams.has("ids"));
      assert(!request.searchParams.has("access_token"));
      assert(request.searchParams.get("appsecret_proof"));
    }
    if (mode === "partial")
      return Response.json([
        {
          code: 200,
          body: JSON.stringify({
            id: "12",
            account_id: "99",
            status: "PAUSED",
          }),
        },
        {
          code: 400,
          body: JSON.stringify({
            error: {
              code: 100,
              message: "Invalid parameter synthetic-batch-token",
            },
          }),
        },
      ]);
    if (mode === "missing") return Response.json([]);
    return Response.json(
      ["12", "13"].map((id) => ({
        code: 200,
        body: JSON.stringify({
          id,
          account_id: "99",
          status: "PAUSED",
          effective_status: "PAUSED",
        }),
      })),
    );
  };
  try {
    const r = new MetaReader(
      "synthetic-batch-token",
      "API",
      "v26.0",
      "synthetic-secret",
    );
    const result = await r.launchRequest(
      "99",
      "objects",
      undefined,
      "12,13",
      "id,status,effective_status,account_id",
    );
    assert.deepEqual(Object.keys(result), ["12", "13"]);
    assert.equal(result["13"].account_id, "99");
    const before = calls;
    await assert.rejects(() =>
      r.launchRequest("99", "objects", { status: "ACTIVE" }, "12,13"),
    );
    await assert.rejects(() =>
      r.launchRequest("99", "objects", undefined, "12,12"),
    );
    await assert.rejects(() =>
      r.launchRequest("99", "objects", undefined, "12,13", "access_token"),
    );
    await assert.rejects(() =>
      r.launchRequest(
        "99",
        "objects",
        undefined,
        Array.from({ length: 26 }, (_, i) => String(i + 1)).join(","),
      ),
    );
    assert.equal(calls, before, "Bad input cannot issue reads or mutations");
    mode = "partial";
    await assert.rejects(
      () =>
        r.launchRequest(
          "99",
          "objects",
          undefined,
          "12,13",
          "id,status,effective_status,account_id",
        ),
      (e) =>
        e instanceof Error &&
        !e.message.includes("synthetic-batch-token") &&
        e.message.includes("Invalid parameter"),
    );
    mode = "missing";
    await assert.rejects(
      () =>
        r.launchRequest(
          "99",
          "objects",
          undefined,
          "12,13",
          "id,status,effective_status,account_id",
        ),
      /todos los estados/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
