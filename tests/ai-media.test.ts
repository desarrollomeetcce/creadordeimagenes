import test from "node:test";
import assert from "node:assert/strict";
import { parseCourseOutline } from "../lib/courses/outline";
import { falVideoCapability } from "../lib/courses/media-catalog";
import { safeVideoURL, videoParameters } from "../lib/courses/video";
import { settingsSchema } from "../lib/courses/schema";
import { fakeVideoModel } from "./helpers/ai-video-fixture";

test("Temario pegado admite títulos o encabezados con descripción, sin IA", () => {
  assert.deepEqual(
    parseCourseOutline("1. Excel\n2. Power BI").map((m) => m.title),
    ["Excel", "Power BI"],
  );
  const m = parseCourseOutline(
    "Módulo 1: Excel\nFórmulas y tablas\nMódulo 2: Power BI\nReportes",
  );
  assert.equal(m[0].brief, "Fórmulas y tablas");
  assert.equal(m[1].title, "Power BI");
  assert.throws(() => parseCourseOutline(""));
  assert.throws(() => parseCourseOutline("a".repeat(201)));
});
test("Catálogo de video valida esquema y no muestra modelos de imagen", () => {
  const model = falVideoCapability(fakeVideoModel());
  assert.equal(model?.kind, "video");
  assert.deepEqual(model?.options?.durations, [5, 10]);
  const flux = fakeVideoModel("fal-ai/flux/dev");
  (flux.openapi.components.schemas as any).Output = {
    properties: { images: { type: "array" } },
  };
  assert.equal(falVideoCapability(flux), null);
  const requiresImage = fakeVideoModel();
  requiresImage.openapi.components.schemas.Input.required.push("image_url");
  assert.equal(falVideoCapability(requiresImage), null);
  assert.throws(
    () =>
      videoParameters(
        model!,
        settingsSchema.parse({ videoDuration: 6, videoResolution: "720p" }),
      ),
    /duración/,
  );
});
test("Video protege URLs, elimina claves de URL y rechaza SSRF", () => {
  assert.throws(() => safeVideoURL("http://127.0.0.1/secret", "gemini"));
  assert.throws(() => safeVideoURL("https://evil.test/v.mp4", "fal"));
  assert.throws(() => safeVideoURL("https://queue.fal.run/other", "fal", true));
  assert(
    !safeVideoURL(
      "https://generativelanguage.googleapis.com/v1beta/files/id?key=SECRET&alt=media",
      "gemini",
    ).includes("SECRET"),
  );
  assert.match(
    safeVideoURL(
      "https://queue.fal.run/fal-ai/wan/requests/qa/status",
      "fal",
      true,
    ),
    /requests\/qa/,
  );
});
