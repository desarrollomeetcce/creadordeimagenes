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
