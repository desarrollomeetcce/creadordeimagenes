import test from "node:test";
import assert from "node:assert/strict";
import {
  campaignConfigSchema,
  campaignText,
  campaignDisplayName,
  validateCampaignText,
} from "../lib/creative-studio/campaign-policy";
const item = {
  subproductId: "diploma",
  name: "Aguas Servidas",
  variationIds: ["image"],
};
const config = (extra: Record<string, unknown> = {}) =>
  campaignConfigSchema.parse({
    accountId: "123",
    pageId: "456",
    country: "PE",
    dailyBudget: 15,
    body: "[diplomado] · [pais]",
    headline: "{producto} · {pais}",
    audiences: [{ name: "Público" }],
    ...extra,
  });
test("brackets and braces resolve actual country and current product independently", () => {
  for (const [country, name] of [
    ["PE", "Perú"],
    ["CO", "Colombia"],
  ]) {
    const c = config({
      country,
      campaignName: "[pais] · {diplomado}",
      variables: { sede: "Lima" },
    });
    assert.equal(campaignText("[pais] · {pais}", item, c), `${name} · ${name}`);
    assert.equal(
      campaignText("[diplomado] · {producto} · [sede]", item, c),
      "Aguas Servidas · Aguas Servidas · Lima",
    );
    assert.equal(campaignDisplayName(item, c), `${name} · Aguas Servidas`);
    assert.equal(
      campaignDisplayName({ ...item, name: "Programación Python" }, c),
      `${name} · Programación Python`,
    );
  }
});
test("a short template can exceed 80 after substitution; report the exact message field and resolved length", () => {
  const longItem = {
    ...item,
    name: "Diplomado de " + "ingeniería ambiental ".repeat(5),
  };
  const c = config({
    conversation: {
      name: "Información",
      greeting: "Hola [pais]",
      autofill: "Información de [diplomado]",
    },
  });
  assert(c.conversation!.autofill.length < 80);
  assert(campaignText(c.conversation!.autofill, longItem, c).length > 80);
  assert.throws(
    () => validateCampaignText(longItem, c),
    (e: any) => {
      assert.deepEqual(e.issues[0].path, ["conversation", "autofill"]);
      assert.match(
        e.issues[0].message,
        /80 caracteres al reemplazar las variables/,
      );
      return true;
    },
  );
  const corrected = config({
    ...c,
    conversation: { ...c.conversation, autofill: "Información en [pais]" },
  });
  assert.doesNotThrow(() => validateCampaignText(longItem, corrected));
});
test("cross-field age errors point to the maximum control instead of every audience", () => {
  const parsed = campaignConfigSchema.safeParse({
    ...config(),
    audiences: [{ name: "A", ageMin: 45, ageMax: 30 }],
  });
  assert(!parsed.success);
  assert.deepEqual(parsed.error.issues[0].path, ["audiences", 0, "ageMax"]);
});

test("live checks still identify the resolved message when other fields remain unfinished", async () => {
  const { collectCampaignProblems } =
    await import("../lib/creative-studio/campaign-validation");
  const c = config({
    conversation: {
      name: "Información",
      greeting: "Hola [pais]",
      autofill: "Información de [diplomado]",
    },
  });
  const longItem = { ...item, name: "Ingeniería ambiental ".repeat(6) };
  const problems = collectCampaignProblems({ ...c, pageId: "" }, [longItem]);
  assert(problems.some((problem) => problem.field === "pageId"));
  assert(problems.some((problem) => problem.field === "conversation.autofill"));
  assert(
    !collectCampaignProblems(
      {
        ...c,
        conversation: { ...c.conversation, autofill: "Información en [pais]" },
      },
      [longItem],
    ).length,
  );
});
