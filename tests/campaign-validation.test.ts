import test from "node:test";
import assert from "node:assert/strict";
import {
  StudioRequestError,
  campaignFieldPath,
  campaignProblemLabel,
  campaignProblemMessage,
  campaignMessageProblem,
} from "../lib/creative-studio/campaign-validation";
test("preserves structured validation from server and filters malformed errors", () => {
  const error = new StudioRequestError("Revisa los campos del formulario.", [
    { field: "config.pageId", message: "Invalid string" },
    { field: 123 },
    null,
  ]);
  assert(error instanceof Error);
  assert.equal(error.fields.length, 1);
  assert.equal(campaignFieldPath(error.fields[0].field), "pageId");
  assert.equal(campaignProblemLabel(error.fields[0]), "Página de Facebook");
  assert.equal(
    campaignProblemMessage(error.fields[0]),
    "Selecciona una opción válida.",
  );
});
test("identifies the particular audience and translates Zod limits", () => {
  const audience = {
    field: "config.audiences.1.ageMax",
    message: "Too big: expected number to be <=65",
  };
  assert.equal(campaignProblemLabel(audience), "Público 2 · edad máxima");
  assert.match(campaignProblemMessage(audience), /65/);
  const images = {
    field: "items.2.variationIds",
    message: "Too big: expected array to have <=50 items",
  };
  assert.equal(
    campaignProblemLabel(images),
    "Producto 3 · recursos seleccionados",
  );
  assert.equal(
    campaignProblemMessage(images),
    "El máximo permitido es 50 elementos.",
  );
  assert.equal(
    campaignProblemMessage({
      field: "body",
      message: "Too small: expected string to have >=1 characters",
    }),
    "Completa este texto.",
  );
});
test("preserves explicit reasons and locates budget, distribution and destination failures", () => {
  const message = "El rango de edades no es válido.";
  assert.equal(
    campaignProblemMessage({ field: "audiences.0", message }),
    message,
  );
  assert.equal(
    campaignMessageProblem("El presupuesto no es válido.")?.field,
    "dailyBudget",
  );
  assert.equal(
    campaignMessageProblem("Revisa la distribución de los afiches.")?.field,
    "distribution",
  );
  assert.equal(
    campaignMessageProblem("Indica una página web HTTPS válida.")?.field,
    "website",
  );
  assert.equal(campaignMessageProblem("El servidor no está disponible."), null);
});

test("names the exact conversation control, including legacy server paths", () => {
  assert.equal(campaignFieldPath("autofill"), "conversation.autofill");
  assert.equal(
    campaignProblemLabel({ field: "autofill", message: "Too big" }),
    "Mensaje inicial del interesado",
  );
  assert.equal(
    campaignProblemLabel({
      field: "config.conversation.greeting",
      message: "Too big",
    }),
    "Saludo de la conversación",
  );
  assert.equal(
    campaignProblemLabel({ field: "code", message: "Too big" }),
    "Variable {codigo} guardada",
  );
});
