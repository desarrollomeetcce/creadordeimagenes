import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { connectionCheck, reserveJobs, safeConfiguration } from "../lib/ai";
import { runOne } from "../scripts/worker";
const root = process.env.TEST_APP_URL ?? "http://localhost:3000";
class Client {
  cookie = "";
  async call(path: string, method = "GET", data?: unknown, origin = root) {
    const res = await fetch(root + "/api/" + path, {
      method,
      headers: {
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(method !== "GET"
          ? { Origin: origin, "Content-Type": "application/json" }
          : {}),
      },
      body: method !== "GET" && data ? JSON.stringify(data) : undefined,
    });
    const c = res.headers.get("set-cookie");
    if (c) this.cookie = c.split(";")[0];
    return { status: res.status, body: await res.json() };
  }
}
const owner = new Client(),
  user = new Client(),
  admin = new Client(),
  anonymous = new Client();
const password = "Prueba-segura-0123456789";
const tag = randomUUID().slice(0, 8);
let uid = "",
  aid = "",
  pid = "",
  cid = "",
  sid = "";
const config = {
  provider: "openai",
  apiKey: "sk-synthetic-test-not-a-real-key-1234",
  imageModel: null,
  creativeModel: null,
  alternatives: [],
  quality: "low",
  resolution: "1024x1024",
  monthlyLimitMicros: "1000000",
  dailyLimitMicros: "1000000",
  operationLimitMicros: "1000000",
  imageReserveMicros: "1000000",
  maxGenerations: 150,
};
test("Integración HTTP + PostgreSQL (base exclusiva de pruebas, sin llamadas externas)", async (t) => {
  try {
    await t.test(
      "instalación inicial segura y proyecto precargado",
      async () => {
        const r = await owner.call("auth/setup", "POST", {
          email: `owner-${tag}@example.test`,
          password,
          name: "Owner prueba",
          token: process.env.BOOTSTRAP_TOKEN,
        });
        assert.equal(r.status, 201);
        const p = await owner.call("projects");
        assert.equal(p.body.length, 1);
        assert.equal(p.body[0].name, "Cursos y Diplomados");
        const detail = await owner.call("projects/" + p.body[0].id);
        assert(detail.body.prompt.includes("6.10. Calidad final"));
        assert(detail.body.prompt.includes("No inventes precios"));
      },
    );
    await t.test("bootstrap no se repite ni duplica proyecto", async () => {
      const r = await owner.call("auth/setup", "POST", {
        email: `otro-${tag}@example.test`,
        password,
        token: process.env.BOOTSTRAP_TOKEN,
      });
      assert.equal(r.status, 409);
      assert.equal(
        await db.project.count({ where: { seedKey: "cursos-diplomados" } }),
        1,
      );
    });
    await t.test("autenticación y protección CSRF", async () => {
      assert.equal((await anonymous.call("projects")).status, 401);
      assert.equal(
        (
          await owner.call(
            "projects",
            "POST",
            { name: "Ataque" },
            "https://origen-malicioso.test",
          )
        ).status,
        403,
      );
    });
    await t.test("registro pendiente no puede iniciar sesión", async () => {
      assert.equal(
        (
          await user.call("auth/register", "POST", {
            email: `user-${tag}@example.test`,
            password,
            name: "Usuario prueba",
          })
        ).status,
        201,
      );
      assert.equal(
        (
          await user.call("auth/login", "POST", {
            email: `user-${tag}@example.test`,
            password,
          })
        ).status,
        403,
      );
    });
    await t.test(
      "aprobación, login y creación de administrador por OWNER",
      async () => {
        await admin.call("auth/register", "POST", {
          email: `admin-${tag}@example.test`,
          password,
          name: "Admin prueba",
        });
        const users = (await owner.call("users")).body;
        uid = users.find((x: any) => x.email === `user-${tag}@example.test`).id;
        aid = users.find(
          (x: any) => x.email === `admin-${tag}@example.test`,
        ).id;
        assert.equal(
          (
            await owner.call("users/" + uid, "PATCH", {
              role: "USER",
              status: "APPROVED",
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await owner.call("users/" + aid, "PATCH", {
              role: "ADMIN",
              status: "APPROVED",
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await user.call("auth/login", "POST", {
              email: `user-${tag}@example.test`,
              password,
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await admin.call("auth/login", "POST", {
              email: `admin-${tag}@example.test`,
              password,
            })
          ).status,
          200,
        );
      },
    );
    await t.test("último OWNER protegido y ADMIN no eleva roles", async () => {
      const me = (await owner.call("auth/me")).body;
      assert.equal(
        (
          await owner.call("users/" + me.id, "PATCH", {
            role: "USER",
            status: "APPROVED",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await admin.call("users/" + uid, "PATCH", {
            role: "OWNER",
            status: "APPROVED",
          })
        ).status,
        403,
      );
    });
    await t.test(
      "todos los endpoints de IA son exclusivos del OWNER",
      async () => {
        for (const path of ["ai/config", "ai/verify", "ai/test"]) {
          const method = path === "ai/config" ? "GET" : "POST";
          assert.equal((await user.call(path, method, {})).status, 403);
          assert.equal((await admin.call(path, method, {})).status, 403);
        }
        assert.equal((await admin.call("ai/config", "DELETE")).status, 403);
        assert.equal((await user.call("ai/config", "PUT", config)).status, 403);
      },
    );
    await t.test("clave cifrada, máscara y estado sin verificar", async () => {
      const { apiKey: ignored, ...withoutKey } = config;
      assert.equal(
        (await owner.call("ai/config", "PUT", withoutKey)).status,
        400,
      );
      const r = await owner.call("ai/config", "PUT", config);
      assert.equal(r.status, 200);
      assert.equal(r.body.status, "UNVERIFIED");
      assert(!JSON.stringify(r.body).includes(config.apiKey));
      assert(!("encryptedKey" in r.body));
      assert.equal(r.body.maskedKey, "••••••••1234");
      const c = await db.providerConfiguration.findUniqueOrThrow({
        where: { id: "global" },
      });
      assert(c.encryptedKey && !c.encryptedKey.includes(config.apiKey));
      assert.equal(c.verifiedAt, null);
    });
    await t.test(
      "prueba requiere consentimiento y conexión real verificada",
      async () => {
        assert.equal(
          (await owner.call("ai/test", "POST", { requestId: randomUUID() }))
            .status,
          400,
        );
        assert.equal(
          (
            await owner.call("ai/test", "POST", {
              requestId: randomUUID(),
              confirmCharge: true,
            })
          ).status,
          409,
        );
        assert.equal(await db.generationJob.count(), 0);
      },
    );
    await t.test(
      "proyectos nuevos independientes y autorización por recurso",
      async () => {
        const r = await user.call("projects", "POST", {
          name: "Cortinas",
          prompt: "Publicidad comercial de cortinas.",
        });
        assert.equal(r.status, 201);
        pid = r.body.id;
        assert(!r.body.prompt.includes("Diplomados"));
        assert.equal((await owner.call("projects/" + pid)).status, 200);
        const privateProject = await owner.call("projects", "POST", {
          name: "Privado owner",
        });
        assert.equal(
          (await user.call("projects/" + privateProject.body.id)).status,
          404,
        );
        assert.equal(
          (await admin.call("projects/" + privateProject.body.id)).status,
          404,
        );
        assert.equal((await admin.call("projects/" + pid)).status, 200);
      },
    );
    await t.test("categorías, 12 subproductos y herencia", async () => {
      const c = await user.call("projects/" + pid + "/categories", "POST", {
        name: "Campaña Perú",
        prompt:
          "Todos los afiches serán para Perú. Pago único S/90. Mostrar Mensualidades Gratis.",
      });
      cid = c.body.id;
      assert.equal(
        (
          await user.call("categories/" + cid, "PATCH", {
            name: "Campaña Perú",
            prompt: c.body.prompt,
            settings: {
              count: 10,
              textCount: 3,
              imageTextCount: 7,
              imageCount: 0,
              format: "1:1",
              style: "Institucional",
            },
          })
        ).status,
        200,
      );
      const rows = await user.call(
        "categories/" + cid + "/subproducts",
        "POST",
        { names: Array.from({ length: 12 }, (_, i) => "Producto " + i) },
      );
      assert.equal(rows.status, 201);
      assert.equal(rows.body.length, 12);
      sid = rows.body[0].id;
      const p = await user.call("subproducts/" + sid + "/instructions");
      assert.equal(p.body.settings.count, 10);
      assert(p.body.text.includes("S/90"));
    });
    await t.test(
      "límites 1 a 20 por operación; no limita categoría a 20",
      async () => {
        assert.equal(
          (
            await user.call("categories/" + cid + "/subproducts", "POST", {
              names: Array(21).fill("X"),
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await user.call("categories/" + cid + "/subproducts", "POST", {
              names: Array(12).fill("Otro producto"),
            })
          ).status,
          201,
        );
        const c = await user.call("categories/" + cid);
        assert.equal(c.body.subproducts.length, 24);
      },
    );
    await t.test("excepción particular y vista previa comercial", async () => {
      assert.equal(
        (
          await user.call("subproducts/" + sid, "PATCH", {
            name: "Tratamiento de Aguas",
            prompt:
              "Este diplomado será para Ecuador. Precio USD 40. No utilizar logos exclusivos de Perú.",
            settings: {},
          })
        ).status,
        200,
      );
      const p = await user.call("subproducts/" + sid + "/instructions");
      assert(!p.body.text.includes("S/90"));
      assert(p.body.text.includes("USD 40"));
      assert(p.body.text.includes("Mensualidades Gratis"));
      assert.equal(p.body.warnings.length, 0);
      assert.equal(
        (
          await user.call("subproducts/" + sid + "/generate", "POST", {
            confirmCharge: true,
            reviewedInstructions: true,
            requestId: randomUUID(),
          })
        ).status,
        409,
      );
    });
    await t.test("distribución inválida no se guarda", async () => {
      assert.equal(
        (
          await user.call("subproducts/" + sid, "PATCH", {
            name: "Producto",
            prompt: "",
            settings: { count: 10, textCount: 3, imageTextCount: 8 },
          })
        ).status,
        400,
      );
    });
    await t.test(
      "adjunto TXT se persiste con permiso; otro usuario no puede cargar al proyecto privado",
      async () => {
        const form = new FormData();
        form.set("scope", "category");
        form.set("resourceId", cid);
        form.set("purpose", "Información comercial");
        form.set(
          "file",
          new File(["Datos de prueba"], "contexto.txt", { type: "text/plain" }),
        );
        const res = await fetch(root + "/api/attachments", {
          method: "POST",
          headers: { Cookie: user.cookie, Origin: root },
          body: form,
        });
        assert.equal(res.status, 201);
        const list = await user.call("attachments?scope=category&id=" + cid);
        assert.equal(list.body[0].name, "contexto.txt");
      },
    );
    await t.test(
      "marca de proyecto: identidad aislada, permisos y revisión concurrente",
      async () => {
        const path = `projects/${pid}/brand`;
        const initial = await user.call(path);
        assert.equal(initial.status, 200);
        assert.equal(initial.body.kit, null);
        assert.equal(initial.body.canEdit, true);
        assert.equal((await admin.call(path)).body.canEdit, false);
        const values = {
          expectedRevision: 0,
          name: "Tienda de prueba",
          prompt: "Comunicación cálida y directa.",
          colors: ["#123456", "#ffffff"],
          font: "DejaVu Serif",
          logoAttachmentIds: [],
        };
        assert.equal((await admin.call(path, "PUT", values)).status, 403);
        const saved = await user.call(path, "PUT", values);
        assert.equal(saved.status, 200);
        assert.equal(saved.body.revision, 1);
        assert.equal((await user.call(path, "PUT", values)).status, 409);
        assert.equal(
          (
            await user.call(path, "PUT", {
              ...values,
              expectedRevision: 1,
              colors: ["red"],
            })
          ).status,
          400,
        );
        const instructions = (
          await user.call(`subproducts/${sid}/instructions`)
        ).body;
        assert(instructions.text.includes("Tienda de prueba"));
        assert(instructions.text.includes("#123456"));
        assert(instructions.text.includes("DejaVu Serif"));
        assert.equal(instructions.brand.revision, 1);
        const ownProjects = (await owner.call("projects")).body;
        const seed = ownProjects.find(
          (p: any) => p.name === "Cursos y Diplomados",
        );
        assert.equal(
          (await owner.call(`projects/${seed.id}/brand`)).body.kit,
          null,
        );
        assert.equal(
          (await user.call(`projects/${seed.id}/brand`)).status,
          404,
        );
      },
    );
    await t.test(
      "logos de marca: archivos propios, selección y protección contra borrado",
      async () => {
        const sharp = (await import("sharp")).default;
        const image = await sharp({
          create: { width: 40, height: 20, channels: 3, background: "#123456" },
        })
          .png()
          .toBuffer();
        const upload = async (scope: string, id: string, name: string) => {
          const form = new FormData();
          form.set("scope", scope);
          form.set("resourceId", id);
          form.set("purpose", "Logo");
          form.set(
            "file",
            new File([new Uint8Array(image)], name, { type: "image/png" }),
          );
          const result = await fetch(root + "/api/attachments", {
            method: "POST",
            headers: { Cookie: user.cookie, Origin: root },
            body: form,
          });
          assert.equal(result.status, 201);
          return (await result.json()).id as string;
        };
        const first = await upload("project", pid, "logo-marca.png"),
          second = await upload("project", pid, "logo-no-seleccionado.png"),
          nested = await upload("category", cid, "logo-categoria.png");
        const values = {
          expectedRevision: 1,
          name: "Tienda de prueba",
          prompt: "Comunicación cálida y directa.",
          colors: ["#123456"],
          font: "DejaVu Serif",
          logoAttachmentIds: [nested],
        };
        assert.equal(
          (await user.call(`projects/${pid}/brand`, "PUT", values)).status,
          400,
        );
        assert.equal(
          (
            await user.call(`projects/${pid}/brand`, "PUT", {
              ...values,
              logoAttachmentIds: [first],
            })
          ).status,
          200,
        );
        assert.equal(
          (await user.call(`attachments/${first}`, "DELETE")).status,
          409,
        );
        const instructions = (
          await user.call(`subproducts/${sid}/instructions`)
        ).body;
        const ids = instructions.attachments.map((a: any) => a.id);
        assert(ids.includes(first));
        assert(ids.includes(nested));
        assert(!ids.includes(second));
        assert.equal(instructions.brand.revision, 2);
        assert(!JSON.stringify(instructions).includes("test-assets"));
        // A lower level may override the preferred palette through ordinary instructions.
        const { resolveInstructions } = await import("../lib/inheritance");
        const resolved = resolveInstructions([
          { name: "Marca", prompt: "Paleta de marca preferida: #123456." },
          { name: "Categoría", prompt: "Usar exclusivamente colores #ff0000." },
        ]);
        assert(!resolved.text.includes("#123456"));
      },
    );
    await t.test(
      "conector: respuestas simuladas prueban éxito y error sin afirmar conexión externa",
      async () => {
        const original = globalThis.fetch;
        try {
          globalThis.fetch = async () =>
            new Response(
              JSON.stringify({
                data: [
                  { id: "gpt-image-1" },
                  { id: "gpt-4.1-mini" },
                  { id: "incompatible" },
                ],
              }),
              { status: 200 },
            );
          const result = await connectionCheck();
          assert.equal(result.status, "VERIFIED");
          assert.equal((result.models as any[]).length, 2);
          globalThis.fetch = async () => new Response("{}", { status: 401 });
          await assert.rejects(connectionCheck(), /clave API/);
          const c = await db.providerConfiguration.findUniqueOrThrow({
            where: { id: "global" },
          });
          assert.equal(c.status, "ERROR");
          assert.equal(c.verifiedAt, null);
        } finally {
          globalThis.fetch = original;
        }
      },
    );
    await t.test("reserva concurrente no supera el presupuesto", async () => {
      const c = await db.providerConfiguration.update({
        where: { id: "global" },
        data: {
          status: "VERIFIED",
          verifiedAt: new Date(),
          verifiedRevision: 1,
          revision: 1,
          imageModel: "gpt-image-1",
          creativeModel: "gpt-4.1-mini",
          models: [
            {
              id: "gpt-image-1",
              kind: "image",
              qualities: ["low"],
              resolutions: ["1024x1024"],
            },
            {
              id: "gpt-4.1-mini",
              kind: "creative",
              qualities: [],
              resolutions: [],
            },
          ],
        },
      });
      const requests = Array.from({ length: 3 }, () =>
        reserveJobs(
          uid,
          pid,
          [
            {
              subproductId: sid,
              key: randomUUID(),
              snapshot: {
                prompt: "Prueba",
                mode: "Texto",
                index: 0,
                format: "1:1",
              },
            },
          ],
          c.revision,
        ),
      );
      const results = await Promise.allSettled(requests);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const ledger = await db.usageLedger.aggregate({
        _sum: { reservedMicros: true },
      });
      assert.equal(ledger._sum.reservedMicros, 1000000n);
    });
    await t.test(
      "worker genera y guarda usando un proveedor simulado, nunca una llamada externa",
      async () => {
        const { adapter } = await import("../lib/providers");
        const p = adapter("openai"),
          oldDirect = p.direct,
          oldGenerate = p.generate;
        try {
          p.direct = async () => ({
            text: "Plan creativo simulado para prueba automatizada",
            usage: { input_tokens: 2, output_tokens: 2 },
          });
          p.generate = async () => ({
            bytes: await (
              await import("sharp")
            )
              .default({
                create: {
                  width: 32,
                  height: 32,
                  channels: 3,
                  background: "#fff",
                },
              })
              .png()
              .toBuffer(),
            usage: { input_tokens: 2, output_tokens: 3 },
          });
          assert.equal(await runOne(), true);
          const jobs = await db.generationJob.findMany({
            include: { variation: true },
          });
          assert.equal(jobs[0].status, "COMPLETED");
          assert(jobs[0].variation);
          const res = await fetch(
            root + "/api/variations/" + jobs[0].variation!.id + "?download",
            { headers: { Cookie: user.cookie } },
          );
          assert.equal(res.status, 200);
          assert.equal(res.headers.get("content-type"), "image/png");
          const ledger = await db.usageLedger.findFirstOrThrow();
          assert.equal(ledger.actualMicros, null);
          assert.equal(ledger.status, "CONSUMED_ESTIMATE");
          const jpg = await fetch(
            root +
              "/api/variations/" +
              jobs[0].variation!.id +
              "?download&format=jpg",
            { headers: { Cookie: user.cookie } },
          );
          assert.equal(jpg.headers.get("content-type"), "image/jpeg");
          const zip = await fetch(root + "/api/exports", {
            method: "POST",
            headers: {
              Cookie: user.cookie,
              Origin: root,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ids: [jobs[0].variation!.id],
              format: "png",
            }),
          });
          assert.equal(zip.status, 200);
          assert.equal(zip.headers.get("content-type"), "application/zip");
          const output = (await import("jszip")).default;
          assert.equal(
            Object.keys((await output.loadAsync(await zip.arrayBuffer())).files)
              .length,
            1,
          );
        } finally {
          p.direct = oldDirect;
          p.generate = oldGenerate;
        }
      },
    );
    let editableId = "",
      editableRevision = 1;
    await t.test(
      "composición editable automática conserva texto exacto sin generar fotografías en modalidad Texto",
      async () => {
        await db.providerConfiguration.update({
          where: { id: "global" },
          data: {
            monthlyLimitMicros: 100000000n,
            dailyLimitMicros: 100000000n,
            operationLimitMicros: 100000000n,
          },
        });
        const { adapter } = await import("../lib/providers");
        const p = adapter("openai"),
          oldDirect = p.direct,
          oldGenerate = p.generate;
        let images = 0;
        try {
          p.direct = async () => ({
            text: JSON.stringify({
              backgroundPrompt: "Fondo institucional sin letras",
              backgroundColor: "#ffffff",
              texts: [
                {
                  id: "title",
                  text: "Tratamiento de Aguas",
                  x: 60,
                  y: 70,
                  width: 950,
                  fontSize: 62,
                  color: "#163c32",
                  font: "DejaVu Sans",
                  align: "left",
                },
                {
                  id: "price",
                  text: "USD 40",
                  x: 60,
                  y: 900,
                  width: 300,
                  fontSize: 24,
                  color: "#163c32",
                  font: "DejaVu Sans",
                  align: "left",
                },
              ],
              logos: [],
            }),
            usage: { input_tokens: 10, output_tokens: 10 },
          });
          p.generate = async () => {
            images++;
            throw new Error("No debe solicitar fotografía");
          };
          const jobs = await reserveJobs(
            uid,
            pid,
            [
              {
                subproductId: sid,
                key: randomUUID(),
                snapshot: {
                  prompt: "Tratamiento de Aguas. Precio USD 40.",
                  mode: "Texto",
                  format: "1:1",
                  index: 0,
                  renderMode: "editable",
                },
              },
            ],
            1,
          );
          await runOne();
          const j = await db.generationJob.findUniqueOrThrow({
            where: { id: jobs[0].id },
            include: { variation: true },
          });
          assert.equal(j.status, "COMPLETED", j.error ?? "");
          assert.equal(images, 0);
          editableId = j.variation!.id;
          const r = await user.call(`variations/${editableId}/design`);
          assert.equal(r.status, 200);
          assert.equal(r.body.document.layers[1].text, "USD 40");
          assert.equal(r.body.versions.length, 1);
          assert(!JSON.stringify(r.body).includes("backgroundPath"));
        } finally {
          p.direct = oldDirect;
          p.generate = oldGenerate;
        }
      },
    );
    await t.test(
      "guardar ajuste manual, conflicto de versión y restauración sin destruir el original",
      async () => {
        const r = await user.call(`variations/${editableId}/design`);
        const document = structuredClone(r.body.document);
        document.layers[1].fontSize = 18;
        document.layers[1].x = 200;
        assert.equal(
          (
            await user.call(`variations/${editableId}/manual`, "POST", {
              expectedRevision: 1,
              document,
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await user.call(`variations/${editableId}/manual`, "POST", {
              expectedRevision: 1,
              document,
            })
          ).status,
          409,
        );
        const next = await user.call(`variations/${editableId}/design`);
        assert.equal(next.body.revision, 2);
        assert.equal(next.body.document.layers[1].fontSize, 18);
        assert.equal(next.body.versions.length, 2);
        assert.equal(
          (
            await user.call(
              `variations/${editableId}/restore-version`,
              "POST",
              { expectedRevision: 2, number: 1 },
            )
          ).status,
          200,
        );
        const restored = await user.call(`variations/${editableId}/design`);
        assert.equal(restored.body.revision, 3);
        assert.equal(restored.body.document.layers[1].fontSize, 24);
        editableRevision = 3;
        const original = await fetch(
          root + `/api/variations/${editableId}/versions/1`,
          { headers: { Cookie: user.cookie } },
        );
        assert.equal(original.status, 200);
        assert.equal(
          (
            await admin.call(`variations/${editableId}/manual`, "POST", {
              expectedRevision: 3,
              document,
            })
          ).status,
          403,
        );
      },
    );
    await t.test(
      "editor rechaza recursos gráficos ajenos y capas fuera del lienzo",
      async () => {
        const d = (await user.call(`variations/${editableId}/design`)).body
          .document;
        const bad = structuredClone(d);
        bad.layers.push({
          id: "malicioso",
          type: "logo",
          attachmentId: "ajeno",
          x: 0,
          y: 0,
          width: 100,
          height: 50,
        });
        assert.equal(
          (
            await user.call(`variations/${editableId}/manual`, "POST", {
              expectedRevision: 3,
              document: bad,
            })
          ).status,
          400,
        );
        bad.layers = d.layers;
        bad.layers[0].x = 1070;
        assert.equal(
          (
            await user.call(`variations/${editableId}/manual`, "POST", {
              expectedRevision: 3,
              document: bad,
            })
          ).status,
          400,
        );
      },
    );
    await t.test(
      "edición IA conserva capas, requiere consentimiento y bloquea solicitudes duplicadas en curso",
      async () => {
        const payload = {
          prompt: "Cambiar el fondo por un laboratorio",
          confirmCharge: true,
          reviewedInstructions: true,
          requestId: randomUUID(),
          expectedRevision: 3,
          editKind: "background",
        };
        assert.equal(
          (
            await user.call(`variations/${editableId}/edit-ai`, "POST", {
              ...payload,
              confirmCharge: false,
            })
          ).status,
          400,
        );
        const r = await user.call(
          `variations/${editableId}/edit-ai`,
          "POST",
          payload,
        );
        assert.equal(r.status, 202);
        assert.equal(
          (
            await user.call(`variations/${editableId}/edit-ai`, "POST", {
              ...payload,
              requestId: randomUUID(),
            })
          ).status,
          409,
        );
        const { adapter } = await import("../lib/providers");
        const p = adapter("openai"),
          old = p.generate;
        try {
          p.generate = async () => ({
            bytes: await (
              await import("sharp")
            )
              .default({
                create: {
                  width: 100,
                  height: 100,
                  channels: 3,
                  background: "#d9eeec",
                },
              })
              .png()
              .toBuffer(),
            usage: { output_tokens: 3 },
          });
          await runOne();
          const job = await db.generationJob.findUniqueOrThrow({
            where: { id: r.body.jobs[0] },
          });
          assert.equal(job.status, "COMPLETED", job.error ?? "");
          const d = (await user.call(`variations/${editableId}/design`)).body;
          assert.equal(d.revision, 4);
          assert.equal(d.document.layers[1].text, "USD 40");
          assert(d.hasBackground);
          editableRevision = 4;
        } finally {
          p.generate = old;
        }
      },
    );
    await t.test(
      "duplicación independiente, revisión y papelera de afiches",
      async () => {
        assert.equal(
          (
            await user.call(`variations/${editableId}`, "PATCH", {
              reviewStatus: "APPROVED",
            })
          ).status,
          200,
        );
        const clone = await user.call(
          `variations/${editableId}/duplicate`,
          "POST",
        );
        assert.equal(clone.status, 201);
        const original = await db.variation.findUniqueOrThrow({
            where: { id: editableId },
          }),
          copy = await db.variation.findUniqueOrThrow({
            where: { id: clone.body.id },
          });
        assert.notEqual(original.path, copy.path);
        assert.equal(
          (await user.call(`variations/${clone.body.id}`, "DELETE")).status,
          200,
        );
        assert.equal(
          (await user.call(`variations/${clone.body.id}/design`)).status,
          404,
        );
        assert.equal(
          (await user.call(`variations/${clone.body.id}/restore`, "POST"))
            .status,
          200,
        );
      },
    );
    await t.test(
      "cancelación libera reserva y el reintento requiere una nueva autorización",
      async () => {
        const jobs = await reserveJobs(
          uid,
          pid,
          [
            {
              subproductId: sid,
              key: randomUUID(),
              snapshot: {
                prompt: "Prueba",
                mode: "Texto",
                index: 0,
                format: "1:1",
              },
            },
          ],
          1,
        );
        assert.equal(
          (await user.call(`jobs/${jobs[0].id}/cancel`, "POST")).status,
          200,
        );
        assert.equal(
          (
            await db.usageLedger.findUniqueOrThrow({
              where: { jobId: jobs[0].id },
            })
          ).status,
          "RELEASED",
        );
        assert.equal(
          (
            await user.call(`jobs/${jobs[0].id}/retry`, "POST", {
              requestId: randomUUID(),
            })
          ).status,
          400,
        );
        const retry = await user.call(`jobs/${jobs[0].id}/retry`, "POST", {
          requestId: randomUUID(),
          confirmCharge: true,
        });
        assert.equal(retry.status, 202);
        await user.call(`jobs/${retry.body.jobs[0]}/cancel`, "POST");
      },
    );
    await t.test(
      "carpetas y subcarpetas conservan afiches con permisos y retención por usuario",
      async () => {
        const folder = await user.call("library/folders", "POST", {
          name: "Campaña Octubre",
        });
        assert.equal(folder.status, 201);
        const sub = await user.call("library/folders", "POST", {
          name: "Aprobados",
          parentId: folder.body.id,
        });
        assert.equal(sub.status, 201);
        assert.equal(
          (
            await user.call(`library/items/${editableId}`, "POST", {
              permanent: true,
              folderId: sub.body.id,
            })
          ).status,
          200,
        );
        const list = await user.call("library");
        assert(list.body.some((x: any) => x.variationId === editableId));
        assert.equal(
          (
            await admin.call("library/folders", "POST", {
              name: "No permitido",
              parentId: folder.body.id,
            })
          ).status,
          404,
        );
        assert.equal(
          (await user.call(`library/folders/${sub.body.id}`, "DELETE")).status,
          400,
        );
        assert.equal(
          (
            await user.call(`library/items/${editableId}`, "POST", {
              permanent: false,
            })
          ).status,
          200,
        );
        assert.equal(
          (await db.variation.findUniqueOrThrow({ where: { id: editableId } }))
            .permanent,
          false,
        );
      },
    );
    await t.test(
      "configuraciones personales y oficiales se guardan y aplican con autorización",
      async () => {
        const payload = {
          name: "Diplomados institucionales",
          prompt: "Diseños institucionales con textos claros.",
          settings: {
            count: 1,
            textCount: 1,
            imageTextCount: 0,
            imageCount: 0,
            editable: true,
            format: "1:1",
          },
          visibility: "PERSONAL",
        };
        const preset = await user.call("presets", "POST", payload);
        assert.equal(preset.status, 201);
        assert.equal(
          (
            await user.call("presets/" + preset.body.id + "/apply", "POST", {
              categoryId: cid,
            })
          ).status,
          200,
        );
        assert.equal(
          (await user.call("categories/" + cid)).body.prompt,
          payload.prompt,
        );
        assert.equal(
          (
            await user.call("presets", "POST", {
              ...payload,
              visibility: "OFFICIAL",
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await owner.call("presets", "POST", {
              ...payload,
              visibility: "OFFICIAL",
            })
          ).status,
          201,
        );
        assert.equal(
          (await admin.call("presets/" + preset.body.id, "DELETE")).status,
          404,
        );
      },
    );
    await t.test(
      "una cuenta degradada no puede eliminar una configuración oficial aunque sea su autora",
      async () => {
        const preset = await db.savedPreset.create({
          data: {
            userId: uid,
            name: "Oficial de prueba",
            prompt: "Publicidad autorizada",
            settings: {},
            visibility: "OFFICIAL",
          },
        });
        assert.equal(
          (await user.call("presets/" + preset.id, "DELETE")).status,
          403,
        );
      },
    );
    await t.test(
      "presupuesto individual se aplica antes de crear trabajos y solo OWNER puede modificarlo",
      async () => {
        const payload = {
          scope: "USER",
          targetId: uid,
          monthlyMicros: "0",
          dailyMicros: "0",
          maxJobsPerDay: 0,
        };
        assert.equal((await user.call("budgets", "PUT", payload)).status, 403);
        assert.equal((await owner.call("budgets", "PUT", payload)).status, 200);
        const before = await db.generationJob.count();
        await assert.rejects(
          reserveJobs(
            uid,
            pid,
            [
              {
                subproductId: sid,
                key: randomUUID(),
                snapshot: { prompt: "No debe ejecutarse" },
              },
            ],
            1,
          ),
        );
        assert.equal(await db.generationJob.count(), before);
        await owner.call("budgets", "PUT", {
          ...payload,
          monthlyMicros: "100000000",
          dailyMicros: "100000000",
          maxJobsPerDay: 1000,
        });
      },
    );
    await t.test(
      "regeneración selectiva reserva todo el lote y conserva los originales",
      async () => {
        const before = await db.variation.count();
        const r = await user.call("variations/bulk-regenerate", "POST", {
          ids: [editableId],
          prompt: "Mantener el texto y variar el fondo.",
          confirmCharge: true,
          reviewedInstructions: true,
          requestId: randomUUID(),
        });
        assert.equal(r.status, 202);
        assert.equal(r.body.jobs.length, 1);
        const job = await db.generationJob.findUniqueOrThrow({
          where: { id: r.body.jobs[0] },
        });
        assert.equal((job.snapshot as any).sourceVariationId, editableId);
        assert.equal(await db.variation.count(), before);
        await user.call("jobs/" + job.id + "/cancel", "POST");
      },
    );
    await t.test(
      "limpieza elimina todas las versiones temporales sin tocar el original de otra variación",
      async () => {
        const clone = await user.call(
          `variations/${editableId}/duplicate`,
          "POST",
        );
        const id = clone.body.id;
        await db.variation.update({
          where: { id },
          data: { expiresAt: new Date(0) },
        });
        const { cleanupExpired } = await import("../scripts/worker");
        await cleanupExpired();
        assert(
          (await db.variation.findUniqueOrThrow({ where: { id } })).expired,
        );
        const response = await fetch(root + `/api/variations/${editableId}`, {
          headers: { Cookie: user.cookie },
        });
        assert.equal(response.status, 200);
        assert.equal((await user.call(`variations/${id}/design`)).status, 410);
      },
    );
    await t.test(
      "nuevos lotes guardan una copia de marca sin alterar trabajos anteriores",
      async () => {
        const result = await user.call(`subproducts/${sid}/generate`, "POST", {
          confirmCharge: true,
          reviewedInstructions: true,
          requestId: randomUUID(),
        });
        assert.equal(result.status, 202);
        const job = await db.generationJob.findUniqueOrThrow({
          where: { id: result.body.jobs[0] },
        });
        assert.equal((job.snapshot as any).brand.revision, 2);
        assert((job.snapshot as any).prompt.includes("#123456"));
        const kit = (await user.call(`projects/${pid}/brand`)).body.kit;
        const { revision, projectId, updatedAt, ...values } = kit;
        assert.equal(
          (
            await user.call(`projects/${pid}/brand`, "PUT", {
              ...values,
              expectedRevision: revision,
              name: "Nueva marca",
            })
          ).status,
          200,
        );
        const original = await db.generationJob.findUniqueOrThrow({
          where: { id: job.id },
        });
        assert.equal((original.snapshot as any).brand.name, "Tienda de prueba");
        for (const id of result.body.jobs)
          await user.call(`jobs/${id}/cancel`, "POST");
      },
    );
    const security = new Client();
    let securityId = "",
      resetToken = "";
    const recoveredPassword = "Recuperada-segura-0123456789";
    await t.test(
      "recuperación exclusiva OWNER con reautenticación y token almacenado solo como hash",
      async () => {
        await security.call("auth/register", "POST", {
          email: `security-${tag}@example.test`,
          password,
          name: "Seguridad",
        });
        securityId = (await owner.call("users")).body.find(
          (u: any) => u.email === `security-${tag}@example.test`,
        ).id;
        await owner.call(`users/${securityId}`, "PATCH", {
          role: "USER",
          status: "APPROVED",
        });
        await security.call("auth/login", "POST", {
          email: `security-${tag}@example.test`,
          password,
        });
        const endpoint = `users/${securityId}/recovery`;
        assert.equal(
          (await user.call(endpoint, "POST", { currentPassword: password }))
            .status,
          403,
        );
        assert.equal(
          (await admin.call(endpoint, "POST", { currentPassword: password }))
            .status,
          403,
        );
        assert.equal(
          (
            await owner.call(endpoint, "POST", {
              currentPassword: "Contraseña-incorrecta-01234",
            })
          ).status,
          403,
        );
        const first = await owner.call(endpoint, "POST", {
          currentPassword: password,
        });
        assert.equal(first.status, 201);
        const next = await owner.call(endpoint, "POST", {
          currentPassword: password,
        });
        assert.equal(next.status, 201);
        resetToken = next.body.token;
        assert.equal(
          (
            await anonymous.call("auth/reset-password", "POST", {
              token: first.body.token,
              newPassword: recoveredPassword,
            })
          ).status,
          400,
        );
        const stored = await db.passwordReset.findMany({
          where: { userId: securityId },
        });
        assert.equal(stored.length, 1);
        assert(!JSON.stringify(stored).includes(resetToken));
        assert(
          !JSON.stringify((await owner.call("audit")).body).includes(
            resetToken,
          ),
        );
      },
    );
    await t.test(
      "recuperación de un solo uso, incluso ante solicitudes concurrentes",
      async () => {
        const results = await Promise.all(
          [1, 2].map(() =>
            anonymous.call("auth/reset-password", "POST", {
              token: resetToken,
              newPassword: recoveredPassword,
            }),
          ),
        );
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
        assert.equal((await security.call("auth/me")).status, 401);
        assert.equal(
          (
            await security.call("auth/login", "POST", {
              email: `security-${tag}@example.test`,
              password,
            })
          ).status,
          401,
        );
        assert.equal(
          (
            await security.call("auth/login", "POST", {
              email: `security-${tag}@example.test`,
              password: recoveredPassword,
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await anonymous.call("auth/reset-password", "POST", {
              token: resetToken,
              newPassword: password,
            })
          ).status,
          400,
        );
      },
    );
    await t.test(
      "caducidad de enlaces y suspensión revocan la recuperación",
      async () => {
        const endpoint = `users/${securityId}/recovery`;
        const expired = await owner.call(endpoint, "POST", {
          currentPassword: password,
        });
        await db.passwordReset.updateMany({
          where: { userId: securityId },
          data: { expiresAt: new Date(0) },
        });
        assert.equal(
          (
            await anonymous.call("auth/reset-password", "POST", {
              token: expired.body.token,
              newPassword: password,
            })
          ).status,
          400,
        );
        const valid = await owner.call(endpoint, "POST", {
          currentPassword: password,
        });
        await owner.call(`users/${securityId}`, "PATCH", {
          role: "USER",
          status: "SUSPENDED",
        });
        assert.equal(
          (await owner.call(endpoint, "POST", { currentPassword: password }))
            .status,
          409,
        );
        await owner.call(`users/${securityId}`, "PATCH", {
          role: "USER",
          status: "APPROVED",
        });
        assert.equal(
          (
            await anonymous.call("auth/reset-password", "POST", {
              token: valid.body.token,
              newPassword: password,
            })
          ).status,
          400,
        );
      },
    );
    await t.test(
      "cambiar contraseña exige la actual y cierra sesiones y enlaces pendientes",
      async () => {
        await security.call("auth/login", "POST", {
          email: `security-${tag}@example.test`,
          password: recoveredPassword,
        });
        const second = new Client();
        await second.call("auth/login", "POST", {
          email: `security-${tag}@example.test`,
          password: recoveredPassword,
        });
        const reset = await owner.call(`users/${securityId}/recovery`, "POST", {
          currentPassword: password,
        });
        assert.equal(
          (
            await security.call("auth/change-password", "POST", {
              currentPassword: password,
              newPassword: "Nueva-segura-0123456789",
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await security.call("auth/change-password", "POST", {
              currentPassword: recoveredPassword,
              newPassword: "corta",
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await security.call("auth/change-password", "POST", {
              currentPassword: recoveredPassword,
              newPassword: "Nueva-segura-0123456789",
            })
          ).status,
          200,
        );
        assert.equal((await second.call("auth/me")).status, 401);
        assert.equal((await security.call("auth/me")).status, 401);
        assert.equal(
          (
            await anonymous.call("auth/reset-password", "POST", {
              token: reset.body.token,
              newPassword: password,
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await security.call("auth/login", "POST", {
              email: `security-${tag}@example.test`,
              password: "Nueva-segura-0123456789",
            })
          ).status,
          200,
        );
        const logs = JSON.stringify((await owner.call("audit")).body);
        assert(!logs.includes(recoveredPassword));
        assert(!logs.includes(reset.body.token));
      },
    );
    await t.test(
      "eliminar clave revoca verificación y no filtra secretos en auditoría",
      async () => {
        assert.equal((await owner.call("ai/config", "DELETE")).status, 200);
        const c = await db.providerConfiguration.findUniqueOrThrow({
          where: { id: "global" },
        });
        assert.equal(c.encryptedKey, null);
        assert.equal(c.status, "NOT_CONFIGURED");
        assert(!JSON.stringify(safeConfiguration(c)).includes(config.apiKey));
        const logs = await db.auditEvent.findMany();
        assert(!JSON.stringify(logs).includes(config.apiKey));
      },
    );
    await t.test(
      "papelera conserva auditoría y permite restaurar",
      async () => {
        assert.equal(
          (await user.call("projects/" + pid, "DELETE")).status,
          200,
        );
        assert.equal((await user.call("projects/" + pid)).status, 404);
        assert(
          (await user.call("projects?trash=true")).body.some(
            (p: any) => p.id === pid,
          ),
        );
        assert(
          (await owner.call("audit")).body.some(
            (e: any) => e.action === "PROYECTO_PAPELERA",
          ),
        );
        assert.equal(
          (await user.call("projects/" + pid + "/restore", "POST")).status,
          200,
        );
      },
    );
    await t.test("cierre de sesión invalida el token", async () => {
      assert.equal((await user.call("auth/logout", "POST")).status, 200);
      assert.equal((await user.call("projects")).status, 401);
    });
  } finally {
    await db.$disconnect();
  }
});
