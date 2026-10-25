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
  observer = new Client(),
  anonymous = new Client();
const password = "Prueba-segura-0123456789";
const tag = randomUUID().slice(0, 8);
let uid = "",
  aid = "",
  oid = "",
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
        const empty = await owner.call("system/statistics");
        assert.equal(empty.status, 200);
        assert.equal(empty.body.total.operations, 0);
        assert.equal(empty.body.total.knownCosts, 0);
        assert.equal(empty.body.total.knownActualMicros, "0");
        assert(
          Object.values(empty.body.groups).every(
            (g: any) => g.rows.length === 0,
          ),
        );
      },
    );
    await t.test(
      "archivos persistentes: límites concurrentes y lectura desde otra conexión",
      async () => {
        const { store, load, remove, fileStream, storageBackend } =
          await import("../lib/storage");
        const previousBackend = process.env.STORAGE_BACKEND,
          previousLimit = process.env.STORAGE_LIMIT_MB;
        process.env.STORAGE_BACKEND = "postgres";
        process.env.STORAGE_LIMIT_MB = "16";
        let names: string[] = [];
        try {
          assert.equal(storageBackend(), "postgres");
          const results = await Promise.allSettled([
            store(Buffer.alloc(9 * 1048576, 7)),
            store(Buffer.alloc(9 * 1048576, 8)),
          ]);
          names = results.flatMap((r) =>
            r.status === "fulfilled" ? [r.value] : [],
          );
          assert.equal(names.length, 1);
          assert.match(names[0], /^pg:/);
          const pg = await import("pg"),
            client = new pg.Client({
              connectionString: process.env.DATABASE_URL,
            });
          await client.connect();
          try {
            const result = await client.query(
              'SELECT octet_length(data)::int AS size FROM "StoredAsset" WHERE id=$1',
              [names[0].slice(3)],
            );
            assert.equal(result.rows[0].size, 9 * 1048576);
          } finally {
            await client.end();
          }
          const bytes = await load(names[0]);
          assert.equal(bytes.length, 9 * 1048576);
          assert.deepEqual(
            Buffer.from(await new Response(fileStream(bytes)).arrayBuffer()),
            bytes,
          );
          await assert.rejects(load("pg:../../secreto"), /válido/);
          await assert.rejects(store(Buffer.alloc(16 * 1048576 + 1)), /16 MB/);
        } finally {
          for (const name of names) await remove(name);
          if (previousBackend === undefined) delete process.env.STORAGE_BACKEND;
          else process.env.STORAGE_BACKEND = previousBackend;
          if (previousLimit === undefined) delete process.env.STORAGE_LIMIT_MB;
          else process.env.STORAGE_LIMIT_MB = previousLimit;
        }
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
    await t.test(
      "mantenimiento y almacenamiento son exclusivos OWNER; procesar sin autorizar no llama a IA",
      async () => {
        assert.equal((await owner.call("system/storage")).status, 200);
        assert.equal((await user.call("system/storage")).status, 403);
        assert.equal((await admin.call("system/cleanup", "POST")).status, 403);
        const job = await db.generationJob.create({
          data: {
            actorId: uid,
            projectId: "connection-test",
            idempotencyKey: randomUUID(),
            snapshot: {},
            reservedMicros: 0n,
          },
        });
        assert.equal(
          (await anonymous.call(`jobs/${job.id}/process`, "POST")).status,
          401,
        );
        assert.equal(
          (await admin.call(`jobs/${job.id}/process`, "POST")).status,
          403,
        );
        assert.equal(
          (await owner.call(`jobs/${job.id}/process`, "POST")).status,
          409,
        );
        assert.equal(
          (await db.generationJob.findUniqueOrThrow({ where: { id: job.id } }))
            .status,
          "PENDING",
        );
        await db.generationJob.delete({ where: { id: job.id } });
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
        assert.equal((await admin.call("projects/" + pid)).status, 404);
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
        assert.equal((await admin.call(path)).status, 404);
        const values = {
          expectedRevision: 0,
          name: "Tienda de prueba",
          prompt: "Comunicación cálida y directa.",
          colors: ["#123456", "#ffffff"],
          font: "DejaVu Serif",
          logoAttachmentIds: [],
        };
        assert.equal((await admin.call(path, "PUT", values)).status, 404);
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
    await t.test(
      "reserva concurrente respeta el plan e ignora límites globales heredados",
      async () => {
        const oldPlan = await db.membershipPlan.findUniqueOrThrow({
          where: { id: "INICIO" },
        });
        await db.membershipPlan.update({
          where: { id: "INICIO" },
          data: { monthlyImages: 1, monthlyAIMicros: 1000000n },
        });
        await db.user.update({
          where: { id: uid },
          data: { planId: "INICIO" },
        });
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
        await db.user.update({ where: { id: uid }, data: { planId: null } });
        await db.membershipPlan.update({
          where: { id: "INICIO" },
          data: {
            monthlyImages: oldPlan.monthlyImages,
            monthlyAIMicros: oldPlan.monthlyAIMicros,
          },
        });
      },
    );
    await t.test(
      "procesamiento interactivo: una sola llamada ante doble clic y resultado persistente",
      async () => {
        const { adapter } = await import("../lib/providers"),
          { processJob } = await import("../lib/jobs");
        const c = await db.providerConfiguration.update({
          where: { id: "global" },
          data: { monthlyLimitMicros: 10000000n, dailyLimitMicros: 10000000n },
        });
        const [job] = await reserveJobs(
          uid,
          pid,
          [
            {
              subproductId: sid,
              key: randomUUID(),
              snapshot: {
                prompt: "Prueba interactiva",
                mode: "Texto",
                index: 0,
                format: "1:1",
                renderMode: "editable",
              },
            },
          ],
          c.revision,
        );
        const provider = adapter("openai"),
          old = provider.direct;
        let calls = 0,
          finish: (() => void) | undefined;
        const pending = new Promise<void>((resolve) => {
          finish = resolve;
        });
        provider.direct = async () => {
          calls++;
          await pending;
          return {
            text: JSON.stringify({
              backgroundPrompt: "",
              backgroundColor: "#ffffff",
              texts: [],
              logos: [],
            }),
            usage: null,
          };
        };
        try {
          const userInfo = { id: uid, role: "USER" };
          const first = processJob(userInfo, job.id);
          for (let n = 0; n < 100 && calls === 0; n++)
            await new Promise((r) => setTimeout(r, 5));
          assert.equal(calls, 1);
          const again = processJob(userInfo, job.id);
          await assert.rejects(again, /curso|procesado/);
          finish!();
          const result = await first;
          assert.equal(result.status, "COMPLETED");
          assert.equal(calls, 1);
          await assert.rejects(processJob(userInfo, job.id), /procesado/);
          const variation = await db.variation.findUniqueOrThrow({
            where: { jobId: job.id },
          });
          if (process.env.STORAGE_BACKEND === "postgres")
            assert(variation.path.startsWith("pg:"));
          // Keep the original suite's one-job assumptions intact, deleting only this synthetic fixture.
          const { remove } = await import("../lib/storage");
          await remove(variation.path);
          await db.imageVersion.deleteMany({
            where: { variationId: variation.id },
          });
          await db.variation.delete({ where: { id: variation.id } });
          await db.usageLedger.delete({ where: { jobId: job.id } });
          await db.generationJob.delete({ where: { id: job.id } });
        } finally {
          finish?.();
          provider.direct = old;
        }
      },
    );
    await t.test(
      "endpoint de procesamiento vuelve a comprobar la cuenta antes de cualquier cargo",
      async () => {
        const c = await db.providerConfiguration.findUniqueOrThrow({
          where: { id: "global" },
        });
        const [job] = await reserveJobs(
          aid,
          pid,
          [
            {
              subproductId: sid,
              key: randomUUID(),
              snapshot: {
                prompt: "No llamar a IA",
                mode: "Texto",
                index: 0,
                format: "1:1",
              },
            },
          ],
          c.revision,
        );
        try {
          await db.user.update({
            where: { id: aid },
            data: { status: "SUSPENDED" },
          });
          const result = await owner.call(`jobs/${job.id}/process`, "POST");
          assert.equal(result.status, 200);
          assert.equal(result.body.status, "FAILED");
          assert.match(result.body.error, /cuenta/);
          assert.equal(
            (
              await db.usageLedger.findUniqueOrThrow({
                where: { jobId: job.id },
              })
            ).status,
            "RELEASED",
          );
          assert.equal(
            (await owner.call(`jobs/${job.id}/process`, "POST")).status,
            409,
          );
        } finally {
          await db.user.update({
            where: { id: aid },
            data: { status: "APPROVED" },
          });
          await db.usageLedger.delete({ where: { jobId: job.id } });
          await db.generationJob.delete({ where: { id: job.id } });
        }
      },
    );
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
            Object.values(
              (await output.loadAsync(await zip.arrayBuffer())).files,
            ).filter((entry) => !entry.dir).length,
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
          404,
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
      "otra variación conserva el prompt original con o sin indicación adicional y afecta solo a esa imagen",
      async () => {
        const original = await db.variation.findUniqueOrThrow({
          where: { id: editableId },
          include: { job: true },
        });
        const { resolveInstructions } = await import("../lib/inheritance");
        const base = resolveInstructions([
          {
            name: "Generación original",
            prompt: String((original.job.snapshot as any).prompt),
          },
        ]).text;
        for (const extra of [
          undefined,
          "Usa un fondo claro y otra composición.",
        ]) {
          const result = await user.call(
            `variations/${editableId}/regenerate`,
            "POST",
            {
              ...(extra ? { prompt: extra } : {}),
              confirmCharge: true,
              reviewedInstructions: true,
              requestId: randomUUID(),
              expectedRevision: original.revision,
            },
          );
          assert.equal(result.status, 202);
          assert.equal(result.body.jobs.length, 1);
          const job = await db.generationJob.findUniqueOrThrow({
              where: { id: result.body.jobs[0] },
            }),
            snapshot = job.snapshot as any;
          assert.equal(job.subproductId, original.subproductId);
          assert.equal(job.status, "PENDING");
          assert(snapshot.prompt.startsWith(base));
          assert.equal(snapshot.sourceVariationId, editableId);
          assert.equal(snapshot.editVariationId, undefined);
          if (extra) assert(snapshot.prompt.includes(extra));
          assert.equal(
            (
              await db.variation.findUniqueOrThrow({
                where: { id: editableId },
              })
            ).revision,
            original.revision,
          );
          await user.call(`jobs/${job.id}/cancel`, "POST");
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
          403,
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
      "crear cuentas, administrar roles y contraseñas sin exponerlas",
      async () => {
        const elevated = await owner.call("users", "POST", {
          name: "Administrador creado",
          email: `newadmin-${tag}@example.test`,
          password,
          role: "ADMIN",
        });
        assert.equal(elevated.status, 201);
        assert(!("passwordHash" in elevated.body));
        assert(!("password" in elevated.body));
        assert.equal(
          (
            await admin.call("users", "POST", {
              name: "No permitido",
              email: `bad-admin-${tag}@example.test`,
              password,
              role: "ADMIN",
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await user.call("users", "POST", {
              name: "No permitido",
              email: `bad-user-${tag}@example.test`,
              password,
              role: "USER",
            })
          ).status,
          403,
        );
        const account = await admin.call("users", "POST", {
          name: "Usuario creado por admin",
          email: `managed-${tag}@example.test`,
          password,
          role: "USER",
        });
        assert.equal(account.status, 201);
        assert.equal(account.body.status, "APPROVED");
        const created = new Client();
        assert.equal(
          (
            await created.call("auth/login", "POST", {
              email: account.body.email,
              password,
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await owner.call(`users/${account.body.id}/password`, "POST", {
              currentPassword: "Incorrecta-0123456789",
              newPassword: "Nueva-creada-0123456789",
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await admin.call(`users/${account.body.id}/password`, "POST", {
              currentPassword: password,
              newPassword: "Nueva-creada-0123456789",
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await owner.call(`users/${account.body.id}/password`, "POST", {
              currentPassword: password,
              newPassword: "Nueva-creada-0123456789",
            })
          ).status,
          200,
        );
        assert.equal((await created.call("auth/me")).status, 401);
        assert.equal(
          (
            await created.call("auth/login", "POST", {
              email: account.body.email,
              password,
            })
          ).status,
          401,
        );
        assert.equal(
          (
            await created.call("auth/login", "POST", {
              email: account.body.email,
              password: "Nueva-creada-0123456789",
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await admin.call(`users/${elevated.body.id}/recovery`, "POST", {
              currentPassword: password,
            })
          ).status,
          403,
        );
        const watching = await admin.call("users", "POST", {
          name: "Observador de prueba",
          email: `observer-${tag}@example.test`,
          password,
          role: "OBSERVER",
        });
        assert.equal(watching.status, 201);
        oid = watching.body.id;
        assert.equal(
          (
            await observer.call("auth/login", "POST", {
              email: watching.body.email,
              password,
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await admin.call(`users/${oid}/recovery`, "POST", {
              currentPassword: password,
            })
          ).status,
          201,
        );
      },
    );
    await t.test(
      "compartir por correo deriva permisos del rol; Observador solo ve y descarga",
      async () => {
        const p = await owner.call("projects", "POST", {
          name: "Privado para compartir",
          prompt: "",
        });
        const path = `projects/${p.body.id}/members`;
        assert.equal((await user.call(`projects/${p.body.id}`)).status, 404);
        assert.equal((await admin.call(`projects/${p.body.id}`)).status, 404);
        assert.equal(
          (
            await admin.call(`projects/${p.body.id}`, "PATCH", {
              name: "No asignado",
              prompt: "",
            })
          ).status,
          404,
        );
        const actualUser = await db.user.findUniqueOrThrow({
          where: { id: uid },
        });
        assert.equal(
          (
            await owner.call(path, "POST", {
              email: actualUser.email,
              permission: "VIEW",
            })
          ).status,
          400,
        );
        assert.equal(
          (await owner.call(path, "POST", { email: actualUser.email })).status,
          200,
        );
        const list = await owner.call(path);
        assert.equal(list.status, 200);
        assert.equal(list.body.members.length, 1);
        assert.deepEqual(Object.keys(list.body.members[0].user).sort(), [
          "email",
          "name",
          "role",
          "status",
        ]);
        assert.equal((await user.call(path)).status, 403);
        assert.equal((await admin.call(path)).status, 404);
        assert.equal(
          (
            await user.call(`projects/${p.body.id}`, "PATCH", {
              name: "Editado",
              prompt: "",
            })
          ).status,
          200,
        );
        assert.equal(
          (await owner.call(`${path}/${uid}`, "PATCH", { permission: "VIEW" }))
            .status,
          405,
        );
        const me = await db.user.findFirstOrThrow({
          where: { email: `owner-${tag}@example.test` },
        });
        assert.equal(
          (await owner.call(path, "POST", { email: me.email })).status,
          409,
        );
        assert.equal(
          (await owner.call(`${path}/${me.id}`, "DELETE")).status,
          409,
        );
        assert.equal(
          (await observer.call(`projects/${p.body.id}`)).status,
          404,
        );
        assert.equal(
          (
            await owner.call(path, "POST", {
              email: `observer-${tag}@example.test`,
            })
          ).status,
          200,
        );
        assert.equal(
          (await observer.call(`projects/${p.body.id}`)).status,
          200,
        );
        assert.equal(
          (
            await observer.call(`projects/${p.body.id}`, "PATCH", {
              name: "Prohibido",
              prompt: "",
            })
          ).status,
          403,
        );
        for (const endpoint of [
          "projects",
          "presets",
          "library/folders",
          "jobs/background",
          "users",
        ])
          assert.equal((await observer.call(endpoint, "POST", {})).status, 403);
        assert.equal((await observer.call("ai/config")).status, 403);
        assert.equal(
          (await owner.call(`${path}/${uid}`, "DELETE")).status,
          200,
        );
        assert.equal((await user.call(`projects/${p.body.id}`)).status, 404);
        assert.equal(
          (await owner.call(`${path}/${oid}`, "DELETE")).status,
          200,
        );
        assert.equal(
          (await observer.call(`projects/${p.body.id}`)).status,
          404,
        );
      },
    );
    await t.test(
      "presets con adjuntos: privacidad, copias independientes, actualización y eliminación",
      async () => {
        const form = new FormData();
        form.set("scope", "category");
        form.set("resourceId", cid);
        form.set("purpose", "Material de contexto");
        form.set(
          "file",
          new File(["Contenido reutilizable de campaña."], "reutilizable.txt", {
            type: "text/plain",
          }),
        );
        const uploaded = await fetch(root + "/api/attachments", {
          method: "POST",
          headers: { Cookie: user.cookie, Origin: root },
          body: form,
        });
        assert.equal(uploaded.status, 201);
        const source = await uploaded.json();
        const payload = {
          name: "Recursos reutilizables",
          prompt: "Campaña clara",
          settings: {},
          visibility: "PERSONAL",
          sourceCategoryId: cid,
          includeAttachments: true,
        };
        const saved = await user.call("presets", "POST", payload);
        assert.equal(saved.status, 201);
        const presetId = saved.body.id;
        const path = `attachments?scope=preset&id=${presetId}`;
        const files = (await user.call(path)).body;
        const savedFile = files.find(
          (f: { name: string }) => f.name === "reutilizable.txt",
        );
        assert(savedFile);
        assert.equal((await admin.call(path)).status, 200);
        assert.equal(
          (await admin.call(`presets/${presetId}/duplicate`, "POST", {}))
            .status,
          201,
        );
        const privateProject = await owner.call("projects", "POST", {
          name: "Recursos privados OWNER",
        });
        const privateCategory = await owner.call(
          `projects/${privateProject.body.id}/categories`,
          "POST",
          { name: "Adjuntos privados" },
        );
        assert.equal(
          (
            await admin.call("presets", "POST", {
              ...payload,
              sourceCategoryId: privateCategory.body.id,
            })
          ).status,
          404,
        );
        assert.equal(
          (await user.call(`attachments/${source.id}`, "DELETE")).status,
          200,
        );
        const read = await fetch(root + "/api/attachments/" + savedFile.id, {
          headers: { Cookie: user.cookie },
        });
        assert.equal(read.status, 200);
        assert.equal(await read.text(), "Contenido reutilizable de campaña.");
        const copied = await user.call(
          `presets/${presetId}/duplicate`,
          "POST",
          {},
        );
        assert.equal(copied.status, 201);
        const duplicatedFiles = (
          await user.call(`attachments?scope=preset&id=${copied.body.id}`)
        ).body;
        assert.equal(duplicatedFiles.length, files.length);
        assert.notEqual(
          duplicatedFiles.find(
            (f: { name: string }) => f.name === "reutilizable.txt",
          ).id,
          savedFile.id,
        );
        const target = await user.call(`projects/${pid}/categories`, "POST", {
          name: "Destino reutilizable",
        });
        const without = await user.call(`presets/${presetId}/apply`, "POST", {
          categoryId: target.body.id,
          includeAttachments: false,
        });
        assert.equal(without.status, 200);
        assert.equal(without.body.attachmentsCopied, 0);
        const applied = await user.call(`presets/${presetId}/apply`, "POST", {
          categoryId: target.body.id,
        });
        assert.equal(applied.status, 200);
        assert.equal(applied.body.attachmentsCopied, files.length);
        const targetFiles = (
          await user.call(`attachments?scope=category&id=${target.body.id}`)
        ).body;
        const finalFile = targetFiles.find(
          (f: { name: string }) => f.name === "reutilizable.txt",
        );
        assert(finalFile);
        const raw = await db.attachment.findMany({
          where: { id: { in: [savedFile.id, finalFile.id] } },
        });
        assert.equal(new Set(raw.map((f) => f.path)).size, 2);
        assert.equal(
          (
            await user.call(`presets/${presetId}`, "PATCH", {
              ...payload,
              name: "Compartida con recursos",
              visibility: "SHARED",
            })
          ).status,
          200,
        );
        assert.equal((await admin.call(path)).status, 200);
        assert.equal(
          (await admin.call(`presets/${presetId}`, "PATCH", payload)).status,
          403,
        );
        assert.equal(
          (await admin.call(`presets/${presetId}/duplicate`, "POST", {}))
            .status,
          201,
        );
        assert.equal(
          (await user.call(`presets/${presetId}`, "DELETE")).status,
          200,
        );
        assert.equal(
          await db.attachment.count({
            where: { scope: "preset", resourceId: presetId },
          }),
          0,
        );
        assert.equal(
          (await user.call(`attachments/${savedFile.id}`)).status,
          404,
        );
        const kept = await fetch(root + "/api/attachments/" + finalFile.id, {
          headers: { Cookie: user.cookie },
        });
        assert.equal(kept.status, 200);
        assert.equal(await kept.text(), "Contenido reutilizable de campaña.");
        assert.equal(
          (await user.call(`attachments?scope=preset&id=${copied.body.id}`))
            .body.length,
          files.length,
        );
      },
    );
    await t.test(
      "herencia independiente de prompt y parámetros; el tema del subproducto permanece obligatorio",
      async () => {
        const original = (await user.call(`categories/${cid}`)).body,
          sub = (await user.call(`subproducts/${sid}`)).body;
        const categoryData = {
          name: original.name,
          prompt: "Mensualidades Gratis grande y precio pequeño.",
          settings: original.settings,
          applyPromptToAll: true,
          applySettingsToAll: true,
        };
        assert.equal(
          (await user.call(`categories/${cid}`, "PATCH", categoryData)).status,
          200,
        );
        assert.equal(
          (
            await user.call(`subproducts/${sid}`, "PATCH", {
              name: "MONITOREO",
              prompt: "Añadir detalles particulares del diplomado.",
              settings: {},
            })
          ).status,
          200,
        );
        let preview = (await user.call(`subproducts/${sid}/instructions`)).body;
        assert(preview.text.includes("Mensualidades Gratis"));
        assert(preview.text.includes("detalles particulares"));
        assert(preview.text.includes("MONITOREO"));
        assert(preview.text.includes("EJE TEMÁTICO OBLIGATORIO"));
        assert.equal(
          (
            await user.call(`categories/${cid}`, "PATCH", {
              ...categoryData,
              applyPromptToAll: false,
              applySettingsToAll: false,
            })
          ).status,
          200,
        );
        preview = (await user.call(`subproducts/${sid}/instructions`)).body;
        assert(!preview.text.includes("Mensualidades Gratis"));
        assert(preview.text.includes("detalles particulares"));
        assert.equal(preview.needsSettings, true);
        const before = await db.generationJob.count();
        assert.equal(
          (
            await user.call(`categories/${cid}/generate`, "POST", {
              confirmCharge: true,
              reviewedInstructions: true,
              requestId: randomUUID(),
              selected: [sid],
            })
          ).status,
          400,
        );
        assert.equal(await db.generationJob.count(), before);
        const own = {
          count: 2,
          textCount: 2,
          imageTextCount: 0,
          imageCount: 0,
          format: "4:5",
          style: "Minimalista",
          editable: true,
        };
        assert.equal(
          (
            await user.call(`subproducts/${sid}`, "PATCH", {
              name: "MONITOREO",
              prompt: "Detalle particular de monitoreo.",
              settings: own,
            })
          ).status,
          200,
        );
        preview = (await user.call(`subproducts/${sid}/instructions`)).body;
        assert.equal(preview.settings.count, 2);
        assert.equal(preview.settings.format, "4:5");
        assert.equal(preview.needsSettings, false);
        await user.call(`categories/${cid}`, "PATCH", {
          ...categoryData,
          applySettingsToAll: false,
        });
        preview = (await user.call(`subproducts/${sid}/instructions`)).body;
        assert(preview.text.includes("Mensualidades Gratis"));
        assert(preview.text.includes("Detalle particular"));
        assert.equal(preview.settings.count, 2);
        const saved = await user.call("presets", "POST", {
          name: "MONITOREO",
          prompt: "Detalle particular de monitoreo.",
          settings: own,
          sourceSubproductId: sid,
        });
        assert.equal(saved.status, 201);
        assert.equal(saved.body.name, "CONFIGURACION MONITOREO");
        const [other] = (
          await user.call(`categories/${cid}/subproducts`, "POST", {
            names: ["Otro tema"],
          })
        ).body;
        assert.equal(
          (
            await user.call(`presets/${saved.body.id}/apply`, "POST", {
              subproductId: other.id,
            })
          ).status,
          200,
        );
        const copied = (await user.call(`subproducts/${other.id}/instructions`))
          .body;
        assert.equal(copied.settings.count, 2);
        assert(copied.text.includes('"Otro tema"'));
        await db.subproduct.delete({ where: { id: other.id } });
        await user.call(`categories/${cid}`, "PATCH", {
          name: original.name,
          prompt: original.prompt,
          settings: original.settings,
          applyPromptToAll: true,
          applySettingsToAll: true,
        });
        await user.call(`subproducts/${sid}`, "PATCH", {
          name: sub.name,
          prompt: sub.prompt,
          settings: sub.settings,
        });
      },
    );
    await t.test(
      "configuraciones visibles por rol y compartidas únicamente con cuentas seleccionadas",
      async () => {
        const created = await admin.call("users", "POST", {
          name: "Usuario externo",
          email: `outside-${tag}@example.test`,
          password,
          role: "USER",
        });
        const outside = new Client();
        await outside.call("auth/login", "POST", {
          email: created.body.email,
          password,
        });
        const preset = await user.call("presets", "POST", {
          name: "Privada del usuario",
          prompt: "Instrucciones compartibles.",
          settings: {},
          visibility: "PERSONAL",
        });
        const id = preset.body.id;
        assert.equal(
          (await outside.call(`attachments?scope=preset&id=${id}`)).status,
          404,
        );
        assert.equal(
          (await observer.call(`attachments?scope=preset&id=${id}`)).status,
          404,
        );
        assert(
          (await admin.call("presets")).body.some(
            (p: { id: string }) => p.id === id,
          ),
        );
        assert(
          (await owner.call("presets")).body.some(
            (p: { id: string }) => p.id === id,
          ),
        );
        assert.equal(
          (
            await user.call(`presets/${id}/shares`, "POST", {
              email: `observer-${tag}@example.test`,
            })
          ).status,
          200,
        );
        assert.equal(
          (await observer.call(`attachments?scope=preset&id=${id}`)).status,
          200,
        );
        assert.equal(
          (
            await observer.call(`presets/${id}/apply`, "POST", {
              categoryId: cid,
            })
          ).status,
          403,
        );
        assert.equal(
          (await outside.call(`attachments?scope=preset&id=${id}`)).status,
          404,
        );
        assert.equal(
          (
            await user.call(`presets/${id}/shares`, "POST", {
              email: created.body.email,
            })
          ).status,
          200,
        );
        assert.equal(
          (await outside.call(`attachments?scope=preset&id=${id}`)).status,
          200,
        );
        assert.equal(
          (
            await outside.call(`presets/${id}`, "PATCH", {
              name: "No permitido",
              prompt: "",
              settings: {},
            })
          ).status,
          403,
        );
        assert.equal(
          (await outside.call(`presets/${id}/duplicate`, "POST", {})).status,
          201,
        );
        assert.equal(
          (await user.call(`presets/${id}/shares/${created.body.id}`, "DELETE"))
            .status,
          200,
        );
        assert.equal(
          (await outside.call(`attachments?scope=preset&id=${id}`)).status,
          404,
        );
      },
    );
    await t.test(
      "una copia fallida revierte archivos almacenados y no publica adjuntos incompletos",
      async () => {
        const { withAttachmentCopies } =
          await import("../lib/attachment-copies");
        const sample = await db.savedPreset.findFirstOrThrow({
          where: { name: "CONFIGURACION Recursos reutilizables · copia" },
        });
        const before = await db.storedAsset.count();
        await assert.rejects(
          withAttachmentCopies(
            { scope: "preset", resourceId: sample.id },
            async () => {
              throw new Error("Fallo controlado de la transacción");
            },
          ),
          /Fallo controlado/,
        );
        assert.equal(await db.storedAsset.count(), before);
        // Processed graphics can be larger than the original upload metadata.
        const { store, remove } = await import("../lib/storage");
        const largePaths: string[] = [];
        try {
          for (let i = 0; i < 2; i++) {
            const path = await store(Buffer.alloc(13000000, i + 1));
            largePaths.push(path);
            await db.attachment.create({
              data: {
                scope: "preset",
                resourceId: sample.id,
                name: `procesado-${i}.txt`,
                mime: "text/plain",
                purpose: "Material de contexto",
                path,
                size: 1,
              },
            });
          }
          await assert.rejects(
            withAttachmentCopies(
              { scope: "preset", resourceId: sample.id },
              async () => {
                assert.fail(
                  "Una copia que supera el tamaño real no debe publicar metadatos",
                );
              },
            ),
            /procesados superan 24 MB/,
          );
          assert.equal(await db.storedAsset.count(), before + 2);
        } finally {
          await db.attachment.deleteMany({
            where: { path: { in: largePaths } },
          });
          await Promise.all(largePaths.map(remove));
        }
        assert.equal(await db.storedAsset.count(), before);
      },
    );
    await t.test(
      "restricciones heredadas no bloquean nuevas generaciones y solo OWNER puede administrarlas",
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
        const jobs = await reserveJobs(
          uid,
          pid,
          [
            {
              subproductId: sid,
              key: randomUUID(),
              snapshot: { prompt: "Acceso según plan" },
            },
          ],
          1,
        );
        assert.equal(await db.generationJob.count(), before + 1);
        assert.equal(jobs[0].reservedMicros, 0n);
        await user.call("jobs/" + jobs[0].id + "/cancel", "POST");
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
      "lote parcial crea solo los subproductos elegidos y rechaza selecciones ajenas",
      async () => {
        const before = await db.generationJob.count();
        const invalid = await user.call(`categories/${cid}/generate`, "POST", {
          confirmCharge: true,
          reviewedInstructions: true,
          requestId: randomUUID(),
          selected: [sid, "ajeno"],
        });
        assert.equal(invalid.status, 400);
        assert.equal(await db.generationJob.count(), before);
        const empty = await user.call(`categories/${cid}/generate`, "POST", {
          confirmCharge: true,
          reviewedInstructions: true,
          requestId: randomUUID(),
          selected: [],
        });
        assert.equal(empty.status, 400);
        const result = await user.call(`categories/${cid}/generate`, "POST", {
          confirmCharge: true,
          reviewedInstructions: true,
          requestId: randomUUID(),
          selected: [sid],
        });
        assert.equal(result.status, 202);
        const jobs = await db.generationJob.findMany({
          where: { id: { in: result.body.jobs } },
        });
        assert(jobs.length > 0 && jobs.every((j) => j.subproductId === sid));
        for (const job of jobs)
          await user.call(`jobs/${job.id}/cancel`, "POST");
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
    await t.test(
      "generar solo encola y devuelve muestras ejecutables; repetir no inicia ni duplica trabajos",
      async () => {
        const key = randomUUID(),
          payload = {
            confirmCharge: true,
            reviewedInstructions: true,
            previewFirst: true,
            requestId: key,
          };
        const result = await user.call(
          `subproducts/${sid}/generate`,
          "POST",
          payload,
        );
        assert.equal(result.status, 202);
        const jobs = await db.generationJob.findMany({
          where: { id: { in: result.body.jobs } },
        });
        assert(jobs.length > 0);
        assert(jobs.every((j) => j.status === "PENDING"));
        assert.deepEqual(
          result.body.runnable,
          jobs.filter((j) => (j.snapshot as any).index === 0).map((j) => j.id),
        );
        assert.equal(result.body.runnable.length, 1);
        assert.equal(
          await db.variation.count({
            where: { jobId: { in: result.body.jobs } },
          }),
          0,
        );
        const repeated = await user.call(
          `subproducts/${sid}/generate`,
          "POST",
          payload,
        );
        assert.deepEqual(repeated.body, result.body);
        for (const id of result.body.jobs)
          await user.call(`jobs/${id}/cancel`, "POST");
        const cancelled = await user.call(
          `subproducts/${sid}/generate`,
          "POST",
          payload,
        );
        assert.deepEqual(cancelled.body.jobs, result.body.jobs);
        assert.deepEqual(cancelled.body.runnable, []);
      },
    );
    await t.test(
      "detener conserva completados/en curso y cancela únicamente pendientes sin alterar sus cargos",
      async () => {
        const config = await db.providerConfiguration.findUniqueOrThrow({
          where: { id: "global" },
        });
        const jobs = await reserveJobs(
          uid,
          pid,
          [0, 1, 2].map((index) => ({
            subproductId: sid,
            key: randomUUID(),
            snapshot: {
              index,
              prompt: "Prueba local de detención",
              mode: "Texto",
              format: "1:1",
            },
          })),
          config.revision,
        );
        await db.generationJob.update({
          where: { id: jobs[0].id },
          data: { status: "COMPLETED" },
        });
        await db.usageLedger.updateMany({
          where: { jobId: jobs[0].id },
          data: { status: "SETTLED", actualMicros: 123n },
        });
        await db.generationJob.update({
          where: { id: jobs[1].id },
          data: { status: "RUNNING" },
        });
        const ids = jobs.map((j) => j.id);
        assert.equal(
          (await admin.call("jobs/stop-many", "POST", { ids })).status,
          404,
        );
        assert.equal(
          (await observer.call("jobs/stop-many", "POST", { ids })).status,
          403,
        );
        const stopped = await user.call("jobs/stop-many", "POST", { ids });
        assert.equal(stopped.status, 200);
        assert.equal(stopped.body.cancelled, 1);
        assert.equal(stopped.body.running, 1);
        const states = await db.generationJob.findMany({
          where: { id: { in: ids } },
        });
        for (const [index, status] of [
          "COMPLETED",
          "RUNNING",
          "CANCELLED",
        ].entries())
          assert.equal(states.find((j) => j.id === ids[index])?.status, status);
        const ledgers = await db.usageLedger.findMany({
          where: { jobId: { in: ids } },
        });
        assert.equal(
          ledgers.find((l) => l.jobId === ids[0])?.actualMicros,
          123n,
        );
        assert.equal(
          ledgers.find((l) => l.jobId === ids[1])?.status,
          "RESERVED",
        );
        assert.equal(
          ledgers.find((l) => l.jobId === ids[2])?.status,
          "RELEASED",
        );
        const repeated = await user.call("jobs/stop-many", "POST", { ids });
        assert.equal(repeated.body.cancelled, 0);
        await db.generationJob.update({
          where: { id: ids[1] },
          data: { status: "PENDING" },
        });
        await user.call(`jobs/${ids[1]}/cancel`, "POST");
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
          201,
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
    let collectionProject = "",
      collectionCategory = "",
      collectionSub = "",
      collectionSecond = "",
      privateImage = "";
    let collectionA = "",
      collectionB = "";
    await t.test(
      "galerías de proyecto y categoría: permisos, filtros y paginación sin rutas privadas",
      async () => {
        const p = await user.call("projects", "POST", {
          name: "Proyecto ../ Galerías",
          prompt: "",
        });
        collectionProject = p.body.id;
        const c = await user.call(
          `projects/${collectionProject}/categories`,
          "POST",
          { name: "Categoría ../ uno", prompt: "" },
        );
        collectionCategory = c.body.id;
        const c2 = await user.call(
          `projects/${collectionProject}/categories`,
          "POST",
          { name: "Otra categoría", prompt: "" },
        );
        const a = await db.subproduct.create({
          data: { name: "Producto Azul", categoryId: collectionCategory },
        });
        collectionSub = a.id;
        const b = await db.subproduct.create({
          data: { name: "Producto Verde", categoryId: collectionCategory },
        });
        collectionSecond = b.id;
        const other = await db.subproduct.create({
          data: { name: "Otro producto", categoryId: c2.body.id },
        });
        const { store } = await import("../lib/storage"),
          sharp = (await import("sharp")).default;
        const png = await sharp({
          create: {
            width: 1200,
            height: 800,
            channels: 3,
            background: "#123456",
          },
        })
          .png()
          .toBuffer();
        const create = async (
          projectId: string,
          subproductId: string | null,
          extras: Record<string, unknown> = {},
        ) => {
          const job = await db.generationJob.create({
            data: {
              actorId: uid,
              projectId,
              subproductId,
              idempotencyKey: randomUUID(),
              status: "COMPLETED",
              snapshot: {},
              reservedMicros: 0n,
            },
          });
          const path = await store(png);
          const v = await db.variation.create({
            data: {
              jobId: job.id,
              subproductId,
              path,
              model: "synthetic",
              expiresAt: new Date(Date.now() + 3600000),
              ...extras,
            },
          });
          await db.imageVersion.create({
            data: {
              variationId: v.id,
              number: 1,
              path,
              actorId: uid,
              sourceJobId: job.id,
            },
          });
          return v.id;
        };
        collectionA = await create(collectionProject, a.id, {
          favorite: true,
          reviewStatus: "APPROVED",
        });
        collectionB = await create(collectionProject, b.id, {
          permanent: true,
          expiresAt: new Date(0),
        });
        await create(collectionProject, b.id, { expiresAt: new Date(0) });
        await create(collectionProject, a.id, { deletedAt: new Date() });
        await create(collectionProject, b.id, { expired: true });
        await create(collectionProject, other.id);
        for (let i = 0; i < 25; i++) await create(collectionProject, a.id);
        const privateProject = await owner.call("projects", "POST", {
          name: "Privado de galería",
        });
        privateImage = await create(privateProject.body.id, null);
        const first = await user.call(
          `gallery?scope=project&id=${collectionProject}`,
        );
        assert.equal(first.status, 200);
        assert.equal(first.body.total, 28);
        assert.equal(first.body.items.length, 24);
        assert.equal(first.body.pages, 2);
        assert.equal(first.body.resource.canEdit, true);
        assert.equal(
          (await admin.call(`gallery?scope=project&id=${collectionProject}`))
            .status,
          404,
        );
        const second = await user.call(
          `gallery?scope=project&id=${collectionProject}&page=2`,
        );
        assert.equal(second.body.items.length, 4);
        assert(
          !second.body.items.some((v: any) =>
            first.body.items.some((x: any) => x.id === v.id),
          ),
        );
        assert.equal(
          (await user.call(`gallery?scope=category&id=${collectionCategory}`))
            .body.total,
          27,
        );
        assert.equal(
          (await user.call(`gallery?scope=subproduct&id=${a.id}`)).body.total,
          26,
        );
        assert.equal(
          (
            await user.call(
              `gallery?scope=project&id=${collectionProject}&favorite=true`,
            )
          ).body.total,
          1,
        );
        assert.equal(
          (
            await user.call(
              `gallery?scope=project&id=${collectionProject}&review=APPROVED`,
            )
          ).body.items[0].id,
          collectionA,
        );
        assert.equal(
          (
            await user.call(
              `gallery?scope=project&id=${collectionProject}&saved=true`,
            )
          ).body.items[0].id,
          collectionB,
        );
        assert.equal(
          (
            await user.call(
              `gallery?scope=project&id=${collectionProject}&q=Verde`,
            )
          ).body.total,
          1,
        );
        assert.equal(
          (
            await user.call(
              `gallery?scope=project&id=${privateProject.body.id}`,
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await admin.call(
              `gallery?scope=project&id=${privateProject.body.id}`,
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await user.call(
              `gallery?scope=project&id=${collectionProject}&page=0`,
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await user.call(
              `gallery?scope=project&id=${collectionProject}&review=INVENTADO`,
            )
          ).status,
          400,
        );
        const serialized = JSON.stringify(first.body);
        assert(!serialized.includes("pg:"));
        assert(!serialized.includes("passwordHash"));
        assert(!serialized.includes("encryptedKey"));
        const thumb = await fetch(
          root + `/api/variations/${collectionA}?thumbnail=true`,
          { headers: { Cookie: user.cookie } },
        );
        assert.equal(thumb.status, 200);
        const dimensions = await sharp(
          Buffer.from(await thumb.arrayBuffer()),
        ).metadata();
        assert.equal(dimensions.width, 640);
        assert(dimensions.height! <= 640);
        assert.equal(thumb.headers.get("content-type"), "image/webp");
        const etag = thumb.headers.get("etag");
        assert(etag);
        assert.equal(
          (
            await fetch(
              root + `/api/variations/${collectionA}?thumbnail=true`,
              { headers: { Cookie: user.cookie, "If-None-Match": etag! } },
            )
          ).status,
          304,
        );
        assert.equal(
          (
            await fetch(
              root + `/api/variations/${collectionA}?thumbnail=true`,
              { headers: { "If-None-Match": etag! } },
            )
          ).status,
          401,
        );
      },
    );
    await t.test(
      "Observador descarga afiches compartidos sin editar ni acceder a recursos privados",
      async () => {
        assert.equal(
          (
            await owner.call(`projects/${collectionProject}/members`, "POST", {
              email: `observer-${tag}@example.test`,
            })
          ).status,
          200,
        );
        const gallery = await observer.call(
          `gallery?scope=project&id=${collectionProject}`,
        );
        assert.equal(gallery.status, 200);
        assert.equal(gallery.body.resource.canEdit, false);
        assert.equal(
          (
            await observer.call(`variations/${collectionA}`, "PATCH", {
              favorite: true,
            })
          ).status,
          403,
        );
        const file = await fetch(
          root + `/api/variations/${collectionA}?download`,
          { headers: { Cookie: observer.cookie } },
        );
        assert.equal(file.status, 200);
        assert.equal(file.headers.get("content-type"), "image/png");
        assert.equal(
          (
            await fetch(root + `/api/variations/${privateImage}`, {
              headers: { Cookie: observer.cookie },
            })
          ).status,
          404,
        );
        const zip = await fetch(root + "/api/exports", {
          method: "POST",
          headers: {
            Cookie: observer.cookie,
            Origin: root,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ids: [collectionA], format: "png" }),
        });
        assert.equal(zip.status, 200);
        assert.equal(
          (
            await observer.call(
              `projects/${collectionProject}/members`,
              "POST",
              { email: `user-${tag}@example.test` },
            )
          ).status,
          403,
        );
      },
    );
    await t.test(
      "ZIP completo y filtrado: carpetas seguras y archivos PNG/JPG independientes",
      async () => {
        const zipRequest = async (client: Client, body: unknown) =>
          fetch(root + "/api/exports", {
            method: "POST",
            headers: {
              Cookie: client.cookie,
              Origin: root,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          });
        const JSZip = (await import("jszip")).default;
        const project = await zipRequest(user, {
          scope: "project",
          id: collectionProject,
          format: "png",
        });
        assert.equal(project.status, 200);
        const archive = await JSZip.loadAsync(await project.arrayBuffer()),
          files = Object.values(archive.files).filter((f) => !f.dir);
        assert.equal(files.length, 28);
        assert(
          files.every(
            (file) =>
              file.name.split("/").length === 4 &&
              file.name.endsWith(".png") &&
              !file.name.includes(".."),
          ),
        );
        const category = await zipRequest(user, {
          scope: "category",
          id: collectionCategory,
        });
        assert.equal(
          Object.values(
            (await JSZip.loadAsync(await category.arrayBuffer())).files,
          ).filter((f) => !f.dir).length,
          27,
        );
        const sub = await zipRequest(user, {
          scope: "subproduct",
          id: collectionSub,
        });
        assert.equal(
          Object.values(
            (await JSZip.loadAsync(await sub.arrayBuffer())).files,
          ).filter((f) => !f.dir).length,
          26,
        );
        const jpg = await zipRequest(user, {
          scope: "project",
          id: collectionProject,
          format: "jpg",
          filters: { favorite: true },
        });
        assert.equal(jpg.status, 200);
        const jpgFiles = Object.values(
          (await JSZip.loadAsync(await jpg.arrayBuffer())).files,
        ).filter((f) => !f.dir);
        assert.equal(jpgFiles.length, 1);
        assert(jpgFiles[0].name.endsWith(".jpg"));
        const bytes = await jpgFiles[0].async("nodebuffer");
        assert.equal(bytes[0], 255);
        assert.equal(bytes[1], 216);
        const mixed = await zipRequest(user, {
          ids: [collectionA, privateImage],
        });
        assert.equal(mixed.status, 404);
        assert(
          (mixed.headers.get("content-type") ?? "").includes(
            "application/json",
          ),
        );
        assert.equal(
          (await zipRequest(owner, { ids: [collectionA, privateImage] }))
            .status,
          200,
        );
        assert.equal(
          (
            await zipRequest(user, {
              scope: "project",
              id: collectionProject,
              filters: { q: "Sin coincidencias" },
            })
          ).status,
          404,
        );
      },
    );
    await t.test(
      "exportación masiva rechaza más de 200 imágenes antes de leer archivos",
      async () => {
        const ids = Array.from({ length: 201 }, () => randomUUID());
        await db.generationJob.createMany({
          data: ids.map((id) => ({
            id,
            actorId: uid,
            projectId: collectionProject,
            subproductId: collectionSecond,
            idempotencyKey: id,
            status: "COMPLETED",
            snapshot: {},
            reservedMicros: 0n,
          })),
        });
        const variationIds = ids.map(() => randomUUID());
        await db.variation.createMany({
          data: ids.map((jobId, i) => ({
            id: variationIds[i],
            jobId,
            subproductId: collectionSecond,
            path: randomUUID(),
            model: "synthetic",
            expiresAt: new Date(Date.now() + 3600000),
          })),
        });
        try {
          const result = await fetch(root + "/api/exports", {
            method: "POST",
            headers: {
              Cookie: user.cookie,
              Origin: root,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ scope: "project", id: collectionProject }),
          });
          assert.equal(result.status, 413);
          assert((await result.json()).error.includes("200"));
        } finally {
          await db.variation.deleteMany({
            where: { id: { in: variationIds } },
          });
          await db.generationJob.deleteMany({ where: { id: { in: ids } } });
        }
      },
    );
    await t.test(
      "lotes en segundo plano: idempotencia, permisos y pausa después del afiche actual",
      async () => {
        const { prepareBackground, pauseBackground, backgroundTick } =
          await import("../lib/background");
        const { adapter } = await import("../lib/providers");
        const c = await db.providerConfiguration.findUniqueOrThrow({
          where: { id: "global" },
        });
        const jobs = await reserveJobs(
          uid,
          pid,
          [0, 1].map((index) => ({
            subproductId: sid,
            key: randomUUID(),
            snapshot: {
              prompt: "Prueba de lote",
              mode: "Texto",
              format: "1:1",
              index,
              renderMode: "editable",
            },
          })),
          c.revision,
        );
        const ids = jobs.map((j) => j.id),
          me = { id: uid, role: "USER" },
          key = randomUUID();
        assert.equal(
          (
            await admin.call("jobs/background", "POST", {
              ids,
              requestId: randomUUID(),
            })
          ).status,
          403,
        );
        const prepared = await Promise.all([
          prepareBackground(me, ids, key),
          prepareBackground(me, ids, key),
        ]);
        assert.equal(new Set(prepared.map((p) => p.batch.id)).size, 1);
        assert.equal(prepared.filter((p) => p.created).length, 1);
        await assert.rejects(
          prepareBackground(me, [ids[0]], key),
          /otros trabajos/,
        );
        const batch = prepared[0].batch;
        assert.equal(
          (await admin.call(`jobs/background/${batch.id}/pause`, "POST", {}))
            .status,
          404,
        );
        const listing = await user.call("jobs/background");
        assert.deepEqual(
          listing.body.batches
            .find((b: any) => b.id === batch.id)
            .pendingIds.slice()
            .sort(),
          ids.slice().sort(),
        );
        assert(
          !(await admin.call("jobs/background")).body.batches.some(
            (b: any) => b.id === batch.id,
          ),
        );
        await pauseBackground(me, batch.id);
        assert.equal(
          await runOne({
            id: ids[0],
            background: { batchId: batch.id, runId: "late-dispatch" },
          }),
          false,
        );
        assert.equal(await backgroundTick(batch.id, "late-dispatch"), "STOP");
        assert.equal(
          (
            await db.backgroundBatch.findUniqueOrThrow({
              where: { id: batch.id },
            })
          ).status,
          "PAUSED",
        );
        const resumed = await prepareBackground(me, ids, randomUUID());
        const provider = adapter("openai"),
          old = provider.direct;
        let calls = 0,
          release: (() => void) | undefined;
        provider.direct = async () => {
          calls++;
          if (calls === 1)
            await new Promise<void>((resolve) => {
              release = resolve;
            });
          return {
            text: JSON.stringify({
              backgroundPrompt: "",
              backgroundColor: "#ffffff",
              texts: [],
              logos: [],
            }),
            usage: null,
          };
        };
        try {
          const first = backgroundTick(resumed.batch.id, "run-pause");
          for (let i = 0; i < 200 && !release; i++)
            await new Promise((r) => setTimeout(r, 5));
          assert.equal(calls, 1);
          assert(release);
          assert.equal(
            await backgroundTick(resumed.batch.id, "duplicate-run"),
            "STOP",
          );
          await pauseBackground(me, resumed.batch.id);
          release();
          assert.equal(await first, "CONTINUE");
          assert.equal(
            await backgroundTick(resumed.batch.id, "run-pause"),
            "STOP",
          );
          assert.equal(
            (
              await db.backgroundBatch.findUniqueOrThrow({
                where: { id: resumed.batch.id },
              })
            ).status,
            "PAUSED",
          );
          const remaining = await db.generationJob.findMany({
            where: { id: { in: ids }, status: "PENDING" },
          });
          assert.equal(remaining.length, 1);
          const beforeClaim = await prepareBackground(
            me,
            remaining.map((j) => j.id),
            randomUUID(),
          );
          let unlock!: () => void, acquired!: () => void;
          const ready = new Promise<void>((resolve) => {
            acquired = resolve;
          });
          const held = db.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
            acquired();
            await new Promise<void>((resolve) => {
              unlock = resolve;
            });
          });
          await ready;
          const racing = backgroundTick(
            beforeClaim.batch.id,
            "pause-before-claim",
          );
          try {
            for (let i = 0; i < 200; i++) {
              const state = await db.backgroundBatch.findUniqueOrThrow({
                where: { id: beforeClaim.batch.id },
              });
              if (state.runId === "pause-before-claim") break;
              await new Promise((resolve) => setTimeout(resolve, 5));
            }
            await pauseBackground(me, beforeClaim.batch.id);
          } finally {
            unlock();
            await held;
          }
          assert.equal(await racing, "STOP");
          assert.equal(calls, 1);
          assert.equal(
            (
              await db.backgroundBatch.findUniqueOrThrow({
                where: { id: beforeClaim.batch.id },
              })
            ).status,
            "PAUSED",
          );
          const last = await prepareBackground(
            me,
            remaining.map((j) => j.id),
            randomUUID(),
          );
          assert.equal(
            await backgroundTick(last.batch.id, "run-complete"),
            "CONTINUE",
          );
          assert.equal(
            await backgroundTick(last.batch.id, "run-complete"),
            "STOP",
          );
          assert.equal(
            await backgroundTick(last.batch.id, "duplicate-run"),
            "STOP",
          );
          assert.equal(calls, 2);
          assert.equal(
            (
              await db.backgroundBatch.findUniqueOrThrow({
                where: { id: last.batch.id },
              })
            ).status,
            "COMPLETED",
          );
        } finally {
          release?.();
          provider.direct = old;
        }
      },
    );
    await t.test(
      "un cargo incierto detiene el lote sin reintentos ni avance al siguiente afiche",
      async () => {
        const { prepareBackground, backgroundTick } =
          await import("../lib/background");
        const { adapter } = await import("../lib/providers");
        const c = await db.providerConfiguration.findUniqueOrThrow({
          where: { id: "global" },
        });
        const jobs = await reserveJobs(
          uid,
          pid,
          [0, 1].map((index) => ({
            subproductId: sid,
            key: randomUUID(),
            snapshot: {
              prompt: "Prueba incierta",
              mode: "Texto",
              format: "1:1",
              index,
              renderMode: "editable",
            },
          })),
          c.revision,
        );
        const batch = (
          await prepareBackground(
            { id: uid, role: "USER" },
            jobs.map((j) => j.id),
            randomUUID(),
          )
        ).batch;
        const provider = adapter("openai"),
          old = provider.direct;
        let calls = 0;
        provider.direct = async () => {
          calls++;
          throw new Error("Fallo de transporte sintético");
        };
        try {
          assert.equal(await backgroundTick(batch.id, "uncertain-run"), "STOP");
          assert.equal(await backgroundTick(batch.id, "uncertain-run"), "STOP");
          assert.equal(calls, 1);
          assert.equal(
            (
              await db.backgroundBatch.findUniqueOrThrow({
                where: { id: batch.id },
              })
            ).status,
            "NEEDS_REVIEW",
          );
          const states = await db.generationJob.findMany({
            where: { id: { in: jobs.map((j) => j.id) } },
          });
          const uncertain = states.find((j) => j.status === "UNCERTAIN"),
            pending = states.find((j) => j.status === "PENDING");
          assert(uncertain);
          assert(pending);
          assert.equal(
            (
              await user.call("jobs/background", "POST", {
                ids: [uncertain.id],
                requestId: randomUUID(),
              })
            ).status,
            409,
          );
          assert.equal(
            (await user.call(`jobs/${pending.id}/cancel`, "POST", {})).status,
            200,
          );
        } finally {
          provider.direct = old;
        }
      },
    );
    await t.test(
      "Workflow real local ejecuta sin navegador y bloquea una configuración obsoleta antes de llamar al proveedor",
      async () => {
        const c = await db.providerConfiguration.findUniqueOrThrow({
          where: { id: "global" },
        });
        const [job] = await reserveJobs(
          uid,
          pid,
          [
            {
              subproductId: sid,
              key: randomUUID(),
              snapshot: {
                prompt: "No debe llamar al proveedor",
                mode: "Texto",
                format: "1:1",
                index: 0,
                renderMode: "editable",
              },
            },
          ],
          c.revision,
        );
        await db.generationJob.update({
          where: { id: job.id },
          data: {
            snapshot: { ...(job.snapshot as object), configRevision: -1 },
          },
        });
        const requestId = randomUUID();
        const result = await user.call("jobs/background", "POST", {
          ids: [job.id],
          requestId,
        });
        assert.equal(result.status, 202);
        const duplicate = await user.call("jobs/background", "POST", {
          ids: [job.id],
          requestId,
        });
        assert.equal(duplicate.status, 200);
        assert.equal(duplicate.body.id, result.body.id);
        let state = "";
        for (let i = 0; i < 200; i++) {
          state = (
            await db.backgroundBatch.findUniqueOrThrow({
              where: { id: result.body.id },
            })
          ).status;
          if (state === "NEEDS_REVIEW") break;
          await new Promise((r) => setTimeout(r, 100));
        }
        assert.equal(state, "NEEDS_REVIEW");
        assert.equal(
          (await db.generationJob.findUniqueOrThrow({ where: { id: job.id } }))
            .status,
          "FAILED",
        );
        assert.equal(
          (await db.usageLedger.findUniqueOrThrow({ where: { jobId: job.id } }))
            .status,
          "RELEASED",
        );
        assert.equal(
          (
            await user.call(
              `jobs/background/${result.body.id}/check`,
              "POST",
              {},
            )
          ).status,
          200,
        );
        const list = await user.call("jobs/background");
        assert.equal(list.status, 200);
        assert.equal(list.body.available, true);
        assert(!JSON.stringify(list.body).includes("encryptedKey"));
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
    await t.test(
      "estadísticas OWNER agregan más de 200 operaciones sin inventar costes y respetan fechas de Perú",
      async () => {
        for (const client of [user, admin, observer])
          assert.equal((await client.call("system/statistics")).status, 403);
        assert.equal((await anonymous.call("system/statistics")).status, 401);
        assert.equal(
          (await owner.call("system/statistics?days=999")).status,
          400,
        );
        assert.equal(
          (await owner.call("system/statistics?days=30%3BSELECT")).status,
          400,
        );
        const baseline = await owner.call("system/statistics?days=7");
        assert.equal(baseline.status, 200);
        assert.equal(baseline.body.period.timeZone, "America/Lima");
        assert.equal(new Date(baseline.body.period.start).getUTCHours(), 5);
        const projectIds = [randomUUID(), randomUUID()],
          model = `statistics-${tag}`;
        const jobIds = Array.from({ length: 209 }, () => randomUUID());
        const start = new Date(baseline.body.period.start);
        const recent = new Date(Date.now() - 1000);
        try {
          await db.project.createMany({
            data: projectIds.map((id) => ({
              id,
              ownerId: uid,
              name: "Mismo nombre de estadísticas",
            })),
          });
          await db.generationJob.createMany({
            data: jobIds.map((id, i) => ({
              id,
              actorId: uid,
              projectId: projectIds[i === 1 ? 1 : 0],
              idempotencyKey: id,
              snapshot: { secret: "must-not-leak" },
              reservedMicros: 1000n,
              status: i === 206 ? "UNCERTAIN" : "COMPLETED",
              createdAt:
                i === 207
                  ? new Date(start.getTime() - 1)
                  : i === 208
                    ? new Date(Date.now() + 86400000)
                    : i === 2
                      ? new Date(start.getTime() + 3600000)
                      : recent,
            })),
          });
          await db.usageLedger.createMany({
            data: jobIds.map((jobId, i) => ({
              jobId,
              actorId: uid,
              projectId: projectIds[i === 1 ? 1 : 0],
              model,
              reservedMicros: i === 206 ? 2000n : 1000n,
              actualMicros: i === 0 ? 1000000n : i === 1 ? 0n : null,
              status:
                i === 205
                  ? "RELEASED"
                  : i === 206
                    ? "UNCERTAIN"
                    : "CONSUMED_ESTIMATE",
              createdAt:
                i === 207
                  ? new Date(start.getTime() - 1)
                  : i === 208
                    ? new Date(Date.now() + 86400000)
                    : i === 2
                      ? new Date(start.getTime() + 3600000)
                      : recent,
            })),
          });
          await db.variation.createMany({
            data: jobIds.slice(0, 2).map((jobId) => ({
              jobId,
              path: "unused-test-path",
              model,
              reviewStatus: "APPROVED",
              expiresAt: recent,
            })),
          });
          const report = await owner.call("system/statistics?days=7");
          assert.equal(report.status, 200);
          const total = report.body.total;
          assert.equal(total.operations - baseline.body.total.operations, 207);
          assert.equal(
            BigInt(total.reservedMicros) -
              BigInt(baseline.body.total.reservedMicros),
            207000n,
          );
          assert.equal(
            BigInt(total.knownActualMicros) -
              BigInt(baseline.body.total.knownActualMicros),
            1000000n,
          );
          const group = report.body.groups.model.rows.find(
            (r: any) => r.id === model,
          );
          assert.equal(group.operations, 207);
          assert.equal(group.knownCosts, 2);
          assert.equal(group.unknownCosts, 204);
          assert.equal(group.uncertain, 1);
          assert.equal(group.images, 2);
          assert.equal(group.approved, 2);
          assert.equal(group.pricedImages, 2);
          assert.equal(group.pricedApproved, 2);
          assert.equal(group.pricedApprovedMicros, "1000000");
          assert.equal(
            report.body.groups.project.rows.filter((r: any) =>
              projectIds.includes(r.id),
            ).length,
            2,
          );
          const day = new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Lima",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date(start.getTime() + 3600000));
          const before =
            baseline.body.groups.day.rows.find((r: any) => r.id === day)
              ?.operations ?? 0;
          const after =
            report.body.groups.day.rows.find((r: any) => r.id === day)
              ?.operations ?? 0;
          assert.equal(after - before, 1);
          for (const text of [
            "must-not-leak",
            "unused-test-path",
            "passwordHash",
            "encryptedKey",
            config.apiKey,
          ])
            assert(!JSON.stringify(report.body).includes(text));
          assert.equal(
            (await owner.call("system/statistics?days=90")).status,
            200,
          );
        } finally {
          await db.variation.deleteMany({ where: { jobId: { in: jobIds } } });
          await db.usageLedger.deleteMany({ where: { jobId: { in: jobIds } } });
          await db.generationJob.deleteMany({ where: { id: { in: jobIds } } });
          await db.project.deleteMany({ where: { id: { in: projectIds } } });
        }
      },
    );
    await t.test(
      "accesos por producto y subproducto aíslan hermanos, archivos, galerías y administradores",
      async () => {
        const p = await owner.call("projects", "POST", {
          name: "Proyecto granular",
          prompt: "PROMPT_PRIVADO_PROYECTO",
        });
        const projectId = p.body.id;
        const a = await owner.call(`projects/${projectId}/categories`, "POST", {
          name: "Producto A",
          prompt: "PROMPT_PRIVADO_A",
        });
        const b = await owner.call(`projects/${projectId}/categories`, "POST", {
          name: "Producto B",
          prompt: "PROMPT_PRIVADO_B",
        });
        const aSubs = (
          await owner.call(`categories/${a.body.id}/subproducts`, "POST", {
            names: ["Tema A1", "Tema A2"],
          })
        ).body;
        const bSubs = (
          await owner.call(`categories/${b.body.id}/subproducts`, "POST", {
            names: ["Tema B1", "Tema B2"],
          })
        ).body;
        const account = await db.user.findUniqueOrThrow({ where: { id: uid } });
        const watching = await db.user.findUniqueOrThrow({
          where: { id: oid },
        });
        const group = `projects/${projectId}/members`;
        assert.equal((await admin.call(`projects/${projectId}`)).status, 404);
        assert.equal(
          (await user.call(group, "PATCH", { allAdministrators: true })).status,
          404,
        );
        assert.equal(
          (await owner.call(group, "PATCH", { allAdministrators: true }))
            .status,
          200,
        );
        assert.equal(
          (await admin.call(`projects/${projectId}`)).body.canEdit,
          true,
        );
        assert.equal(
          (await admin.call(group, "PATCH", { allAdministrators: false }))
            .status,
          403,
        );
        assert.equal(
          (
            await admin.call(`categories/${a.body.id}`, "PATCH", {
              name: "Producto A",
              prompt: "PROMPT_PRIVADO_A",
              settings: {},
            })
          ).status,
          200,
        );
        assert.equal(
          (await owner.call(group, "PATCH", { allAdministrators: false }))
            .status,
          200,
        );
        assert.equal((await admin.call(`categories/${a.body.id}`)).status, 404);
        const directory = await owner.call(
          group + "/directory?q=" + encodeURIComponent(account.email),
        );
        assert.equal(directory.status, 200);
        assert.equal(directory.body.users.length, 1);
        assert.deepEqual(Object.keys(directory.body.users[0]).sort(), [
          "email",
          "id",
          "name",
          "role",
        ]);
        assert.equal((await user.call(group + "/directory")).status, 404);
        assert.equal(
          (await owner.call(group + "/directory?q=noexiste@example.test")).body
            .users.length,
          0,
        );
        assert.equal(
          (
            await owner.call(`categories/${a.body.id}/members`, "POST", {
              email: account.email,
            })
          ).status,
          200,
        );
        let visible = await user.call(`projects/${projectId}`);
        assert.equal(visible.body.prompt, "");
        assert.equal(visible.body.canEdit, false);
        assert.deepEqual(
          visible.body.categories.map((c: any) => c.id),
          [a.body.id],
        );
        assert.equal(
          (await user.call(`categories/${a.body.id}`)).body.canEdit,
          true,
        );
        assert.equal((await user.call(`categories/${b.body.id}`)).status, 404);
        assert.equal(
          (await user.call(`subproducts/${aSubs[1].id}`)).status,
          200,
        );
        assert.equal(
          (await user.call(`attachments?scope=project&id=${projectId}`)).status,
          404,
        );
        assert.equal(
          (await owner.call(`categories/${a.body.id}/members/${uid}`, "DELETE"))
            .status,
          200,
        );
        assert.equal(
          (
            await owner.call(`subproducts/${bSubs[0].id}/members`, "POST", {
              email: account.email,
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await owner.call(`subproducts/${bSubs[0].id}/members`, "POST", {
              email: watching.email,
            })
          ).status,
          200,
        );
        visible = await user.call(`categories/${b.body.id}`);
        assert.equal(visible.body.prompt, "");
        assert.equal(visible.body.canEdit, false);
        assert.deepEqual(
          visible.body.subproducts.map((s: any) => s.id),
          [bSubs[0].id],
        );
        assert.equal(visible.body.subproducts[0].canEdit, true);
        assert.equal(
          (await user.call(`subproducts/${bSubs[1].id}`)).status,
          404,
        );
        assert.equal(
          (await observer.call(`subproducts/${bSubs[0].id}`)).body.canEdit,
          false,
        );
        assert.equal(
          (
            await observer.call(`subproducts/${bSubs[0].id}`, "PATCH", {
              name: "No",
              prompt: "",
              settings: {},
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await user.call(`subproducts/${bSubs[0].id}`, "PATCH", {
              name: "Tema B1",
              prompt: "Personalizado",
              settings: {},
            })
          ).status,
          200,
        );
        const { store } = await import("../lib/storage");
        const png = await (
          await import("sharp")
        )
          .default({
            create: {
              width: 30,
              height: 30,
              channels: 3,
              background: "#123456",
            },
          })
          .png()
          .toBuffer();
        const image = async (subproductId: string) => {
          const job = await db.generationJob.create({
            data: {
              actorId: uid,
              projectId,
              subproductId,
              idempotencyKey: randomUUID(),
              snapshot: {},
              reservedMicros: 0n,
              status: "COMPLETED",
            },
          });
          return db.variation.create({
            data: {
              jobId: job.id,
              subproductId,
              path: await store(png),
              model: "synthetic",
              expiresAt: new Date(Date.now() + 3600000),
            },
          });
        };
        const allowed = await image(bSubs[0].id),
          denied = await image(bSubs[1].id);
        const inheritedLogo = await db.attachment.create({
          data: {
            scope: "project",
            resourceId: projectId,
            name: "logo.png",
            mime: "image/png",
            purpose: "LOGO",
            path: await store(png),
            size: png.length,
          },
        });
        const unusedLogo = await db.attachment.create({
          data: {
            scope: "project",
            resourceId: projectId,
            name: "privado.png",
            mime: "image/png",
            purpose: "LOGO",
            path: await store(png),
            size: png.length,
          },
        });
        await db.imageVersion.create({
          data: {
            variationId: allowed.id,
            number: 1,
            path: allowed.path,
            actorId: uid,
            document: {
              layers: [{ type: "logo", attachmentId: inheritedLogo.id }],
            },
          },
        });
        for (const who of [user, observer]) {
          const headers = { Cookie: who.cookie };
          assert.equal(
            (
              await fetch(root + `/api/attachments/${inheritedLogo.id}`, {
                headers,
              })
            ).status,
            404,
          );
          assert.equal(
            (
              await fetch(
                root +
                  `/api/variations/${allowed.id}/logos/${inheritedLogo.id}`,
                { headers },
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await fetch(
                root + `/api/variations/${allowed.id}/logos/${unusedLogo.id}`,
                { headers },
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await fetch(
                root + `/api/variations/${denied.id}/logos/${inheritedLogo.id}`,
                { headers },
              )
            ).status,
            404,
          );
        }
        for (const who of [user, observer]) {
          const gallery = await who.call(
            `gallery?scope=project&id=${projectId}`,
          );
          assert.equal(gallery.status, 200);
          assert.deepEqual(
            gallery.body.items.map((v: any) => v.id),
            [allowed.id],
          );
          const direct = await fetch(root + `/api/variations/${allowed.id}`, {
            headers: { Cookie: who.cookie },
          });
          assert.equal(direct.status, 200);
          const forbidden = await fetch(root + `/api/variations/${denied.id}`, {
            headers: { Cookie: who.cookie },
          });
          assert.equal(forbidden.status, 404);
          const zip = await fetch(root + "/api/exports", {
            method: "POST",
            headers: {
              Cookie: who.cookie,
              Origin: root,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ scope: "project", id: projectId }),
          });
          assert.equal(zip.status, 200);
          const mixed = await who.call("exports", "POST", {
            ids: [allowed.id, denied.id],
          });
          assert.equal(mixed.status, 404);
        }
        const pending = await db.generationJob.create({
          data: {
            actorId: uid,
            projectId,
            subproductId: bSubs[1].id,
            idempotencyKey: randomUUID(),
            snapshot: {},
            reservedMicros: 10n,
          },
        });
        assert.equal(
          (await user.call(`jobs/${pending.id}/process`, "POST", {})).status,
          404,
        );
        assert.equal(
          (
            await owner.call(
              `subproducts/${bSubs[0].id}/members/${uid}`,
              "DELETE",
            )
          ).status,
          200,
        );
        assert.equal(
          (await user.call(`subproducts/${bSubs[0].id}`)).status,
          404,
        );
        assert.equal((await user.call(`projects/${projectId}`)).status, 404);
      },
    );
    await t.test(
      "agregar suma espacios y eliminar subproductos retira lotes, cancela pendientes y conserva historial",
      async () => {
        const p = await user.call("projects", "POST", {
          name: "Espacios eliminables",
        });
        const product = await user.call(
          `projects/${p.body.id}/categories`,
          "POST",
          { name: "Producto de espacios" },
        );
        const id = product.body.id;
        const first = await user.call(`categories/${id}/subproducts`, "POST", {
          names: ["Uno", "Dos", "Tres"],
        });
        const more = await user.call(`categories/${id}/subproducts`, "POST", {
          names: ["Cuatro", "Cinco", "Seis", "Siete"],
        });
        assert.equal(
          (await user.call(`categories/${id}`)).body.subproducts.length,
          7,
        );
        const target = first.body[0].id;
        const job = await db.generationJob.create({
          data: {
            actorId: uid,
            projectId: p.body.id,
            subproductId: target,
            idempotencyKey: randomUUID(),
            snapshot: {},
            reservedMicros: 123n,
          },
        });
        await db.usageLedger.create({
          data: {
            jobId: job.id,
            actorId: uid,
            projectId: p.body.id,
            model: "synthetic",
            reservedMicros: 123n,
          },
        });
        const removed = await user.call(`subproducts/${target}`, "DELETE");
        assert.equal(removed.status, 200);
        assert.equal(removed.body.cancelled, 1);
        assert.equal(
          (await db.generationJob.findUniqueOrThrow({ where: { id: job.id } }))
            .status,
          "CANCELLED",
        );
        assert.equal(
          (await db.usageLedger.findUniqueOrThrow({ where: { jobId: job.id } }))
            .status,
          "RELEASED",
        );
        assert(
          (await db.subproduct.findUniqueOrThrow({ where: { id: target } }))
            .deletedAt,
        );
        assert.equal(
          (await user.call(`categories/${id}`)).body.subproducts.length,
          6,
        );
        assert.equal((await user.call(`subproducts/${target}`)).status, 404);
        const bad = await user.call("subproducts/bulk-delete", "POST", {
          ids: [first.body[1].id, "does-not-exist"],
        });
        assert.equal(bad.status, 404);
        assert.equal(
          (await user.call(`categories/${id}`)).body.subproducts.length,
          6,
        );
        const running = await db.generationJob.create({
          data: {
            actorId: uid,
            projectId: p.body.id,
            subproductId: first.body[1].id,
            idempotencyKey: randomUUID(),
            snapshot: {},
            reservedMicros: 0n,
            status: "RUNNING",
          },
        });
        assert.equal(
          (await user.call(`subproducts/${first.body[1].id}`, "DELETE")).status,
          409,
        );
        await db.generationJob.update({
          where: { id: running.id },
          data: { status: "FAILED" },
        });
        assert.equal(
          (
            await user.call("subproducts/bulk-delete", "POST", {
              ids: [first.body[1].id, more.body[0].id],
            })
          ).body.removed,
          2,
        );
        const previews = await user.call(`categories/${id}/preview`);
        assert.equal(previews.status, 200);
        assert.equal(previews.body.length, 4);
        assert(
          !(await user.call(`projects/${p.body.id}`)).body.categories.some(
            (c: any) => c._count.subproducts !== 4,
          ),
        );
      },
    );
    await t.test(
      "recuperar espacios conserva contenido y permisos sin reactivar cargos; papelera paginada y protegida",
      async () => {
        const p = await user.call("projects", "POST", {
          name: "Proyecto recuperación",
        });
        const c = await user.call(`projects/${p.body.id}/categories`, "POST", {
          name: "Producto recuperación",
        });
        const categoryId = c.body.id;
        const sub = await user.call(
          `categories/${categoryId}/subproducts`,
          "POST",
          { names: ["Tema recuperable", "Tema administrador"] },
        );
        const target = sub.body[0].id;
        await user.call(`subproducts/${target}`, "PATCH", {
          name: "Tema recuperable",
          prompt: "INSTRUCCIONES_CONSERVADAS",
          settings: {
            count: 2,
            textCount: 0,
            imageTextCount: 2,
            imageCount: 0,
          },
        });
        const watching = await db.user.findUniqueOrThrow({
          where: { id: oid },
        });
        const manager = await db.user.findUniqueOrThrow({ where: { id: aid } });
        await user.call(`subproducts/${target}/members`, "POST", {
          email: watching.email,
        });
        await user.call(`subproducts/${target}/members`, "POST", {
          email: manager.email,
        });
        await user.call(`projects/${p.body.id}/members`, "POST", {
          email: watching.email,
        });
        const job = await db.generationJob.create({
          data: {
            actorId: uid,
            projectId: p.body.id,
            subproductId: target,
            idempotencyKey: randomUUID(),
            snapshot: {},
            reservedMicros: 321n,
          },
        });
        await db.usageLedger.create({
          data: {
            jobId: job.id,
            actorId: uid,
            projectId: p.body.id,
            model: "synthetic",
            reservedMicros: 321n,
          },
        });
        assert.equal(
          (
            await user.call("subproducts/bulk-delete", "POST", {
              ids: sub.body.map((s: any) => s.id),
            })
          ).status,
          200,
        );
        await db.subproduct.createMany({
          data: Array.from({ length: 23 }, (_, i) => ({
            name: `Espacio antiguo ${i}`,
            categoryId,
            deletedAt: new Date(Date.now() - 86400000),
          })),
        });
        const endpoint = `categories/${categoryId}/subproducts/trash`;
        for (const [client, status] of [
          [anonymous, 401],
          [observer, 403],
          [admin, 404],
        ] as const)
          assert.equal((await client.call(endpoint)).status, status);
        assert.equal(
          (await admin.call(`subproducts/${target}/restore`, "POST")).status,
          404,
        );
        assert.equal(
          (await observer.call(`subproducts/${target}/restore`, "POST")).status,
          403,
        );
        assert.equal((await user.call(endpoint + "?page=0")).status, 400);
        const first = await user.call(endpoint),
          second = await user.call(endpoint + "?page=2");
        assert.equal(first.status, 200);
        assert.equal(first.body.total, 25);
        assert.equal(first.body.items.length, 20);
        assert.equal(second.body.items.length, 5);
        assert(
          !first.body.items.some((s: any) =>
            second.body.items.some((other: any) => s.id === other.id),
          ),
        );
        assert.equal(
          (await user.call(endpoint + "?q=recuperable")).body.total,
          1,
        );
        assert.equal((await user.call(endpoint + "?q=noexiste")).body.total, 0);
        assert(
          !JSON.stringify(first.body).includes("INSTRUCCIONES_CONSERVADAS"),
        );
        const beforeJobs = await db.generationJob.count(),
          beforeLedgers = await db.usageLedger.count();
        const attempts = await Promise.all([
          user.call(`subproducts/${target}/restore`, "POST"),
          user.call(`subproducts/${target}/restore`, "POST"),
        ]);
        assert.deepEqual(attempts.map((r) => r.status).sort(), [200, 409]);
        const restored = await user.call(`subproducts/${target}`);
        assert.equal(restored.status, 200);
        assert.equal(restored.body.prompt, "INSTRUCCIONES_CONSERVADAS");
        assert.equal(restored.body.settings.count, 2);
        assert.equal(
          (await observer.call(`subproducts/${target}`)).status,
          200,
        );
        assert.equal((await admin.call(`subproducts/${target}`)).status, 200);
        assert.equal((await admin.call(endpoint)).status, 404);
        assert.equal(
          (await db.generationJob.findUniqueOrThrow({ where: { id: job.id } }))
            .status,
          "CANCELLED",
        );
        assert.equal(
          (await db.usageLedger.findUniqueOrThrow({ where: { jobId: job.id } }))
            .status,
          "RELEASED",
        );
        assert.equal(await db.generationJob.count(), beforeJobs);
        assert.equal(await db.usageLedger.count(), beforeLedgers);
        assert.equal(
          await db.auditEvent.count({
            where: { action: "SUBPRODUCTO_RESTAURADO", resourceId: target },
          }),
          1,
        );
        assert.equal((await user.call(endpoint)).body.total, 24);
        assert.equal(
          (
            await owner.call(`projects/${p.body.id}/members`, "PATCH", {
              allAdministrators: true,
            })
          ).status,
          200,
        );
        assert.equal((await admin.call(endpoint)).status, 200);
        assert.equal(
          (await admin.call(`subproducts/${sub.body[1].id}/restore`, "POST"))
            .status,
          200,
        );
        const other = second.body.items[0].id;
        assert.equal(
          (await user.call(`projects/${p.body.id}`, "DELETE")).status,
          200,
        );
        assert.equal(
          (await owner.call(`subproducts/${other}/restore`, "POST")).status,
          404,
        );
        await owner.call(`projects/${p.body.id}/restore`, "POST");
        assert.equal(
          (await owner.call(`subproducts/${other}/restore`, "POST")).status,
          200,
        );
      },
    );
    await t.test(
      "código de emergencia OWNER: hash, rotación, caducidad, uso único y cierre de sesiones",
      async () => {
        for (const client of [user, admin, observer])
          for (const method of ["GET", "POST", "DELETE"])
            assert.equal(
              (
                await client.call("auth/owner-recovery", method, {
                  currentPassword: password,
                })
              ).status,
              403,
            );
        assert.equal((await anonymous.call("auth/owner-recovery")).status, 401);
        assert.equal(
          (
            await owner.call("auth/owner-recovery", "POST", {
              currentPassword: "Incorrecta-0123456789",
            })
          ).status,
          403,
        );
        const created = await owner.call("users", "POST", {
          name: "OWNER emergencia A",
          email: `emergency-a-${tag}@example.test`,
          password,
          role: "OWNER",
        });
        assert.equal(created.status, 201);
        const a = new Client(),
          otherSession = new Client(),
          email = created.body.email,
          id = created.body.id;
        await a.call("auth/login", "POST", { email, password });
        await otherSession.call("auth/login", "POST", { email, password });
        const first = await a.call("auth/owner-recovery", "POST", {
          currentPassword: password,
        });
        assert.equal(first.status, 200);
        assert.match(first.body.code, /^OWNER-[A-Za-z0-9_-]{43}$/);
        const record = await db.ownerRecovery.findUniqueOrThrow({
          where: { userId: id },
        });
        assert(!JSON.stringify(record).includes(first.body.code));
        assert.equal(record.tokenHash.length, 64);
        const status = await a.call("auth/owner-recovery");
        assert.deepEqual(Object.keys(status.body).sort(), [
          "createdAt",
          "enabled",
          "expiresAt",
        ]);
        assert.equal(status.body.enabled, true);
        assert(
          !JSON.stringify((await owner.call("audit")).body).includes(
            first.body.code,
          ),
        );
        const next = await a.call("auth/owner-recovery", "POST", {
          currentPassword: password,
        });
        assert.equal(next.status, 200);
        assert.notEqual(first.body.code, next.body.code);
        assert.equal(
          (
            await anonymous.call("auth/emergency-recovery", "POST", {
              email,
              code: first.body.code,
              newPassword: "Emergencia-nueva-0123456789",
            })
          ).status,
          400,
        );
        await db.ownerRecovery.update({
          where: { userId: id },
          data: { expiresAt: new Date(0) },
        });
        assert.equal((await a.call("auth/owner-recovery")).body.enabled, false);
        assert.equal(
          (
            await anonymous.call("auth/emergency-recovery", "POST", {
              email,
              code: next.body.code,
              newPassword: "Emergencia-nueva-0123456789",
            })
          ).status,
          400,
        );
        const fresh = await a.call("auth/owner-recovery", "POST", {
          currentPassword: password,
        });
        assert.equal(fresh.status, 200);
        await db.passwordReset.create({
          data: {
            tokenHash: randomUUID(),
            userId: id,
            expiresAt: new Date(Date.now() + 60000),
          },
        });
        const payload = {
          email: email.toUpperCase(),
          code: fresh.body.code,
          newPassword: "Emergencia-nueva-0123456789",
        };
        const results = await Promise.all([
          new Client().call("auth/emergency-recovery", "POST", payload),
          new Client().call("auth/emergency-recovery", "POST", payload),
        ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
        assert.equal((await a.call("projects")).status, 401);
        assert.equal((await otherSession.call("projects")).status, 401);
        assert.equal(
          await db.ownerRecovery.count({ where: { userId: id } }),
          0,
        );
        assert.equal(
          await db.passwordReset.count({ where: { userId: id } }),
          0,
        );
        assert.equal(
          (await anonymous.call("auth/emergency-recovery", "POST", payload))
            .status,
          400,
        );
        assert.equal(
          (
            await a.call("auth/login", "POST", {
              email,
              password: payload.newPassword,
            })
          ).status,
          200,
        );
        assert.equal(
          await db.auditEvent.count({
            where: { actorId: id, action: "OWNER_RECUPERADO_EMERGENCIA" },
          }),
          1,
        );
        const logs = JSON.stringify((await owner.call("audit")).body);
        assert(!logs.includes(fresh.body.code));
        assert(!logs.includes(payload.newPassword));
      },
    );
    await t.test(
      "contraseñas, roles, suspensión y revocación invalidan el código de emergencia",
      async () => {
        const created = await owner.call("users", "POST", {
          name: "OWNER emergencia B",
          email: `emergency-b-${tag}@example.test`,
          password,
          role: "OWNER",
        });
        assert.equal(created.status, 201);
        const account = new Client(),
          email = created.body.email,
          id = created.body.id;
        await account.call("auth/login", "POST", { email, password });
        let code = (
          await account.call("auth/owner-recovery", "POST", {
            currentPassword: password,
          })
        ).body.code;
        assert.equal(
          (
            await account.call("auth/change-password", "POST", {
              currentPassword: password,
              newPassword: "Cambio-emergencia-0123456789",
            })
          ).status,
          200,
        );
        assert.equal(
          await db.ownerRecovery.count({ where: { userId: id } }),
          0,
        );
        assert.equal(
          (
            await anonymous.call("auth/emergency-recovery", "POST", {
              email,
              code,
              newPassword: password,
            })
          ).status,
          400,
        );
        const currentPassword = "Cambio-emergencia-0123456789";
        await account.call("auth/login", "POST", {
          email,
          password: currentPassword,
        });
        code = (
          await account.call("auth/owner-recovery", "POST", { currentPassword })
        ).body.code;
        assert.equal(
          (
            await owner.call("users/" + id, "PATCH", {
              role: "ADMIN",
              status: "APPROVED",
            })
          ).status,
          200,
        );
        assert.equal(
          await db.ownerRecovery.count({ where: { userId: id } }),
          0,
        );
        assert.equal(
          (
            await anonymous.call("auth/emergency-recovery", "POST", {
              email,
              code,
              newPassword: password,
            })
          ).status,
          400,
        );
        await owner.call("users/" + id, "PATCH", {
          role: "OWNER",
          status: "APPROVED",
        });
        await account.call("auth/login", "POST", {
          email,
          password: currentPassword,
        });
        code = (
          await account.call("auth/owner-recovery", "POST", { currentPassword })
        ).body.code;
        await owner.call("users/" + id, "PATCH", {
          role: "OWNER",
          status: "SUSPENDED",
        });
        assert.equal(
          await db.ownerRecovery.count({ where: { userId: id } }),
          0,
        );
        assert.equal(
          (
            await anonymous.call("auth/emergency-recovery", "POST", {
              email,
              code,
              newPassword: password,
            })
          ).status,
          400,
        );
        await owner.call("users/" + id, "PATCH", {
          role: "OWNER",
          status: "APPROVED",
        });
        await account.call("auth/login", "POST", {
          email,
          password: currentPassword,
        });
        await account.call("auth/owner-recovery", "POST", { currentPassword });
        assert.equal(
          (
            await account.call("auth/owner-recovery", "DELETE", {
              currentPassword,
            })
          ).status,
          200,
        );
        assert.equal(
          (await account.call("auth/owner-recovery")).body.enabled,
          false,
        );
        code = (
          await account.call("auth/owner-recovery", "POST", { currentPassword })
        ).body.code;
        const reset = await owner.call(`users/${id}/recovery`, "POST", {
          currentPassword: password,
        });
        assert.equal(reset.status, 201);
        assert.equal(
          (
            await anonymous.call("auth/reset-password", "POST", {
              token: reset.body.token,
              newPassword: password,
            })
          ).status,
          200,
        );
        assert.equal(
          await db.ownerRecovery.count({ where: { userId: id } }),
          0,
        );
        assert.equal(
          (
            await anonymous.call("auth/emergency-recovery", "POST", {
              email,
              code,
              newPassword: currentPassword,
            })
          ).status,
          400,
        );
      },
    );
    await t.test(
      "adjuntos: miniaturas privadas, reemplazo inmutable, concurrencia e historial protegido",
      async () => {
        const sharp = (await import("sharp")).default;
        const image = await sharp({
          create: {
            width: 1280,
            height: 640,
            channels: 3,
            background: "#234567",
          },
        })
          .png()
          .toBuffer();
        const changedImage = await sharp({
          create: {
            width: 640,
            height: 1280,
            channels: 3,
            background: "#abcdef",
          },
        })
          .png()
          .toBuffer();
        const project = await db.project.create({
          data: { name: "Adjuntos reemplazables", ownerId: uid },
        });
        const product = await db.category.create({
          data: { name: "Producto adjuntos", projectId: project.id },
        });
        const sub = await db.subproduct.create({
          data: { name: "Tema adjuntos", categoryId: product.id },
        });
        const upload = async (
          client: Client,
          file: File,
          previous?: string,
          resourceId = product.id,
        ) => {
          const form = new FormData();
          form.set("scope", "category");
          form.set("resourceId", resourceId);
          form.set("purpose", "Referencia visual");
          form.set("file", file);
          const response = await fetch(
            root +
              "/api/attachments" +
              (previous ? `/${previous}/replace` : ""),
            {
              method: "POST",
              headers: { Cookie: client.cookie, Origin: root },
              body: form,
            },
          );
          return { status: response.status, body: await response.json() };
        };
        const png = (bytes: Buffer, name = "referencia.png") =>
          new File([new Uint8Array(bytes)], name, { type: "image/png" });
        const original = await upload(user, png(image));
        assert.equal(original.status, 201);
        const oldId = original.body.id,
          old = await db.attachment.findUniqueOrThrow({ where: { id: oldId } });
        assert.equal(old.size, image.length);
        const thumbnail = await fetch(
          `${root}/api/attachments/${oldId}/thumbnail`,
          { headers: { Cookie: user.cookie } },
        );
        assert.equal(thumbnail.status, 200);
        assert.equal(thumbnail.headers.get("content-type"), "image/webp");
        assert.equal(
          thumbnail.headers.get("cache-control"),
          "private, no-store",
        );
        const meta = await sharp(
          Buffer.from(await thumbnail.arrayBuffer()),
        ).metadata();
        assert.equal(meta.width, 320);
        assert.equal(meta.height, 160);
        assert.equal(
          (await fetch(`${root}/api/attachments/${oldId}/thumbnail`)).status,
          401,
        );
        assert.equal(
          (
            await fetch(`${root}/api/attachments/${oldId}/thumbnail`, {
              headers: { Cookie: observer.cookie },
            })
          ).status,
          404,
        );
        assert.equal(
          (
            await fetch(`${root}/api/attachments/${oldId}/thumbnail`, {
              headers: { Cookie: admin.cookie },
            })
          ).status,
          404,
        );
        await db.projectMember.create({
          data: { projectId: project.id, userId: oid },
        });
        assert.equal(
          (
            await fetch(`${root}/api/attachments/${oldId}/thumbnail`, {
              headers: { Cookie: observer.cookie },
            })
          ).status,
          200,
        );
        assert.equal(
          (await upload(observer, png(changedImage), oldId)).status,
          403,
        );
        const initialCount = await db.storedAsset.count();
        const concurrent = await Promise.all([
          upload(user, png(changedImage, "nueva.png"), oldId),
          upload(owner, png(changedImage, "otra.png"), oldId),
        ]);
        assert.deepEqual(concurrent.map((r) => r.status).sort(), [201, 409]);
        assert.equal(
          await db.storedAsset.count(),
          initialCount + 1,
          "el intento rechazado no deja un archivo huérfano",
        );
        const newId = concurrent.find((r) => r.status === 201)!.body.id;
        const active = await user.call(
          `attachments?scope=category&id=${product.id}`,
        );
        assert.deepEqual(
          active.body.map((a: any) => a.id),
          [newId],
        );
        assert.equal(active.body[0].replacesId, oldId);
        assert(!JSON.stringify(active.body).includes(old.path));
        const history = await user.call(
          `attachments?scope=category&id=${product.id}&includeArchived=true`,
        );
        assert.equal(history.body.length, 2);
        assert(history.body.find((a: any) => a.id === oldId).archivedAt);
        const { load, store } = await import("../lib/storage");
        assert.deepEqual(await load(old.path), image);
        const { previewSubproduct } = await import("../lib/generation");
        assert.deepEqual(
          (await previewSubproduct(sub.id)).attachments.map((a) => a.id),
          [newId],
        );
        const preset = await user.call("presets", "POST", {
          name: "CONFIGURACION ADJUNTOS",
          prompt: "",
          settings: {},
          visibility: "PERSONAL",
          sourceCategoryId: product.id,
          includeAttachments: true,
        });
        assert.equal(preset.status, 201);
        const copies = (
          await user.call(`attachments?scope=preset&id=${preset.body.id}`)
        ).body;
        assert.equal(copies.length, 1);
        assert.equal(copies[0].name, active.body[0].name);
        const saved = await db.attachment.findUniqueOrThrow({
          where: { id: copies[0].id },
        });
        assert.notEqual(saved.path, old.path);
        assert.deepEqual(await load(saved.path), changedImage);
        const versionPath = await store(image);
        const job = await db.generationJob.create({
          data: {
            actorId: uid,
            projectId: project.id,
            subproductId: sub.id,
            idempotencyKey: `attachment-version-${tag}`,
            status: "SUCCEEDED",
            reservedMicros: 0n,
            snapshot: { attachmentIds: [oldId] },
          },
        });
        const variation = await db.variation.create({
          data: {
            subproductId: sub.id,
            jobId: job.id,
            path: versionPath,
            model: "synthetic-only",
            expiresAt: new Date(Date.now() + 3600000),
          },
        });
        await db.imageVersion.create({
          data: {
            variationId: variation.id,
            number: 1,
            path: versionPath,
            actorId: uid,
            document: { layers: [{ type: "logo", attachmentId: oldId }] },
          },
        });
        const historicLogo = await fetch(
          `${root}/api/variations/${variation.id}/logos/${oldId}`,
          { headers: { Cookie: user.cookie } },
        );
        assert.equal(historicLogo.status, 200);
        assert.deepEqual(Buffer.from(await historicLogo.arrayBuffer()), image);
        assert.equal(
          (await user.call(`attachments/${oldId}`, "DELETE")).status,
          409,
        );
        assert.deepEqual(await load(old.path), image);
        const pending = await db.generationJob.create({
          data: {
            actorId: uid,
            projectId: project.id,
            subproductId: sub.id,
            idempotencyKey: `attachment-pending-${tag}`,
            reservedMicros: 0n,
            snapshot: { attachmentIds: [newId] },
          },
        });
        const newer = await upload(user, png(image, "tercera.png"), newId);
        assert.equal(newer.status, 201);
        assert.equal(
          (await user.call(`attachments/${newId}`, "DELETE")).status,
          409,
        );
        const existingSnapshot = await db.generationJob.findUniqueOrThrow({
          where: { id: pending.id },
        });
        assert.deepEqual((existingSnapshot.snapshot as any).attachmentIds, [
          newId,
        ]);
        await db.generationJob.update({
          where: { id: pending.id },
          data: { status: "CANCELLED" },
        });
        const replaced = await db.attachment.findUniqueOrThrow({
          where: { id: newId },
        });
        assert.equal(
          (await user.call(`attachments/${newId}`, "DELETE")).status,
          200,
        );
        await assert.rejects(load(replaced.path));
        const text = await upload(
          user,
          new File(["Texto para instrucciones"], "documento.txt"),
        );
        assert.equal(text.status, 201);
        assert.equal(
          (
            await fetch(`${root}/api/attachments/${text.body.id}/thumbnail`, {
              headers: { Cookie: user.cookie },
            })
          ).status,
          415,
        );
        const beforeInvalid = await db.storedAsset.count();
        assert.equal(
          (
            await upload(
              user,
              new File(["ejecutable"], "falso.png"),
              text.body.id,
            )
          ).status,
          400,
        );
        assert.equal(await db.storedAsset.count(), beforeInvalid);
        assert.equal(
          (
            await db.attachment.findUniqueOrThrow({
              where: { id: text.body.id },
            })
          ).archivedAt,
          null,
        );
        assert.equal(
          (await upload(user, png(image), text.body.id, cid)).status,
          404,
        );
        assert.equal(await db.storedAsset.count(), beforeInvalid);
        assert.equal(
          await db.auditEvent.count({
            where: {
              action: "ADJUNTO_REEMPLAZADO",
              detail: { path: ["replacesId"], equals: oldId },
            },
          }),
          1,
        );
      },
    );
    await t.test(
      "auditoría visual: versiones, privacidad, conservación independiente, políticas, cuotas y limpieza",
      async () => {
        const { cleanupAuditThumbnails, requireAuditSpace } =
          await import("../lib/visual-audit");
        const policyPath = "visual-audit/policy";
        const created = await db.auditThumbnail.findMany({
          where: { variationId: editableId },
          orderBy: { versionNumber: "asc" },
        });
        assert(
          created.length >= 4,
          "generación, edición y restauración capturan nuevas versiones",
        );
        assert.equal(
          created.length,
          await db.imageVersion.count({ where: { variationId: editableId } }),
        );
        const original = created[0];
        assert(original.size > 0 && original.size <= 65536);
        assert(original.width <= 384 && original.height <= 384);
        const sharp = (await import("sharp")).default;
        assert.equal(
          (await sharp(Buffer.from(original.data!)).metadata()).format,
          "webp",
        );
        for (const client of [user, admin, observer]) {
          assert.equal((await client.call("visual-audit")).status, 403);
          assert.equal((await client.call(policyPath)).status, 403);
          assert.equal((await client.call(policyPath, "PUT", {})).status, 403);
          assert.equal(
            (await client.call("visual-audit/cleanup", "POST")).status,
            403,
          );
          assert.equal(
            (await client.call(`visual-audit/${original.id}/image`)).status,
            403,
          );
          assert.equal(
            (
              await client.call(`visual-audit/${original.id}`, "DELETE", {
                currentPassword: password,
              })
            ).status,
            403,
          );
          assert.deepEqual((await client.call("privacy/visual-audit")).body, {
            enabled: true,
            retentionDays: 30,
          });
        }
        assert.equal((await anonymous.call("visual-audit")).status, 401);
        const page1 = await owner.call("visual-audit?page=1"),
          page2 = await owner.call("visual-audit?page=2");
        assert.equal(page1.status, 200);
        assert(page1.body.total >= created.length);
        assert(page1.body.rows.length <= 20);
        assert(!JSON.stringify(page1.body).includes('"data"'));
        assert(
          !page1.body.rows.some((a: any) =>
            page2.body.rows.some((b: any) => a.id === b.id),
          ),
        );
        const img = await fetch(
          `${root}/api/visual-audit/${original.id}/image`,
          { headers: { Cookie: owner.cookie } },
        );
        assert.equal(img.status, 200);
        assert.equal(img.headers.get("content-type"), "image/webp");
        assert.equal(img.headers.get("cache-control"), "private, no-store");
        const state = (await owner.call(policyPath)).body;
        const payload = {
          enabled: true,
          retentionDays: 90,
          limitMb: 32,
          expectedRevision: state.revision,
          applyToExisting: false,
          currentPassword: password,
        };
        assert.equal(
          (
            await owner.call(policyPath, "PUT", {
              ...payload,
              currentPassword: "Incorrecta-0123456789",
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await owner.call(policyPath, "PUT", {
              ...payload,
              retentionDays: 0,
            })
          ).status,
          400,
        );
        const race = await Promise.all([
          owner.call(policyPath, "PUT", payload),
          owner.call(policyPath, "PUT", payload),
        ]);
        assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
        assert.equal(
          (
            await db.auditThumbnail.findUniqueOrThrow({
              where: { id: original.id },
            })
          ).expiresAt.getTime(),
          original.expiresAt.getTime(),
        );
        const duplicate = await user.call(
          `variations/${editableId}/duplicate`,
          "POST",
        );
        assert.equal(duplicate.status, 201);
        const copied = await db.auditThumbnail.findFirstOrThrow({
          where: { variationId: duplicate.body.id },
        });
        assert.equal(
          copied.expiresAt.getTime() - copied.createdAt.getTime(),
          90 * 86400000,
        );
        const variation = await db.variation.findUniqueOrThrow({
          where: { id: duplicate.body.id },
        });
        const { cleanupExpired } = await import("../scripts/worker");
        await db.variation.update({
          where: { id: variation.id },
          data: { expiresAt: new Date(0), permanent: false },
        });
        await cleanupExpired();
        assert.equal(
          (await user.call(`variations/${variation.id}/design`)).status,
          410,
        );
        assert.equal(
          (
            await fetch(`${root}/api/visual-audit/${copied.id}/image`, {
              headers: { Cookie: owner.cookie },
            })
          ).status,
          200,
        );
        await db.project.update({
          where: { id: copied.projectId },
          data: { deletedAt: new Date() },
        });
        assert.equal(
          (
            await fetch(`${root}/api/visual-audit/${copied.id}/image`, {
              headers: { Cookie: owner.cookie },
            })
          ).status,
          200,
        );
        await db.project.update({
          where: { id: copied.projectId },
          data: { deletedAt: null },
        });
        const savePolicy = async (values: {
          enabled?: boolean;
          retentionDays?: number;
          limitMb?: number;
          applyToExisting?: boolean;
        }) => {
          const previous = (await owner.call(policyPath)).body;
          const result = await owner.call(policyPath, "PUT", {
            enabled: previous.enabled,
            retentionDays: previous.retentionDays,
            limitMb: previous.limitMb,
            expectedRevision: previous.revision,
            applyToExisting: false,
            currentPassword: password,
            ...values,
          });
          assert.equal(result.status, 200);
          return result;
        };
        await savePolicy({ enabled: false });
        const disabled = await user.call(
          `variations/${editableId}/duplicate`,
          "POST",
        );
        assert.equal(disabled.status, 201);
        assert.equal(
          await db.auditThumbnail.count({
            where: { variationId: disabled.body.id },
          }),
          0,
        );
        assert.deepEqual((await observer.call("privacy/visual-audit")).body, {
          enabled: false,
          retentionDays: 90,
        });
        await savePolicy({ enabled: true, retentionDays: 1 });
        assert.equal(
          (
            await db.auditThumbnail.findUniqueOrThrow({
              where: { id: copied.id },
            })
          ).expiresAt.getTime(),
          copied.expiresAt.getTime(),
        );
        await db.auditThumbnail.update({
          where: { id: copied.id },
          data: { createdAt: new Date(Date.now() - 2 * 86400000) },
        });
        await savePolicy({ applyToExisting: true });
        assert.equal(
          (
            await fetch(`${root}/api/visual-audit/${copied.id}/image`, {
              headers: { Cookie: owner.cookie },
            })
          ).status,
          410,
        );
        const clean = await owner.call("visual-audit/cleanup", "POST");
        assert.equal(clean.status, 200);
        assert(clean.body.removed >= 1);
        const gone = await db.auditThumbnail.findUniqueOrThrow({
          where: { id: copied.id },
        });
        assert.equal(gone.data, null);
        assert.equal(gone.size, 0);
        assert.equal(gone.status, "EXPIRED");
        assert(gone.removedAt);
        await savePolicy({ retentionDays: 90, applyToExisting: true });
        assert.equal(
          (
            await db.auditThumbnail.findUniqueOrThrow({
              where: { id: copied.id },
            })
          ).status,
          "EXPIRED",
        );
        assert.equal(
          (
            await fetch(`${root}/api/visual-audit/${copied.id}/image`, {
              headers: { Cookie: owner.cookie },
            })
          ).status,
          410,
        );
        assert.equal(
          (
            await owner.call(`visual-audit/${original.id}`, "DELETE", {
              currentPassword: "Incorrecta-0123456789",
            })
          ).status,
          403,
        );
        const removeRace = await Promise.all([
          owner.call(`visual-audit/${original.id}`, "DELETE", {
            currentPassword: password,
          }),
          owner.call(`visual-audit/${original.id}`, "DELETE", {
            currentPassword: password,
          }),
        ]);
        assert.deepEqual(removeRace.map((r) => r.status).sort(), [200, 409]);
        assert.equal(
          (
            await db.auditThumbnail.findUniqueOrThrow({
              where: { id: original.id },
            })
          ).status,
          "REMOVED",
        );
        assert.equal(
          (await user.call(`variations/${editableId}/design`)).status,
          200,
        );
        assert.equal(
          await db.auditEvent.count({
            where: {
              action: "MINIATURA_AUDITORIA_ELIMINADA",
              resourceId: original.id,
            },
          }),
          1,
        );
        await savePolicy({ limitMb: 1 });
        const fillerIds: string[] = [];
        try {
          const used =
            (await db.auditThumbnail.aggregate({ _sum: { size: true } }))._sum
              .size ?? 0;
          const count = Math.ceil((1048576 - used) / 65536);
          for (let n = 0; n < count; n++) {
            const row = await db.auditThumbnail.create({
              data: {
                versionId: `quota-${tag}-${n}`,
                variationId: editableId,
                versionNumber: 1000 + n,
                actorId: uid,
                actorName: "Cuota sintética",
                projectId: pid,
                projectName: `Cuota sintética ${tag}`,
                productName: "",
                subproductName: "",
                model: "synthetic-only",
                data: new Uint8Array(Buffer.alloc(65536)),
                size: 65536,
                width: 1,
                height: 1,
                expiresAt: new Date(Date.now() + 86400000),
              },
            });
            fillerIds.push(row.id);
          }
          await assert.rejects(requireAuditSpace(), /No hay espacio/);
          const result = await user.call(
            `variations/${editableId}/duplicate`,
            "POST",
          );
          assert.equal(
            result.status,
            201,
            "un fallo de cuota no pierde el afiche",
          );
          const gap = await db.auditThumbnail.findFirstOrThrow({
            where: { variationId: result.body.id },
          });
          assert.equal(gap.status, "NO_SPACE");
          assert.equal(gap.data, null);
          assert.equal(gap.size, 0);
          assert.equal(
            (await user.call(`variations/${result.body.id}/design`)).status,
            200,
          );
          assert((await owner.call(policyPath)).body.missing >= 1);
          assert.equal(
            await db.auditEvent.count({
              where: {
                action: "MINIATURA_AUDITORIA_SIN_ESPACIO",
                resourceId: result.body.id,
              },
            }),
            1,
          );
          const { storageStatus } = await import("../lib/storage");
          const bytes =
            (await db.storedAsset.aggregate({ _sum: { size: true } }))._sum
              .size ?? 0;
          const auditBytes =
            (await db.auditThumbnail.aggregate({ _sum: { size: true } }))._sum
              .size ?? 0;
          assert.equal((await storageStatus()).usedBytes, bytes + auditBytes);
        } finally {
          await db.auditThumbnail.deleteMany({
            where: { id: { in: fillerIds } },
          });
          await savePolicy({ limitMb: 32, retentionDays: 30 });
        }
        assert.equal(await cleanupAuditThumbnails(), 0);
        const auditText = JSON.stringify(await db.auditEvent.findMany());
        assert(!auditText.includes(password));
      },
    );
    await t.test(
      "historial: resumen humano, contexto exacto, nombres conservados, registros antiguos y permisos",
      async () => {
        const { recordActivity } = await import("../lib/activity");
        const project = (
          await user.call("projects", "POST", {
            name: `Historial Cursos ${tag}`,
          })
        ).body;
        const product = (
          await user.call(`projects/${project.id}/categories`, "POST", {
            name: "HIST PERU",
          })
        ).body;
        const subs = (
          await user.call(`categories/${product.id}/subproducts`, "POST", {
            names: ["HIST MONITOREO", "HIST AGUA"],
          })
        ).body;
        const find = async (client: Client, q: string, page = 1) =>
          client.call(`audit/history?q=${encodeURIComponent(q)}&page=${page}`);
        const initial = await find(user, `Historial Cursos ${tag}`);
        assert.equal(initial.status, 200);
        const created = initial.body.rows.find(
          (r: any) => r.action === "Creó subproductos",
        );
        assert(created);
        assert.equal(created.contextSource, "recorded");
        assert.equal(created.actorName, "Usuario prueba");
        assert.deepEqual(
          created.contexts.map((c: any) => c.subproductName).sort(),
          ["HIST AGUA", "HIST MONITOREO"],
        );
        assert(
          created.contexts.every(
            (c: any) =>
              c.projectName === `Historial Cursos ${tag}` &&
              c.productName === "HIST PERU",
          ),
        );
        assert(created.summary.includes("2 subproductos"));
        const immutable = await db.auditEvent.findUniqueOrThrow({
          where: { id: created.id },
        });
        assert.equal(
          (
            await user.call(`projects/${project.id}`, "PATCH", {
              name: `Historial Nuevo ${tag}`,
              prompt: "Texto privado que no se registra en actividad",
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await user.call(`categories/${product.id}`, "PATCH", {
              name: "HIST PERU NUEVO",
              prompt: "Prompt privado de producto",
              settings: {},
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await user.call(`subproducts/${subs[0].id}`, "PATCH", {
              name: "HIST MONITOREO NUEVO",
              prompt: "Prompt privado de subproducto",
              settings: {},
            })
          ).status,
          200,
        );
        const unchanged = (
          await find(user, `Historial Cursos ${tag}`)
        ).body.rows.find((r: any) => r.id === created.id);
        assert(unchanged);
        assert(
          unchanged.contexts.some(
            (c: any) => c.subproductName === "HIST MONITOREO",
          ),
        );
        assert.deepEqual(
          await db.auditEvent.findUniqueOrThrow({ where: { id: created.id } }),
          immutable,
          "leer no reescribe auditoría",
        );
        const jobs = await Promise.all(
          subs.map((s: any) =>
            db.generationJob.create({
              data: {
                actorId: uid,
                projectId: project.id,
                subproductId: s.id,
                idempotencyKey: `history-${tag}-${s.id}`,
                reservedMicros: 0n,
                snapshot: { prompt: "NO DEBE SALIR EN HISTORIAL" },
              },
            }),
          ),
        );
        const requested = await recordActivity(db, {
          data: {
            actorId: uid,
            action: "GENERACION_MASIVA_AUTORIZADA",
            resourceId: product.id,
            detail: { count: jobs.length, jobIds: jobs.map((j) => j.id) },
          },
        });
        const exact = (
          await find(user, `Historial Nuevo ${tag}`)
        ).body.rows.find((r: any) => r.id === requested.id);
        assert(exact.summary.includes("Solicitó"));
        assert(!exact.summary.includes("Generó"));
        assert.equal(exact.contexts.length, 2);
        assert(
          exact.contexts.some(
            (c: any) => c.subproductName === "HIST MONITOREO NUEVO",
          ),
        );
        const secret = "synthetic-history-secret-must-not-appear";
        const legacy = await db.auditEvent.create({
          data: {
            actorId: uid,
            action: "SUBPRODUCTOS_CREADOS",
            resourceId: product.id,
            createdAt: new Date("2020-01-01T12:00:00Z"),
            detail: {
              apiKey: secret,
              password,
              prompt: "NO DEBE SALIR EN HISTORIAL",
              token: secret,
            },
          },
        });
        await db.auditEvent.createMany({
          data: Array.from({ length: 230 }, (_, n) => ({
            actorId: uid,
            action: "INICIO_SESION",
            createdAt: new Date(1600000000000 + n * 1000),
          })),
        });
        const old = (await find(user, `Historial Nuevo ${tag}`)).body.rows.find(
          (r: any) => r.id === legacy.id,
        );
        assert(old);
        assert.equal(old.contextSource, "current");
        assert(old.note.includes("no detalla"));
        assert(old.contexts.every((c: any) => !c.subproductName));
        const serialized = JSON.stringify(
          (await find(owner, "Historial")).body,
        );
        assert(!serialized.includes(secret));
        assert(!serialized.includes(password));
        assert(!serialized.includes("NO DEBE SALIR EN HISTORIAL"));
        assert(!serialized.includes("Prompt privado"));
        const privateProject = await db.project.create({
          data: {
            name: `Historia privada ${tag}`,
            ownerId: (
              await db.user.findFirstOrThrow({
                where: { role: "OWNER", name: "Owner prueba" },
              })
            ).id,
          },
        });
        const privateOwnerEvent = await db.auditEvent.create({
          data: {
            actorId: privateProject.ownerId,
            action: "PROYECTO_CREADO",
            resourceId: privateProject.id,
          },
        });
        assert(
          (await find(owner, privateProject.name)).body.rows.some(
            (r: any) => r.id === privateOwnerEvent.id,
          ),
        );
        assert.equal((await find(user, privateProject.name)).body.total, 0);
        assert.equal((await find(admin, privateProject.name)).body.total, 0);
        const revoked = await db.auditEvent.create({
          data: {
            actorId: uid,
            action: "PROYECTO_ACTUALIZADO",
            resourceId: privateProject.id,
          },
        });
        const own = await user.call("audit/history");
        const revokedRow = own.body.rows.find((r: any) => r.id === revoked.id);
        assert(revokedRow);
        assert.deepEqual(revokedRow.contexts, []);
        assert.equal(
          (await find(user, privateProject.name)).body.total,
          0,
          "búsqueda no revela nombres privados actuales",
        );
        assert.equal((await observer.call("audit/history")).status, 403);
        assert.equal((await anonymous.call("audit/history")).status, 401);
        const page1 = (await find(user, "Usuario prueba")).body,
          page2 = (await find(user, "Usuario prueba", 2)).body;
        assert(page1.total > 230);
        assert.equal(page1.rows.length, 25);
        assert.equal(page2.rows.length, 25);
        assert(
          !page1.rows.some((a: any) =>
            page2.rows.some((b: any) => a.id === b.id),
          ),
        );
        assert(page1.rows.every((r: any) => r.actorName === "Usuario prueba"));
        assert.equal((await user.call("audit/history?page=0")).status, 400);
        assert.equal((await find(user, "x".repeat(201))).status, 400);
        assert.equal((await find(user, "\\")).status, 200);
        assert.equal((await find(user, "' OR TRUE --")).body.total, 0);
        const literal = (
          await user.call("projects", "POST", {
            name: `Historial 100% literal ${tag}`,
          })
        ).body;
        const percent = await find(user, "100% literal");
        assert.equal(percent.status, 200);
        assert.equal(percent.body.total, 1);
        assert(percent.body.rows[0].summary.includes(literal.name));
        const updated = (await find(user, "HIST MONITOREO NUEVO")).body;
        assert(
          updated.rows.some((r: any) => r.action === "Editó el subproducto"),
        );
        await db.generationJob.updateMany({
          where: { id: { in: jobs.map((j) => j.id) } },
          data: { status: "CANCELLED" },
        });
      },
    );
    await t.test(
      "mantenimiento: cola persistente, reintentos, permisos y programación autenticada sin IA",
      async () => {
        const { store, load } = await import("../lib/storage");
        const original = await store(
          Buffer.from("archivo temporal de mantenimiento"),
        );
        const background = await store(Buffer.from("fondo de mantenimiento"));
        const permanentPath = await store(
          Buffer.from("archivo permanente protegido"),
        );
        const make = async (path: string, permanent = false) => {
          const job = await db.generationJob.create({
            data: {
              actorId: uid,
              projectId: pid,
              subproductId: sid,
              idempotencyKey: randomUUID(),
              status: "COMPLETED",
              snapshot: {},
              reservedMicros: 0n,
            },
          });
          return db.variation.create({
            data: {
              jobId: job.id,
              subproductId: sid,
              path,
              model: "synthetic-maintenance",
              permanent,
              expiresAt: new Date(0),
            },
          });
        };
        const temporal = await make(original),
          permanent = await make(permanentPath, true);
        await db.imageVersion.create({
          data: {
            variationId: temporal.id,
            number: 1,
            path: original,
            backgroundPath: background,
            actorId: uid,
          },
        });
        for (const client of [user, admin, observer]) {
          assert.equal((await client.call("system/maintenance")).status, 403);
          assert.equal(
            (await client.call("system/cleanup", "POST")).status,
            403,
          );
        }
        assert.equal((await anonymous.call("system/maintenance")).status, 401);
        const before = await owner.call("system/maintenance");
        assert.equal(before.status, 200);
        assert(before.body.pending.variations >= 1);
        const cron = (token?: string) =>
          fetch(root + "/api/cron/maintenance", {
            headers: token ? { Authorization: "Bearer " + token } : {},
          });
        assert.equal((await cron()).status, 401);
        assert.equal((await cron("incorrecto")).status, 401);
        // A real storage delete fails once; its private error never reaches the response or audit.
        const assetId = original.slice(3);
        await db.$executeRawUnsafe(
          `CREATE OR REPLACE FUNCTION test_maintenance_delete_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.id = '${assetId}' THEN RAISE EXCEPTION 'fallo-sintetico-no-publicar'; END IF; RETURN OLD; END $$`,
        );
        await db.$executeRawUnsafe(
          'CREATE TRIGGER test_maintenance_delete_failure BEFORE DELETE ON "StoredAsset" FOR EACH ROW EXECUTE FUNCTION test_maintenance_delete_failure()',
        );
        try {
          const partial = await owner.call("system/cleanup", "POST");
          assert.equal(partial.status, 200);
          assert.equal(partial.body.status, "PARTIAL");
          assert(partial.body.expired >= 1);
          assert.equal(partial.body.failedFiles, 1);
          assert(!JSON.stringify(partial.body).includes("fallo-sintetico"));
          const queue = await db.assetDeletion.findUniqueOrThrow({
            where: { path: original },
          });
          assert.equal(queue.attempts, 1);
          assert(queue.nextAttemptAt > new Date());
          const expired = await db.variation.findUniqueOrThrow({
            where: { id: temporal.id },
          });
          assert(expired.expired && expired.filesQueuedAt);
          assert.equal(
            (
              await db.variation.findUniqueOrThrow({
                where: { id: permanent.id },
              })
            ).expired,
            false,
          );
          assert.deepEqual(
            await load(permanentPath),
            Buffer.from("archivo permanente protegido"),
          );
          await assert.rejects(load(background));
          assert.equal(
            await db.imageVersion.count({
              where: { variationId: temporal.id },
            }),
            1,
          );
          const status = (await owner.call("system/maintenance")).body;
          assert(status.pending.queuedFiles >= 1);
          assert.equal(status.runs[0].status, "PARTIAL");
          assert(!JSON.stringify(status).includes(original));
          assert(!JSON.stringify(status).includes("fallo-sintetico"));
        } finally {
          await db.$executeRawUnsafe(
            'DROP TRIGGER test_maintenance_delete_failure ON "StoredAsset"',
          );
          await db.$executeRawUnsafe(
            "DROP FUNCTION test_maintenance_delete_failure()",
          );
        }
        await db.assetDeletion.update({
          where: { path: original },
          data: { nextAttemptAt: new Date(0) },
        });
        const recovered = await owner.call("system/cleanup", "POST");
        assert.equal(recovered.status, 200);
        assert.equal(recovered.body.failedFiles, 0);
        assert.equal(
          await db.assetDeletion.count({ where: { path: original } }),
          0,
        );
        await assert.rejects(load(original));
        assert.equal(
          (
            await db.variation.findUniqueOrThrow({
              where: { id: permanent.id },
            })
          ).expired,
          false,
        );
        // Existing leases block concurrent runs and stale leases are recoverable.
        const active = await db.maintenanceRun.create({
          data: { source: "MANUAL" },
        });
        assert.equal((await owner.call("system/cleanup", "POST")).status, 409);
        await db.maintenanceRun.update({
          where: { id: active.id },
          data: { startedAt: new Date(Date.now() - 20 * 60000) },
        });
        const job = await db.generationJob.create({
          data: {
            actorId: uid,
            projectId: pid,
            idempotencyKey: randomUUID(),
            status: "RUNNING",
            startedAt: new Date(0),
            snapshot: {},
            reservedMicros: 1n,
          },
        });
        await db.usageLedger.create({
          data: {
            jobId: job.id,
            actorId: uid,
            projectId: pid,
            model: "synthetic",
            reservedMicros: 1n,
          },
        });
        assert(process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 32);
        const automatic = await cron(process.env.CRON_SECRET);
        assert.equal(automatic.status, 200);
        assert.equal((await automatic.json()).interrupted, 1);
        assert.equal(
          (
            await db.maintenanceRun.findUniqueOrThrow({
              where: { id: active.id },
            })
          ).status,
          "INTERRUPTED",
        );
        assert.equal(
          (await db.generationJob.findUniqueOrThrow({ where: { id: job.id } }))
            .status,
          "UNCERTAIN",
        );
        assert.equal(
          (await db.usageLedger.findUniqueOrThrow({ where: { jobId: job.id } }))
            .status,
          "UNCERTAIN",
        );
        const status = (await owner.call("system/maintenance")).body;
        assert(status.lastAutomaticAt);
        assert.equal(status.runs[0].source, "CRON");
        const audit = await db.auditEvent.findMany({
          where: { action: "MANTENIMIENTO_COMPLETADO" },
        });
        assert(audit.length >= 3);
        assert(!JSON.stringify(audit).includes("fallo-sintetico"));
        assert(!JSON.stringify(audit).includes(original));
        assert(!JSON.stringify(audit).includes(process.env.CRON_SECRET));
      },
    );
    await t.test(
      "cola completa y cancelación múltiple: más de 200 trabajos, permisos, reservas y atomicidad",
      async () => {
        const project = (
          await user.call("projects", "POST", { name: "Cola masiva " + tag })
        ).body;
        const category = (
          await user.call(`projects/${project.id}/categories`, "POST", {
            name: "Producto masivo",
          })
        ).body;
        const sub = (
          await user.call(`categories/${category.id}/subproducts`, "POST", {
            names: ["Subproducto masivo"],
          })
        ).body[0];
        const jobs = await db.$transaction(
          async (tx) => {
            const result = [];
            for (let i = 0; i < 230; i++) {
              const job = await tx.generationJob.create({
                data: {
                  actorId: uid,
                  projectId: project.id,
                  subproductId: sub.id,
                  idempotencyKey: randomUUID(),
                  snapshot: { prompt: "NO ENVIAR PROMPT AL NAVEGADOR" },
                  reservedMicros: 1000n,
                  createdAt: new Date(Date.now() - 86400000 + i),
                },
              });
              await tx.usageLedger.create({
                data: {
                  jobId: job.id,
                  actorId: uid,
                  projectId: project.id,
                  model: "synthetic",
                  reservedMicros: 1000n,
                },
              });
              result.push(job);
            }
            return result;
          },
          { timeout: 20000 },
        );
        const list = await user.call("jobs/list?status=PENDING&order=oldest");
        assert.equal(list.status, 200);
        assert.equal(list.body.rows.length, 25);
        assert(list.body.total >= 230);
        assert(list.body.counts.PENDING >= 230);
        const pages: any[] = [];
        for (let page = 1; page <= Math.ceil(list.body.total / 25); page++)
          pages.push(
            ...(
              await user.call(
                `jobs/list?status=PENDING&order=oldest&page=${page}`,
              )
            ).body.rows,
          );
        assert.equal(new Set(pages.map((j) => j.id)).size, pages.length);
        assert(jobs.every((j) => pages.some((row) => row.id === j.id)));
        const sample = pages.find((j: any) => j.id === jobs[0].id);
        assert.equal(sample.contexts[0].projectName, project.name);
        assert.equal(sample.contexts[0].productName, category.name);
        assert.equal(sample.contexts[0].subproductName, sub.name);
        assert(sample.canManage);
        assert(!("snapshot" in sample));
        assert(!JSON.stringify(list.body).includes("NO ENVIAR PROMPT"));
        assert(
          !(await admin.call("jobs/list?status=PENDING")).body.rows.some(
            (j: any) => j.id === jobs[0].id,
          ),
        );
        for (const client of [admin, observer])
          assert.equal(
            (
              await client.call("jobs/cancel-many", "POST", {
                ids: [jobs[0].id],
              })
            ).status,
            client === observer ? 403 : 404,
          );
        assert.equal((await observer.call("jobs/list")).status, 403);
        assert.equal((await anonymous.call("jobs/list")).status, 401);
        for (const suffix of ["page=0", "status=INVALID", "order=INVALID"])
          assert.equal((await user.call("jobs/list?" + suffix)).status, 400);
        assert.equal(
          (
            await user.call("jobs/cancel-many", "POST", {
              ids: jobs.slice(0, 201).map((j) => j.id),
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await user.call("jobs/cancel-many", "POST", {
              ids: [jobs[0].id, "no-existe"],
            })
          ).status,
          404,
        );
        await db.generationJob.update({
          where: { id: jobs[1].id },
          data: { status: "RUNNING", startedAt: new Date() },
        });
        assert.equal(
          (
            await user.call("jobs/cancel-many", "POST", {
              ids: [jobs[0].id, jobs[1].id],
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await db.generationJob.findUniqueOrThrow({
              where: { id: jobs[0].id },
            })
          ).status,
          "PENDING",
        );
        await db.generationJob.update({
          where: { id: jobs[1].id },
          data: { status: "PENDING", startedAt: null },
        });
        await db.usageLedger.update({
          where: { jobId: jobs[1].id },
          data: { status: "UNCERTAIN" },
        });
        assert.equal(
          (
            await user.call("jobs/cancel-many", "POST", {
              ids: [jobs[0].id, jobs[1].id],
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await db.usageLedger.findUniqueOrThrow({
              where: { jobId: jobs[0].id },
            })
          ).status,
          "RESERVED",
        );
        await db.usageLedger.update({
          where: { jobId: jobs[1].id },
          data: { status: "RESERVED" },
        });
        const cancelled = await user.call("jobs/cancel-many", "POST", {
          ids: jobs.slice(0, 200).map((j) => j.id),
        });
        assert.equal(cancelled.status, 200);
        assert.equal(cancelled.body.cancelled, 200);
        assert.equal(cancelled.body.releasedMicros, "200000");
        assert.equal(
          await db.generationJob.count({
            where: {
              id: { in: jobs.slice(0, 200).map((j) => j.id) },
              status: "CANCELLED",
            },
          }),
          200,
        );
        assert.equal(
          await db.usageLedger.count({
            where: {
              jobId: { in: jobs.slice(0, 200).map((j) => j.id) },
              status: "RELEASED",
            },
          }),
          200,
        );
        assert.equal(
          (await user.call("jobs/cancel-many", "POST", { ids: [jobs[0].id] }))
            .status,
          409,
        );
        const audit = await db.auditEvent.findFirstOrThrow({
          where: { actorId: uid, action: "TRABAJOS_CANCELADOS" },
          orderBy: { createdAt: "desc" },
        });
        assert.equal((audit.detail as any).count, 200);
        assert.equal(
          (audit.detail as any)._activity.contexts[0].projectName,
          project.name,
        );
        await db.projectMember.deleteMany({
          where: { projectId: project.id, userId: aid },
        });
        const remaining = await owner.call("jobs/cancel-many", "POST", {
          ids: jobs.slice(200).map((j) => j.id),
        });
        assert.equal(remaining.status, 200);
        assert.equal(remaining.body.cancelled, 30);
        const hidden = await db.generationJob.create({
          data: {
            actorId: uid,
            projectId: "private-unavailable",
            idempotencyKey: randomUUID(),
            snapshot: { prompt: "instrucción privada" },
            status: "UNCERTAIN",
            reservedMicros: 0n,
          },
        });
        const invisible = (
          await user.call("jobs/list?status=UNCERTAIN")
        ).body.rows.find((j: any) => j.id === hidden.id);
        assert(invisible);
        assert.equal(invisible.canManage, false);
        assert.deepEqual(invisible.contexts, []);
      },
    );
    await t.test(
      "lotes de 200: ejecución simulada completa y cancelación concurrente sin repetir cargos inciertos",
      async () => {
        const { prepareBackground, backgroundTick } =
          await import("../lib/background");
        const { adapter, compatibleModels } = await import("../lib/providers");
        const { encryptKey } = await import("../lib/crypto");
        const project = (
          await user.call("projects", "POST", { name: "Lote 200 " + tag })
        ).body;
        const category = (
          await user.call(`projects/${project.id}/categories`, "POST", {
            name: "Producto de carga",
          })
        ).body;
        const sub = (
          await user.call(`categories/${category.id}/subproducts`, "POST", {
            names: ["Tema de carga"],
          })
        ).body[0];
        const prior = await db.providerConfiguration.findUniqueOrThrow({
          where: { id: "global" },
        });
        await db.providerConfiguration.update({
          where: { id: "global" },
          data: {
            encryptedKey: encryptKey(config.apiKey),
            provider: "openai",
            status: "VERIFIED",
            verifiedAt: new Date(),
            verifiedRevision: prior.revision,
            imageModel: "gpt-image-1",
            creativeModel: "gpt-4.1-mini",
            quality: "low",
            resolution: "1024x1024",
            models: compatibleModels(["gpt-image-1", "gpt-4.1-mini"]),
            maxGenerations: 1000,
            imageReserveMicros: 1000n,
            monthlyLimitMicros: 1000000000000n,
            dailyLimitMicros: 1000000000000n,
            operationLimitMicros: 1000000000000n,
          },
        });
        const provider = adapter("openai"),
          oldDirect = provider.direct,
          oldGenerate = provider.generate;
        let calls = 0,
          release: (() => void) | undefined,
          block = false;
        provider.direct = async () => {
          calls++;
          if (block) {
            block = false;
            await new Promise<void>((resolve) => {
              release = resolve;
            });
          }
          return {
            text: JSON.stringify({
              backgroundPrompt: "",
              backgroundColor: "#ffffff",
              texts: [],
              logos: [],
            }),
            usage: null,
          };
        };
        provider.generate = async () => {
          throw new Error(
            "No se debe pedir imagen en la prueba Texto editable",
          );
        };
        const jobsFor = async () =>
          reserveJobs(
            uid,
            project.id,
            Array.from({ length: 200 }, (_, index) => ({
              subproductId: sub.id,
              key: randomUUID(),
              snapshot: {
                prompt: "Prueba sintética de carga",
                mode: "Texto",
                format: "1:1",
                index,
                renderMode: "editable",
              },
            })),
            prior.revision,
          );
        const cleanupIds: string[] = [];
        try {
          const interrupted = await jobsFor();
          cleanupIds.push(...interrupted.map((j) => j.id));
          const batch = (
            await prepareBackground(
              { id: uid, role: "USER" },
              interrupted.map((j) => j.id),
              randomUUID(),
            )
          ).batch;
          assert.equal(
            (
              await admin.call(
                `jobs/background/${batch.id}/cancel-pending`,
                "POST",
                {},
              )
            ).status,
            404,
          );
          block = true;
          const first = backgroundTick(batch.id, "synthetic-cancel-200");
          for (let i = 0; i < 500 && !release; i++)
            await new Promise((r) => setTimeout(r, 5));
          assert(release);
          assert.equal(calls, 1);
          const cancel = await user.call(
            `jobs/background/${batch.id}/cancel-pending`,
            "POST",
            {},
          );
          assert.equal(cancel.status, 200);
          assert.equal(cancel.body.cancelled, 199);
          assert.equal(cancel.body.running, 1);
          assert.equal(cancel.body.status, "PAUSING");
          assert.equal(
            await db.usageLedger.count({
              where: {
                jobId: { in: interrupted.map((j) => j.id) },
                status: "RELEASED",
              },
            }),
            199,
          );
          release();
          await first;
          assert.equal(
            await backgroundTick(batch.id, "synthetic-cancel-200"),
            "STOP",
          );
          assert.equal(calls, 1);
          assert.equal(
            (
              await db.backgroundBatch.findUniqueOrThrow({
                where: { id: batch.id },
              })
            ).status,
            "PAUSED",
          );
          const complete = await jobsFor();
          cleanupIds.push(...complete.map((j) => j.id));
          const next = (
            await prepareBackground(
              { id: uid, role: "USER" },
              complete.map((j) => j.id),
              randomUUID(),
            )
          ).batch;
          for (let i = 0; i < 200; i++)
            assert.equal(
              await backgroundTick(next.id, "synthetic-complete-200"),
              "CONTINUE",
            );
          assert.equal(
            await backgroundTick(next.id, "synthetic-complete-200"),
            "STOP",
          );
          assert.equal(await backgroundTick(next.id, "duplicate-run"), "STOP");
          assert.equal(calls, 201);
          assert.equal(
            await db.generationJob.count({
              where: {
                id: { in: complete.map((j) => j.id) },
                status: "COMPLETED",
              },
            }),
            200,
          );
          assert.equal(
            await db.variation.count({
              where: { jobId: { in: complete.map((j) => j.id) } },
            }),
            200,
          );
          assert.equal(
            await db.usageLedger.count({
              where: {
                jobId: { in: complete.map((j) => j.id) },
                status: "CONSUMED_ESTIMATE",
                actualMicros: null,
              },
            }),
            200,
          );
          const state = (await user.call("jobs/background")).body.batches.find(
            (b: any) => b.id === batch.id,
          );
          assert.equal(state.cancelled, 199);
          assert.equal(state.completed, 1);
          const uncertain = await db.generationJob.create({
            data: {
              actorId: uid,
              projectId: project.id,
              subproductId: sub.id,
              idempotencyKey: randomUUID(),
              snapshot: {},
              status: "UNCERTAIN",
              reservedMicros: 1000n,
            },
          });
          await db.usageLedger.create({
            data: {
              jobId: uncertain.id,
              actorId: uid,
              projectId: project.id,
              model: "synthetic",
              status: "UNCERTAIN",
              reservedMicros: 1000n,
            },
          });
          const review = await db.backgroundBatch.create({
            data: {
              actorId: uid,
              requestKey: randomUUID(),
              jobIds: [uncertain.id],
              status: "NEEDS_REVIEW",
            },
          });
          const noRetry = await user.call(
            `jobs/background/${review.id}/cancel-pending`,
            "POST",
            {},
          );
          assert.equal(noRetry.status, 200);
          assert.equal(noRetry.body.cancelled, 0);
          assert.equal(noRetry.body.status, "NEEDS_REVIEW");
          assert.equal(calls, 201);
          assert.equal(
            (
              await db.usageLedger.findUniqueOrThrow({
                where: { jobId: uncertain.id },
              })
            ).status,
            "UNCERTAIN",
          );
        } finally {
          release?.();
          provider.direct = oldDirect;
          provider.generate = oldGenerate;
          await db.generationJob.updateMany({
            where: { id: { in: cleanupIds }, status: "PENDING" },
            data: { status: "CANCELLED" },
          });
          await db.providerConfiguration.update({
            where: { id: "global" },
            data: {
              ...prior,
              models: JSON.parse(JSON.stringify(prior.models)),
              alternatives: JSON.parse(JSON.stringify(prior.alternatives)),
            },
          });
        }
      },
    );
    await t.test(
      "consumo completo y CSV: filtros, sumas exactas, cero frente a desconocido, permisos y fórmulas",
      async () => {
        const prefix = "informe-" + tag,
          project = (
            await user.call("projects", "POST", {
              name: "Informe de consumo " + tag,
            })
          ).body;
        const rows = await db.$transaction(
          async (tx) => {
            const result = [];
            for (let i = 0; i < 230; i++) {
              const job = await tx.generationJob.create({
                data: {
                  actorId: uid,
                  projectId: project.id,
                  idempotencyKey: randomUUID(),
                  snapshot: { prompt: "PROMPT PRIVADO NO EXPORTAR" },
                  reservedMicros: 1234567n,
                  status: "COMPLETED",
                },
              });
              result.push(
                await tx.usageLedger.create({
                  data: {
                    jobId: job.id,
                    actorId: uid,
                    projectId: project.id,
                    model: i === 0 ? "=2+2_" + prefix : prefix,
                    status:
                      i === 2
                        ? "RELEASED"
                        : i === 3
                          ? "UNCERTAIN"
                          : i < 2
                            ? "CONSUMED_ESTIMATE"
                            : "RESERVED",
                    reservedMicros: 1234567n,
                    actualMicros:
                      i === 0 ? 0n : i === 1 ? 9007199254740993n : null,
                    usage: { secret: "NO EXPORTAR JSON DE USO" },
                  },
                }),
              );
            }
            return result;
          },
          { timeout: 20000 },
        );
        const query = "days=all&q=" + prefix,
          report = await user.call("usage/list?" + query);
        assert.equal(report.status, 200);
        assert.equal(report.body.total, 230);
        assert.equal(report.body.rows.length, 50);
        assert.equal(report.body.pages, 5);
        assert.equal(
          report.body.summary.reservedMicros,
          String(229n * 1234567n),
        );
        assert.equal(report.body.summary.knownCosts, 2);
        assert.equal(report.body.summary.knownActualMicros, "9007199254740993");
        assert.equal(report.body.summary.unknownCosts, 227);
        assert.equal(report.body.summary.uncertain, 1);
        const all: any[] = [];
        for (let page = 1; page <= 5; page++)
          all.push(
            ...(await user.call(`usage/list?${query}&page=${page}`)).body.rows,
          );
        assert.equal(new Set(all.map((r) => r.id)).size, 230);
        assert.equal(all.find((r) => r.id === rows[0].id).actualMicros, "0");
        assert.equal(
          all.find((r) => r.id === rows[1].id).actualMicros,
          "9007199254740993",
        );
        assert(!JSON.stringify(report.body).includes("NO EXPORTAR"));
        assert(!JSON.stringify(report.body).includes("PROMPT PRIVADO"));
        assert.equal(all[0].contexts[0].projectName, project.name);
        assert.equal(
          (await user.call("usage/list?" + query + "&cost=known")).body.total,
          2,
        );
        assert.equal(
          (await user.call("usage/list?" + query + "&cost=unknown")).body.total,
          227,
        );
        assert.equal(
          (
            await user.call(
              "usage/list?" + query + "&status=RELEASED&cost=unknown",
            )
          ).body.total,
          0,
        );
        const ownerId = (
          await db.user.findFirstOrThrow({
            where: { name: "Owner prueba", role: "OWNER" },
          })
        ).id;
        await db.usageLedger.create({
          data: {
            actorId: ownerId,
            projectId: project.id,
            jobId: randomUUID(),
            model: prefix,
            reservedMicros: 1n,
          },
        });
        assert.equal((await owner.call("usage/list?" + query)).body.total, 231);
        assert.equal((await admin.call("usage/list?" + query)).body.total, 0);
        for (const client of [observer, anonymous])
          for (const path of ["usage/list?" + query, "usage/export?" + query])
            assert.equal(
              (await client.call(path)).status,
              client === observer ? 403 : 401,
            );
        const response = await fetch(root + "/api/usage/export?" + query, {
          headers: { Cookie: user.cookie },
        });
        assert.equal(response.status, 200);
        assert.equal(
          response.headers.get("content-type"),
          "text/csv; charset=utf-8",
        );
        assert(response.headers.get("cache-control")?.includes("no-store"));
        const csv = Buffer.from(await response.arrayBuffer()).toString("utf8");
        assert.equal(csv.split("\r\n").filter(Boolean).length, 231);
        assert(csv.includes("\"'=2+2_" + prefix + '"'));
        assert(csv.includes('"9007199254.740993"'));
        assert(csv.includes('"0.000000"'));
        assert(csv.includes('"No informado"'));
        assert(!csv.includes("PROMPT PRIVADO"));
        assert(!csv.includes("NO EXPORTAR"));
        for (const invalid of [
          "days=1",
          "page=0",
          "status=INVALID",
          "cost=INVALID",
        ])
          assert.equal((await user.call("usage/list?" + invalid)).status, 400);
        const literal = await db.usageLedger.create({
          data: {
            actorId: uid,
            projectId: project.id,
            jobId: randomUUID(),
            model: "literal100%" + tag,
            reservedMicros: 1n,
          },
        });
        assert.equal(
          (
            await user.call(
              "usage/list?days=all&q=" + encodeURIComponent("100%" + tag),
            )
          ).body.total,
          1,
        );
        const limitModel = "limite-csv-" + tag;
        try {
          await db.usageLedger.createMany({
            data: Array.from({ length: 2001 }, (_, i) => ({
              actorId: uid,
              projectId: project.id,
              jobId: `csv-limit-${tag}-${i}`,
              model: limitModel,
              reservedMicros: 1n,
            })),
          });
          assert.equal(
            (await user.call("usage/export?days=all&q=" + limitModel)).status,
            413,
          );
        } finally {
          await db.usageLedger.deleteMany({
            where: { model: limitModel, actorId: uid },
          });
        }
        await db.usageLedger.delete({ where: { id: literal.id } });
      },
    );
    await t.test(
      "descarga de 200 afiches locales en ZIP PNG y JPG sin generar ni alterar consumo",
      async () => {
        const JSZip = (await import("jszip")).default;
        const project = await db.project.findFirstOrThrow({
            where: { name: "Lote 200 " + tag },
          }),
          images = await db.variation.findMany({
            where: { job: { projectId: project.id, status: "COMPLETED" } },
            orderBy: { createdAt: "desc" },
            take: 200,
            select: { id: true },
          });
        assert.equal(images.length, 200);
        const before = await db.usageLedger.count();
        for (const format of ["png", "jpg"]) {
          const response = await fetch(root + "/api/exports", {
            method: "POST",
            headers: {
              Cookie: user.cookie,
              Origin: root,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ ids: images.map((i) => i.id), format }),
          });
          assert.equal(response.status, 200);
          const zip = await JSZip.loadAsync(await response.arrayBuffer()),
            files = Object.values(zip.files).filter((f) => !f.dir);
          assert.equal(files.length, 200);
          assert(
            files.every(
              (f) => f.name.endsWith("." + format) && !f.name.includes(".."),
            ),
          );
          for (const file of files) {
            const bytes = await file.async("nodebuffer");
            assert(
              format === "png"
                ? bytes
                    .subarray(0, 8)
                    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
                : bytes[0] === 255 && bytes[1] === 216,
            );
          }
        }
        assert.equal(await db.usageLedger.count(), before);
      },
    );
    await t.test(
      "prueba IA opcional: consentimiento, imagen real simulada e idempotencia sin repetir llamadas",
      async () => {
        const { adapter, compatibleModels } = await import("../lib/providers");
        const { encryptKey } = await import("../lib/crypto");
        const prior = await db.providerConfiguration.findUniqueOrThrow({
          where: { id: "global" },
        });
        const provider = adapter("openai"),
          oldDirect = provider.direct,
          oldGenerate = provider.generate;
        let directs = 0,
          images = 0;
        const bytes = await (
          await import("sharp")
        )
          .default({
            create: {
              width: 64,
              height: 64,
              channels: 3,
              background: "#237355",
            },
          })
          .png()
          .toBuffer();
        try {
          await db.providerConfiguration.update({
            where: { id: "global" },
            data: {
              encryptedKey: encryptKey(config.apiKey),
              provider: "openai",
              status: "VERIFIED",
              verifiedAt: new Date(),
              verifiedRevision: prior.revision,
              imageModel: "gpt-image-1",
              creativeModel: "gpt-4.1-mini",
              quality: "low",
              resolution: "1024x1024",
              models: compatibleModels(["gpt-image-1", "gpt-4.1-mini"]),
              imageReserveMicros: 1000n,
              monthlyLimitMicros: 100000000000000n,
              dailyLimitMicros: 100000000000000n,
              operationLimitMicros: 100000000000000n,
            },
          });
          provider.direct = async (_key, model, prompt) => {
            directs++;
            assert.equal(model, "gpt-4.1-mini");
            assert(prompt.includes("Prueba de conexión"));
            return {
              text: "Afiche de prueba sin logos ni precios",
              usage: null,
            };
          };
          provider.generate = async (_key, args) => {
            images++;
            assert.equal(args.model, "gpt-image-1");
            assert.equal(args.size, "1024x1024");
            assert.equal(args.quality, "low");
            return { bytes, usage: null };
          };
          const requestId = randomUUID();
          const before = await db.generationJob.count();
          assert.equal(
            (await owner.call("ai/test", "POST", { requestId })).status,
            400,
          );
          assert.equal(await db.generationJob.count(), before);
          const accepted = await owner.call("ai/test", "POST", {
            requestId,
            confirmCharge: true,
          });
          assert.equal(accepted.status, 202);
          const id = accepted.body.jobs[0];
          const job = await db.generationJob.findUniqueOrThrow({
            where: { id },
          });
          assert.equal((job.snapshot as any).mode, "Imagen + Texto");
          assert.equal((job.snapshot as any).renderMode, "flat");
          assert.equal(directs + images, 0);
          const duplicate = await owner.call("ai/test", "POST", {
            requestId,
            confirmCharge: true,
          });
          assert.deepEqual(duplicate.body.jobs, [id]);
          assert.equal(await db.generationJob.count(), before + 1);
          assert.equal(await runOne({ id }), true);
          assert.equal(await runOne({ id }), false);
          assert.equal(directs, 1);
          assert.equal(images, 1);
          assert.equal(
            (await db.generationJob.findUniqueOrThrow({ where: { id } }))
              .status,
            "COMPLETED",
          );
          const ledger = await db.usageLedger.findUniqueOrThrow({
            where: { jobId: id },
          });
          assert.equal(ledger.actualMicros, null);
          assert.equal(ledger.status, "CONSUMED_ESTIMATE");
          const result = await db.variation.findFirstOrThrow({
            where: { jobId: id },
          });
          const downloaded = await fetch(
            root + `/api/variations/${result.id}?download`,
            { headers: { Cookie: owner.cookie } },
          );
          assert.equal(downloaded.status, 200);
          assert(
            Buffer.from(await downloaded.arrayBuffer())
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
          );
        } finally {
          provider.direct = oldDirect;
          provider.generate = oldGenerate;
          await db.providerConfiguration.update({
            where: { id: "global" },
            data: {
              ...prior,
              models: JSON.parse(JSON.stringify(prior.models)),
              alternatives: JSON.parse(JSON.stringify(prior.alternatives)),
            },
          });
        }
      },
    );
    await t.test(
      "retirar generaciones conserva ledger, resultados e historial, permite restaurar y protege trabajos activos",
      async () => {
        const project = (
          await user.call("projects", "POST", { name: "Retirada " + tag })
        ).body;
        const make = async (status: string, actorId = uid) => {
          const job = await db.generationJob.create({
            data: {
              actorId,
              projectId: project.id,
              status,
              snapshot: {},
              idempotencyKey: randomUUID(),
              reservedMicros: 73n,
            },
          });
          await db.usageLedger.create({
            data: {
              jobId: job.id,
              actorId,
              projectId: project.id,
              model: "sintético",
              status:
                status === "UNCERTAIN"
                  ? "UNCERTAIN"
                  : status === "CANCELLED"
                    ? "RELEASED"
                    : "RESERVED",
              reservedMicros: 73n,
            },
          });
          return job;
        };
        const uncertain = await make("UNCERTAIN"),
          failed = await make("FAILED"),
          pending = await make("PENDING"),
          running = await make("RUNNING");
        for (const c of [admin, observer, anonymous])
          assert(
            [401, 403, 404].includes(
              (await c.call(`jobs/${uncertain.id}/archive`, "POST", {})).status,
            ),
          );
        assert.equal(
          (await user.call(`jobs/${pending.id}/archive`, "POST", {})).status,
          409,
        );
        assert.equal(
          (await user.call(`jobs/${running.id}/archive`, "POST", {})).status,
          409,
        );
        const before = await db.usageLedger.findUniqueOrThrow({
          where: { jobId: uncertain.id },
        });
        assert.equal(
          (await user.call(`jobs/${uncertain.id}/archive`, "POST", {})).status,
          200,
        );
        assert(
          !(await user.call("jobs/list")).body.rows.some(
            (j: any) => j.id === uncertain.id,
          ),
        );
        assert(
          (await user.call("jobs/list?archived=true")).body.rows.some(
            (j: any) => j.id === uncertain.id,
          ),
        );
        assert(
          !(await user.call("jobs")).body.some(
            (j: any) => j.id === uncertain.id,
          ),
        );
        assert.deepEqual(
          await db.usageLedger.findUniqueOrThrow({
            where: { jobId: uncertain.id },
          }),
          before,
        );
        assert.equal(
          (
            await user.call(`jobs/${uncertain.id}/retry`, "POST", {
              requestId: randomUUID(),
              confirmCharge: true,
              confirmUncertain: true,
            })
          ).status,
          409,
        );
        assert.equal(
          (await user.call(`jobs/${uncertain.id}/archive`, "POST", {})).status,
          409,
        );
        assert.equal(
          (await owner.call(`jobs/${failed.id}/archive`, "POST", {})).status,
          200,
        );
        assert.equal(
          (
            await user.call(`jobs/${uncertain.id}/archive`, "POST", {
              restore: true,
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await db.generationJob.findUniqueOrThrow({
              where: { id: uncertain.id },
            })
          ).archivedAt,
          null,
        );
        const completed = await db.generationJob.findFirstOrThrow({
          where: { projectId: "connection-test", status: "COMPLETED" },
          orderBy: { createdAt: "desc" },
          include: { variation: true },
        });
        assert(completed.variation);
        assert.equal(
          (await owner.call(`jobs/${completed.id}/archive`, "POST", {})).status,
          200,
        );
        const file = await fetch(
          root + `/api/variations/${completed.variation.id}?download`,
          { headers: { Cookie: owner.cookie } },
        );
        assert.equal(file.status, 200);
        await file.arrayBuffer();
        assert.equal(
          (
            await owner.call(`jobs/${completed.id}/archive`, "POST", {
              restore: true,
            })
          ).status,
          200,
        );
        assert.equal(
          await db.auditEvent.count({
            where: {
              action: "TRABAJO_RETIRADO_LISTADO",
              resourceId: uncertain.id,
            },
          }),
          1,
        );
        await db.generationJob.updateMany({
          where: { id: { in: [pending.id, running.id] } },
          data: { status: "CANCELLED" },
        });
        await db.usageLedger.updateMany({
          where: { jobId: { in: [pending.id, running.id] } },
          data: { status: "RELEASED" },
        });
      },
    );
    await t.test(
      "límites particulares: actualizar y eliminar como OWNER conserva consumo y presupuestos globales",
      async () => {
        const project = (
          await owner.call("projects", "POST", {
            name: "Presupuesto eliminable " + tag,
          })
        ).body;
        const body = {
          scope: "PROJECT",
          targetId: project.id,
          monthlyMicros: "0",
          dailyMicros: "0",
          maxJobsPerDay: 0,
        };
        assert.equal((await owner.call("budgets", "PUT", body)).status, 200);
        const limit = (await owner.call("budgets")).body.find(
          (l: any) => l.targetId === project.id,
        );
        assert(limit);
        const global = await db.providerConfiguration.findUniqueOrThrow({
            where: { id: "global" },
          }),
          ledgerCount = await db.usageLedger.count();
        for (const c of [user, admin, observer])
          assert.equal(
            (await c.call("budgets", "DELETE", { id: limit.id })).status,
            403,
          );
        assert.equal(
          (await anonymous.call("budgets", "DELETE", { id: limit.id })).status,
          401,
        );
        assert.equal(
          (
            await owner.call("budgets", "PUT", {
              ...body,
              monthlyMicros: "10000000",
              dailyMicros: "5000000",
              maxJobsPerDay: 2,
            })
          ).status,
          200,
        );
        assert.equal(
          (await db.budgetLimit.findUniqueOrThrow({ where: { id: limit.id } }))
            .maxJobsPerDay,
          2,
        );
        assert.equal(
          (await owner.call("budgets", "DELETE", { id: limit.id })).status,
          200,
        );
        assert.equal(
          await db.budgetLimit.findUnique({ where: { id: limit.id } }),
          null,
        );
        assert.equal(
          (await owner.call("budgets", "DELETE", { id: limit.id })).status,
          404,
        );
        assert.deepEqual(
          await db.providerConfiguration.findUniqueOrThrow({
            where: { id: "global" },
          }),
          global,
        );
        assert.equal(await db.usageLedger.count(), ledgerCount);
        const configResponse = await owner.call("ai/config");
        assert.equal(configResponse.status, 200);
        assert(configResponse.body.latestTest);
        assert(
          !JSON.stringify(configResponse.body.latestTest).includes("prompt"),
        );
        const ownerId = (await owner.call("auth/me")).body.id;
        const oldLimit = await db.budgetLimit.findUnique({
          where: { scope_targetId: { scope: "USER", targetId: ownerId } },
        });
        try {
          await db.providerConfiguration.update({
            where: { id: "global" },
            data: {
              imageReserveMicros: 2000000n,
              operationLimitMicros: 5000000n,
              monthlyLimitMicros: 100000000000000n,
              dailyLimitMicros: 100000000000000n,
            },
          });
          await db.budgetLimit.upsert({
            where: { scope_targetId: { scope: "USER", targetId: ownerId } },
            create: {
              scope: "USER",
              targetId: ownerId,
              monthlyMicros: 100000000000000n,
              dailyMicros: 1000000n,
              maxJobsPerDay: 100000,
            },
            update: {
              monthlyMicros: 100000000000000n,
              dailyMicros: 1000000n,
              maxJobsPerDay: 100000,
            },
          });
          const blocked = (await owner.call("ai/config")).body.testBudget;
          assert.equal(blocked.allowed, true);
          assert.equal(blocked.error, null);
          const row = await db.budgetLimit.findUniqueOrThrow({
            where: { scope_targetId: { scope: "USER", targetId: ownerId } },
          });
          assert.equal(
            (await owner.call("budgets", "DELETE", { id: row.id })).status,
            200,
          );
          assert.equal(
            (await owner.call("ai/config")).body.testBudget.allowed,
            true,
          );
          assert.equal(await db.usageLedger.count(), ledgerCount);
        } finally {
          await db.providerConfiguration.update({
            where: { id: "global" },
            data: {
              ...global,
              models: JSON.parse(JSON.stringify(global.models)),
              alternatives: JSON.parse(JSON.stringify(global.alternatives)),
            },
          });
          if (oldLimit)
            await db.budgetLimit.upsert({
              where: { scope_targetId: { scope: "USER", targetId: ownerId } },
              create: oldLimit,
              update: oldLimit,
            });
        }
      },
    );
    await t.test(
      "conciliación manual OWNER: coste exacto, cero, auditoría, CSV, permisos y concurrencia sin liberar reserva incierta",
      async () => {
        const project = (
          await user.call("projects", "POST", {
            name: "Coste comprobado " + tag,
          })
        ).body;
        const job = await db.generationJob.create({
          data: {
            actorId: uid,
            projectId: project.id,
            status: "UNCERTAIN",
            idempotencyKey: randomUUID(),
            snapshot: {},
            reservedMicros: 2000000n,
          },
        });
        const ledger = await db.usageLedger.create({
          data: {
            jobId: job.id,
            actorId: uid,
            projectId: project.id,
            model: "conciliacion-" + tag,
            reservedMicros: 2000000n,
            status: "UNCERTAIN",
          },
        });
        const call = (data: unknown, client = owner) =>
          client.call(`usage/${ledger.id}/reconcile`, "POST", data);
        const input = {
          amountUsd: "0",
          reference: "Comprobante privado de prueba",
          confirmed: true,
          expectedActualMicros: null,
          expectedConfirmationId: null,
        };
        for (const c of [user, admin, observer])
          assert.equal((await call(input, c)).status, 403);
        assert.equal((await call(input, anonymous)).status, 401);
        assert.equal((await call({ ...input, confirmed: false })).status, 400);
        assert.equal((await call({ ...input, amountUsd: "1e3" })).status, 400);
        assert.equal(
          (
            await call({
              ...input,
              reference: "sk-synthetic-secret-123456789012345",
            })
          ).status,
          400,
        );
        assert.equal(
          (await owner.call("usage/no-existe/reconcile", "POST", input)).status,
          404,
        );
        const zero = await call(input);
        assert.equal(zero.status, 200);
        assert.equal(zero.body.actualMicros, "0");
        const normal = (await user.call("usage/list?q=conciliacion-" + tag))
          .body;
        assert.equal(normal.canReconcile, false);
        assert.equal(normal.summary.unknownCosts, 0);
        assert.equal(
          normal.rows[0].costConfirmation.source,
          "Confirmación manual del OWNER",
        );
        assert(!JSON.stringify(normal).includes(input.reference));
        assert(!normal.rows[0].costConfirmation.id);
        const ownerReport = (
          await owner.call("usage/list?q=conciliacion-" + tag)
        ).body;
        assert.equal(
          ownerReport.rows[0].costConfirmation.reference,
          input.reference,
        );
        const races = await Promise.all(
          ["1.234567", "2,345678"].map((amountUsd) =>
            call({
              ...input,
              amountUsd,
              expectedActualMicros: "0",
              expectedConfirmationId: zero.body.confirmationId,
            }),
          ),
        );
        assert.deepEqual(races.map((r) => r.status).sort(), [200, 409]);
        const winner = races.find((r) => r.status === 200)!;
        assert(["1234567", "2345678"].includes(winner.body.actualMicros));
        const back = await call({
          ...input,
          expectedActualMicros: winner.body.actualMicros,
          expectedConfirmationId: winner.body.confirmationId,
        });
        assert.equal(back.status, 200);
        assert.equal(
          (
            await call({
              ...input,
              amountUsd: "3",
              expectedActualMicros: "0",
              expectedConfirmationId: zero.body.confirmationId,
            })
          ).status,
          409,
        );
        const unchanged = await db.usageLedger.findUniqueOrThrow({
          where: { id: ledger.id },
        });
        assert.equal(unchanged.status, "UNCERTAIN");
        assert.equal(unchanged.reservedMicros, 2000000n);
        assert.equal(unchanged.actualMicros, 0n);
        assert.equal(
          (await db.generationJob.findUniqueOrThrow({ where: { id: job.id } }))
            .status,
          "UNCERTAIN",
        );
        assert.equal(
          await db.auditEvent.count({
            where: { action: "COSTE_IA_CONCILIADO", resourceId: ledger.id },
          }),
          3,
        );
        const history = (await owner.call("audit/history?q=Coste%20comprobado"))
          .body;
        assert(
          history.rows.some(
            (r: any) => r.action === "Registró un coste de IA comprobado",
          ),
        );
        const csv = await fetch(
          root + "/api/usage/export?q=conciliacion-" + tag,
          { headers: { Cookie: user.cookie } },
        );
        assert.equal(csv.status, 200);
        const text = await csv.text();
        assert(text.includes("Confirmación manual del OWNER"));
        assert(text.includes('"0.000000"'));
        assert(!text.includes(input.reference));
        for (const status of ["PENDING", "RUNNING"]) {
          await db.generationJob.update({
            where: { id: job.id },
            data: { status },
          });
          assert.equal(
            (
              await call({
                ...input,
                expectedActualMicros: "0",
                expectedConfirmationId: back.body.confirmationId,
              })
            ).status,
            409,
          );
        }
        await db.generationJob.update({
          where: { id: job.id },
          data: { status: "UNCERTAIN" },
        });
      },
    );
    await t.test(
      "jerarquía y calendario en Generaciones/Costos, imágenes compartidas, 100 por página y retirada atómica",
      async () => {
        const project = (
          await owner.call("projects", "POST", {
            name: "Filtros jerárquicos " + tag,
            prompt: "INSTRUCCIONES PRIVADAS DE FILTROS",
          })
        ).body;
        const productA = (
          await owner.call(`projects/${project.id}/categories`, "POST", {
            name: "Producto A",
          })
        ).body;
        const productB = (
          await owner.call(`projects/${project.id}/categories`, "POST", {
            name: "Producto B oculto",
          })
        ).body;
        const subsA = (
          await owner.call(`categories/${productA.id}/subproducts`, "POST", {
            names: ["Tema compartido", "Tema privado"],
          })
        ).body;
        const subsB = (
          await owner.call(`categories/${productB.id}/subproducts`, "POST", {
            names: ["Tema B privado"],
          })
        ).body;
        for (const id of [uid, oid])
          assert.equal(
            (
              await owner.call(`subproducts/${subsA[0].id}/members`, "POST", {
                email: (
                  await db.user.findUniqueOrThrow({
                    where: { id },
                    select: { email: true },
                  })
                ).email,
              })
            ).status,
            200,
          );
        const ownerId = (await owner.call("auth/me")).body.id;
        const { store } = await import("../lib/storage");
        const sharp = (await import("sharp")).default;
        const bytes = await sharp({
          create: { width: 32, height: 32, channels: 3, background: "#145544" },
        })
          .png()
          .toBuffer();
        const images = [];
        for (const [sub, createdAt, actual] of [
          [subsA[0].id, "2026-02-01T04:59:59.999Z", 1000000n],
          [subsA[0].id, "2026-02-01T05:00:00.000Z", null],
          [subsA[1].id, "2026-02-01T12:00:00.000Z", 2000000n],
          [subsB[0].id, "2026-02-01T12:00:00.000Z", 3000000n],
        ] as const) {
          const job = await db.generationJob.create({
            data: {
              actorId: ownerId,
              projectId: project.id,
              subproductId: sub,
              status: "COMPLETED",
              snapshot: { prompt: "NO EXPONER PROMPT" },
              idempotencyKey: randomUUID(),
              reservedMicros: 100000n,
              createdAt: new Date(createdAt),
            },
          });
          await db.usageLedger.create({
            data: {
              jobId: job.id,
              actorId: ownerId,
              projectId: project.id,
              model: "filtros-" + tag,
              reservedMicros: 100000n,
              actualMicros: actual,
              status: "CONSUMED_ESTIMATE",
              createdAt: new Date(createdAt),
            },
          });
          images.push(
            await db.variation.create({
              data: {
                jobId: job.id,
                subproductId: sub,
                path: await store(bytes),
                model: "sintético",
                expiresAt: new Date(Date.now() + 86400000),
                createdAt: new Date(createdAt),
              },
            }),
          );
        }
        const opt = await user.call(
          `hierarchy/options?project=${project.id}&product=${productA.id}`,
        );
        assert.equal(opt.status, 200);
        assert(opt.body.projects.some((p: any) => p.id === project.id));
        assert.deepEqual(
          opt.body.products.map((p: any) => p.id),
          [productA.id],
        );
        assert.deepEqual(
          opt.body.subproducts.map((p: any) => p.id),
          [subsA[0].id],
        );
        assert(!JSON.stringify(opt.body).includes("INSTRUCCIONES"));
        assert.equal(
          (
            await observer.call(
              `hierarchy/options?project=${project.id}&product=${productA.id}`,
            )
          ).status,
          200,
        );
        assert.equal((await user.call("jobs/list?project=none")).status, 403);
        assert.equal(
          (
            await owner.call(
              `jobs/list?project=${project.id}&product=${productB.id}&subproduct=${subsA[0].id}`,
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await user.call(
              `jobs/list?project=${project.id}&product=${productB.id}`,
            )
          ).status,
          404,
        );
        const shared = (await user.call(`jobs/list?project=${project.id}`))
          .body;
        assert.equal(shared.total, 2);
        assert(shared.rows.every((j: any) => j.variation && !j.canManage));
        assert(!JSON.stringify(shared).includes("NO EXPONER"));
        assert.equal(
          (await owner.call(`jobs/list?project=${project.id}`)).body.total,
          4,
        );
        const day = (
          await user.call(
            `jobs/list?project=${project.id}&from=2026-02-01&to=2026-02-01`,
          )
        ).body;
        assert.equal(day.total, 1);
        assert.equal(day.counts.COMPLETED, 1);
        assert.equal(
          (
            await user.call(
              `jobs/list?project=${project.id}&from=2026-01-31&to=2026-01-31`,
            )
          ).body.total,
          1,
        );
        assert.equal(
          (await user.call("jobs/list?from=2026-02-30")).status,
          400,
        );
        assert.equal(
          (await owner.call("jobs/list?from=2026-03-01&to=2026-02-01")).status,
          400,
        );
        assert.equal((await owner.call("jobs/list?size=101")).status, 400);
        const cost = (
          await user.call(`usage/list?days=all&project=${project.id}`)
        ).body;
        assert.equal(cost.total, 2);
        assert.equal(cost.summary.knownActualMicros, "1000000");
        assert.equal(cost.summary.unknownCosts, 1);
        assert.equal(
          (await user.call(`usage/list?days=all&q=filtros-${tag}`)).body.total,
          2,
        );
        const subtotal = (
          await owner.call(
            `usage/summary?days=all&project=${project.id}&product=${productA.id}`,
          )
        ).body;
        assert.equal(subtotal.summary.knownActualMicros, "3000000");
        assert.equal(subtotal.rows.length, 0);
        assert.equal(
          (await owner.call(`usage/summary?days=all&project=${project.id}`))
            .body.summary.knownActualMicros,
          "6000000",
        );
        assert.equal(
          (
            await user.call(
              `usage/list?days=all&project=${project.id}&from=2026-02-01&to=2026-02-01`,
            )
          ).body.summary.knownCosts,
          0,
        );
        assert.equal(
          (
            await user.call(`jobs/archive-many`, "POST", {
              ids: [shared.rows[0].id],
              restore: false,
            })
          ).status,
          404,
        );
        const jobs = Array.from({ length: 105 }, () => ({
          id: randomUUID(),
          actorId: ownerId,
          projectId: project.id,
          subproductId: subsA[0].id,
          status: "PENDING",
          snapshot: {},
          idempotencyKey: randomUUID(),
          reservedMicros: 1000n,
        }));
        await db.generationJob.createMany({ data: jobs });
        await db.usageLedger.createMany({
          data: jobs.map((j) => ({
            jobId: j.id,
            actorId: ownerId,
            projectId: project.id,
            model: "paginación",
            reservedMicros: 1000n,
            status: "RESERVED",
          })),
        });
        const first = (
            await owner.call(
              `jobs/list?project=${project.id}&status=PENDING&size=100`,
            )
          ).body,
          second = (
            await owner.call(
              `jobs/list?project=${project.id}&status=PENDING&size=100&page=2`,
            )
          ).body;
        assert.equal(first.total, 105);
        assert.equal(first.rows.length, 100);
        assert.equal(second.rows.length, 5);
        assert.equal(
          new Set([...first.rows, ...second.rows].map((r: any) => r.id)).size,
          105,
        );
        assert.equal(
          (await user.call(`jobs/list?project=${project.id}&status=PENDING`))
            .body.total,
          0,
        );
        const target = first.rows.map((j: any) => j.id);
        await db.generationJob.update({
          where: { id: target[0] },
          data: { status: "RUNNING" },
        });
        assert.equal(
          (
            await owner.call("jobs/archive-many", "POST", {
              ids: target,
              restore: false,
            })
          ).status,
          409,
        );
        assert.equal(
          await db.generationJob.count({
            where: { id: { in: target }, archivedAt: { not: null } },
          }),
          0,
        );
        await db.generationJob.update({
          where: { id: target[0] },
          data: { status: "PENDING" },
        });
        assert.equal(
          (
            await owner.call("jobs/archive-many", "POST", {
              ids: target,
              restore: false,
            })
          ).body.changed,
          100,
        );
        assert.equal(
          await db.usageLedger.count({
            where: { jobId: { in: target }, status: "RELEASED" },
          }),
          100,
        );
        assert.equal(
          (
            await owner.call("jobs/archive-many", "POST", {
              ids: target,
              restore: true,
            })
          ).body.changed,
          100,
        );
        assert.equal(
          await db.generationJob.count({
            where: {
              id: { in: target },
              status: "CANCELLED",
              archivedAt: null,
            },
          }),
          100,
        );
        await db.generationJob.updateMany({
          where: { id: { in: jobs.map((j) => j.id) }, status: "PENDING" },
          data: { status: "CANCELLED" },
        });
        await db.usageLedger.updateMany({
          where: { jobId: { in: jobs.map((j) => j.id) }, status: "RESERVED" },
          data: { status: "RELEASED" },
        });
        assert.equal(
          (
            await owner.call(
              `subproducts/${subsA[0].id}/members/${uid}`,
              "DELETE",
            )
          ).status,
          200,
        );
        assert.equal(
          (await user.call(`hierarchy/options?project=${project.id}`)).status,
          404,
        );
        assert.equal(
          (await user.call(`usage/list?project=${project.id}`)).status,
          404,
        );
        assert.equal(
          (await user.call(`usage/list?days=all&q=filtros-${tag}`)).body.total,
          0,
        );
      },
    );
    await t.test(
      "gasto diario: solo OWNER, fechas limitadas y credenciales ausentes sin contactar proveedor",
      async () => {
        const path = "ai/costs?from=2026-01-01&to=2026-01-02";
        assert.equal((await anonymous.call(path)).status, 401);
        for (const account of [user, admin, observer])
          assert.equal((await account.call(path)).status, 403);
        assert.equal(
          (await owner.call("ai/costs?from=2026-02-30&to=2026-03-01")).status,
          400,
        );
        assert.equal(
          (await owner.call("ai/costs?from=2026-01-01&to=2026-02-01")).status,
          400,
        );
        const previous = await db.providerConfiguration.findUniqueOrThrow({
          where: { id: "global" },
        });
        try {
          await db.providerConfiguration.update({
            where: { id: "global" },
            data: { encryptedKey: null },
          });
          assert.equal((await owner.call(path)).status, 409);
        } finally {
          await db.providerConfiguration.update({
            where: { id: "global" },
            data: { encryptedKey: previous.encryptedKey },
          });
        }
      },
    );
    await t.test(
      "recuperación con actividad: no interrumpe ejecutores vivos, conserva cargos y registra abandonados",
      async () => {
        const { recoverInterrupted } = await import("../scripts/worker");
        const { startJobHeartbeat, JOB_LEASE_MS } =
          await import("../lib/job-lease");
        const project = (
          await user.call("projects", "POST", { name: "Recuperación " + tag })
        ).body;
        const now = new Date(),
          old = new Date(now.getTime() - JOB_LEASE_MS - 1000);
        const make = async (values: object) => {
          const job = await db.generationJob.create({
            data: {
              actorId: uid,
              projectId: project.id,
              idempotencyKey: randomUUID(),
              status: "RUNNING",
              snapshot: {},
              reservedMicros: 17n,
              startedAt: old,
              createdAt: old,
              ...values,
            },
          });
          await db.usageLedger.create({
            data: {
              jobId: job.id,
              actorId: uid,
              projectId: project.id,
              model: "synthetic-lease",
              reservedMicros: 17n,
            },
          });
          return job;
        };
        const live = await make({ leaseToken: randomUUID(), heartbeatAt: now });
        const dead = await make({ leaseToken: randomUUID(), heartbeatAt: old });
        const legacy = await make({ leaseToken: null, heartbeatAt: null });
        const missingStart = await make({
          leaseToken: null,
          heartbeatAt: null,
          startedAt: null,
        });
        const heart = startJobHeartbeat(live.id, live.leaseToken!, 10);
        try {
          const before = (
            await db.generationJob.findUniqueOrThrow({ where: { id: live.id } })
          ).heartbeatAt!;
          await new Promise((resolve) => setTimeout(resolve, 45));
          const renewed = await db.generationJob.findUniqueOrThrow({
            where: { id: live.id },
          });
          assert(renewed.heartbeatAt! > before);
          const recovered = await Promise.all([
            recoverInterrupted(now),
            recoverInterrupted(now),
          ]);
          assert(recovered.reduce((a, b) => a + b, 0) >= 3);
          assert.equal(
            (
              await db.generationJob.findUniqueOrThrow({
                where: { id: live.id },
              })
            ).status,
            "RUNNING",
          );
          for (const job of [dead, legacy, missingStart]) {
            const row = await db.generationJob.findUniqueOrThrow({
              where: { id: job.id },
            });
            assert.equal(row.status, "UNCERTAIN");
            assert.equal(row.leaseToken, null);
            assert.equal(row.heartbeatAt, null);
            assert(row.completedAt);
            const ledger = await db.usageLedger.findUniqueOrThrow({
              where: { jobId: job.id },
            });
            assert.equal(ledger.status, "UNCERTAIN");
            assert.equal(ledger.reservedMicros, 17n);
            assert.equal(ledger.actualMicros, null);
            assert.equal(
              await db.auditEvent.count({
                where: { resourceId: job.id, action: "TRABAJO_INTERRUMPIDO" },
              }),
              1,
            );
          }
          const response = await user.call(
            "jobs/list?status=RUNNING&project=" + project.id,
          );
          assert.equal(response.body.total, 1);
          assert(!JSON.stringify(response.body).includes(live.leaseToken!));
          assert(!JSON.stringify(response.body).includes("heartbeatAt"));
          const wrong = startJobHeartbeat(live.id, "wrong-token", 60000);
          await assert.rejects(wrong.check(), /actividad/);
          assert.equal(wrong.signal.aborted, true);
          await wrong.stop();
        } finally {
          await heart.stop();
        }
        const stopped = await db.generationJob.findUniqueOrThrow({
          where: { id: live.id },
        });
        await new Promise((resolve) => setTimeout(resolve, 35));
        assert.equal(
          (
            await db.generationJob.findUniqueOrThrow({ where: { id: live.id } })
          ).heartbeatAt!.getTime(),
          stopped.heartbeatAt!.getTime(),
        );
        await db.generationJob.update({
          where: { id: live.id },
          data: { heartbeatAt: old },
        });
        const expired = startJobHeartbeat(live.id, live.leaseToken!, 60000);
        await assert.rejects(expired.check(), /actividad/);
        await expired.stop();
        await recoverInterrupted(now);
        assert.equal(
          (await db.generationJob.findUniqueOrThrow({ where: { id: live.id } }))
            .status,
          "UNCERTAIN",
        );
      },
    );
    await t.test(
      "un ejecutor tardío no publica ni pisa una recuperación o confirmación posterior",
      async () => {
        const { recoverInterrupted } = await import("../scripts/worker");
        const { JOB_LEASE_MS } = await import("../lib/job-lease");
        const { adapter, compatibleModels } = await import("../lib/providers");
        const { encryptKey } = await import("../lib/crypto");
        const project = (
          await user.call("projects", "POST", {
            name: "Ejecución tardía " + tag,
          })
        ).body;
        const product = (
          await user.call(`projects/${project.id}/categories`, "POST", {
            name: "Producto de prueba",
          })
        ).body;
        const sub = (
          await user.call(`categories/${product.id}/subproducts`, "POST", {
            names: ["Tema de prueba"],
          })
        ).body[0];
        const previous = await db.providerConfiguration.findUniqueOrThrow({
            where: { id: "global" },
          }),
          provider = adapter("openai"),
          originalDirect = provider.direct,
          originalGenerate = provider.generate;
        let resume: () => void = () => {},
          started: () => void = () => {};
        const blocked = new Promise<void>((resolve) => (resume = resolve)),
          entered = new Promise<void>((resolve) => (started = resolve));
        let calls = 0,
          imageCalls = 0,
          executing: Promise<boolean> | undefined;
        try {
          const config = await db.providerConfiguration.update({
            where: { id: "global" },
            data: {
              encryptedKey: encryptKey("sk-synthetic-not-real"),
              status: "VERIFIED",
              verifiedAt: new Date(),
              verifiedRevision: previous.revision,
              imageModel: "gpt-image-1",
              creativeModel: "gpt-4.1-mini",
              quality: "low",
              resolution: "1024x1024",
              imageReserveMicros: 1n,
              models: compatibleModels(["gpt-image-1", "gpt-4.1-mini"]),
            },
          });
          provider.direct = async () => {
            calls++;
            started();
            await blocked;
            return {
              text: JSON.stringify({
                backgroundPrompt: "No ejecutar",
                backgroundColor: "#ffffff",
                texts: [],
                logos: [],
              }),
              usage: null,
            };
          };
          provider.generate = async () => {
            imageCalls++;
            throw Error("No debe generar tras perder el permiso");
          };
          const job = await db.generationJob.create({
            data: {
              actorId: uid,
              projectId: project.id,
              subproductId: sub.id,
              idempotencyKey: randomUUID(),
              reservedMicros: 3n,
              snapshot: {
                prompt: "Prueba sintética",
                mode: "Imagen + Texto",
                index: 0,
                format: "1:1",
                renderMode: "editable",
                configRevision: config.revision,
              },
            },
          });
          await db.usageLedger.create({
            data: {
              jobId: job.id,
              actorId: uid,
              projectId: project.id,
              model: "synthetic-lease",
              reservedMicros: 3n,
            },
          });
          executing = runOne({ id: job.id });
          await Promise.race([
            entered,
            new Promise((_, reject) =>
              setTimeout(
                () => reject(Error("No inició el transporte sintético")),
                3000,
              ),
            ),
          ]);
          const running = await db.generationJob.findUniqueOrThrow({
            where: { id: job.id },
          });
          assert(running.leaseToken);
          assert(running.heartbeatAt);
          await db.generationJob.update({
            where: { id: job.id },
            data: { heartbeatAt: new Date(Date.now() - JOB_LEASE_MS - 1000) },
          });
          await recoverInterrupted();
          await db.usageLedger.update({
            where: { jobId: job.id },
            data: { actualMicros: 7n },
          });
          resume();
          await executing;
          assert.equal(calls, 1);
          assert.equal(imageCalls, 0);
          const finished = await db.generationJob.findUniqueOrThrow({
            where: { id: job.id },
          });
          assert.equal(finished.status, "UNCERTAIN");
          assert(finished.error!.includes("interrumpida"));
          assert.equal(finished.leaseToken, null);
          assert.equal(
            await db.variation.count({ where: { jobId: job.id } }),
            0,
          );
          const ledger = await db.usageLedger.findUniqueOrThrow({
            where: { jobId: job.id },
          });
          assert.equal(ledger.status, "UNCERTAIN");
          assert.equal(ledger.actualMicros, 7n);
          assert.equal(ledger.reservedMicros, 3n);
        } finally {
          resume();
          await executing;
          provider.direct = originalDirect;
          provider.generate = originalGenerate;
          await db.providerConfiguration.update({
            where: { id: "global" },
            data: {
              ...previous,
              models: previous.models as any,
              alternatives: previous.alternatives as any,
            },
          });
        }
      },
    );
    await t.test(
      "respuesta tardía y COMMIT incierto: no publica imágenes abandonadas ni elimina resultados ya confirmados",
      async () => {
        const { recoverInterrupted } = await import("../scripts/worker"),
          { JOB_LEASE_MS } = await import("../lib/job-lease");
        const { adapter, compatibleModels } = await import("../lib/providers"),
          { encryptKey } = await import("../lib/crypto");
        const project = (
          await user.call("projects", "POST", {
            name: "Imagen interrumpida " + tag,
          })
        ).body;
        const previous = await db.providerConfiguration.findUniqueOrThrow({
            where: { id: "global" },
          }),
          provider = adapter("openai"),
          originalDirect = provider.direct,
          originalGenerate = provider.generate;
        const png = await (
          await import("sharp")
        )
          .default({
            create: {
              width: 64,
              height: 64,
              channels: 3,
              background: "#123456",
            },
          })
          .png()
          .toBuffer();
        let resume: () => void = () => {},
          started: () => void = () => {};
        const blocked = new Promise<void>((resolve) => (resume = resolve)),
          entered = new Promise<void>((resolve) => (started = resolve));
        let calls = 0,
          executing: Promise<boolean> | undefined;
        try {
          const config = await db.providerConfiguration.update({
            where: { id: "global" },
            data: {
              encryptedKey: encryptKey("sk-synthetic-not-real"),
              status: "VERIFIED",
              verifiedAt: new Date(),
              verifiedRevision: previous.revision,
              imageModel: "gpt-image-1",
              creativeModel: "gpt-4.1-mini",
              quality: "low",
              resolution: "1024x1024",
              imageReserveMicros: 1n,
              models: compatibleModels(["gpt-image-1", "gpt-4.1-mini"]),
            },
          });
          provider.direct = async () => ({
            text: "Prompt sintético",
            usage: null,
          });
          provider.generate = async () => {
            calls++;
            started();
            await blocked;
            return { bytes: png, usage: null };
          };
          const job = await db.generationJob.create({
            data: {
              actorId: uid,
              projectId: project.id,
              idempotencyKey: randomUUID(),
              reservedMicros: 3n,
              snapshot: {
                prompt: "Prueba sintética",
                mode: "Imagen",
                index: 0,
                format: "1:1",
                configRevision: config.revision,
              },
            },
          });
          await db.usageLedger.create({
            data: {
              jobId: job.id,
              actorId: uid,
              projectId: project.id,
              model: "synthetic-lease",
              reservedMicros: 3n,
            },
          });
          const files = await db.storedAsset.count();
          executing = runOne({ id: job.id });
          await Promise.race([
            entered,
            new Promise((_, reject) =>
              setTimeout(
                () => reject(Error("No inició imagen sintética")),
                3000,
              ),
            ),
          ]);
          await db.generationJob.update({
            where: { id: job.id },
            data: { heartbeatAt: new Date(Date.now() - JOB_LEASE_MS - 1000) },
          });
          await recoverInterrupted();
          resume();
          await executing;
          assert.equal(calls, 1);
          assert.equal(
            await db.variation.count({ where: { jobId: job.id } }),
            0,
          );
          assert.equal(
            await db.imageVersion.count({ where: { sourceJobId: job.id } }),
            0,
          );
          assert.equal(await db.storedAsset.count(), files);
          assert.equal(
            (
              await db.generationJob.findUniqueOrThrow({
                where: { id: job.id },
              })
            ).status,
            "UNCERTAIN",
          );
          assert.equal(
            (
              await db.usageLedger.findUniqueOrThrow({
                where: { jobId: job.id },
              })
            ).status,
            "UNCERTAIN",
          );
          // Simulate a committed transaction whose acknowledgement is lost.
          const committed = await db.generationJob.create({
            data: {
              actorId: uid,
              projectId: project.id,
              idempotencyKey: randomUUID(),
              reservedMicros: 3n,
              snapshot: job.snapshot as any,
            },
          });
          await db.usageLedger.create({
            data: {
              jobId: committed.id,
              actorId: uid,
              projectId: project.id,
              model: "synthetic-lease",
              reservedMicros: 3n,
            },
          });
          const originalTransaction = db.$transaction.bind(db);
          let acknowledgementLost = false;
          try {
            (db as any).$transaction = async (...args: any[]) => {
              const result = await (originalTransaction as any)(...args);
              if (
                !acknowledgementLost &&
                (await db.imageVersion.count({
                  where: { sourceJobId: committed.id },
                }))
              ) {
                acknowledgementLost = true;
                throw Error("Acknowledgement lost after COMMIT · synthetic");
              }
              return result;
            };
            assert.equal(await runOne({ id: committed.id }), true);
          } finally {
            (db as any).$transaction = originalTransaction;
          }
          assert.equal(acknowledgementLost, true);
          const image = await db.variation.findUniqueOrThrow({
            where: { jobId: committed.id },
          });
          assert(
            (await (await import("../lib/storage")).load(image.path)).length >
              0,
          );
          assert.equal(
            (
              await db.generationJob.findUniqueOrThrow({
                where: { id: committed.id },
              })
            ).status,
            "COMPLETED",
          );
          assert.equal(
            (
              await db.usageLedger.findUniqueOrThrow({
                where: { jobId: committed.id },
              })
            ).status,
            "CONSUMED_ESTIMATE",
          );
          assert.equal(calls, 2);
        } finally {
          resume();
          await executing;
          provider.direct = originalDirect;
          provider.generate = originalGenerate;
          await db.providerConfiguration.update({
            where: { id: "global" },
            data: {
              ...previous,
              models: previous.models as any,
              alternatives: previous.alternatives as any,
            },
          });
        }
      },
    );
    await t.test(
      "credencial de gastos separada: OWNER, cifrado contextual, máscara, reemplazo y eliminación sin alterar generación",
      async () => {
        const { decryptKey } = await import("../lib/crypto"),
          { readDailyCosts, saveBillingCredential } =
            await import("../lib/billing-credentials");
        const { adapter } = await import("../lib/providers");
        const account = await db.user.findFirstOrThrow({
            where: { role: "OWNER", status: "APPROVED" },
          }),
          actor = { id: account.id, role: "OWNER" };
        const before = await db.providerConfiguration.findUniqueOrThrow({
            where: { id: "global" },
          }),
          key = "sk-synthetic-billing-secret-1234",
          replacement = "sk-synthetic-billing-replacement-5678";
        const path = "ai/billing-key?provider=openai";
        for (const client of [user, admin, observer, anonymous]) {
          const expected = client === anonymous ? 401 : 403;
          assert.equal((await client.call(path)).status, expected);
          assert.equal(
            (
              await client.call(path, "PUT", {
                provider: "openai",
                apiKey: key,
              })
            ).status,
            expected,
          );
          assert.equal((await client.call(path, "DELETE")).status, expected);
        }
        assert.equal(
          (
            await owner.call(path, "PUT", {
              provider: "openai",
              apiKey: "corta",
            })
          ).status,
          400,
        );
        assert.equal(
          (await owner.call(path, "PUT", { provider: "unknown", apiKey: key }))
            .status,
          400,
        );
        const saved = await owner.call(path, "PUT", {
          provider: "openai",
          apiKey: key,
        });
        assert.equal(saved.status, 200);
        assert.equal(saved.body.maskedKey, "••••••••1234");
        assert.equal(saved.body.configured, true);
        assert(!JSON.stringify(saved.body).includes(key));
        assert(!JSON.stringify(saved.body).includes("encryptedKey"));
        const stored = await db.providerBillingCredential.findUniqueOrThrow({
          where: { provider: "openai" },
        });
        assert.notEqual(stored.encryptedKey, key);
        assert.equal(
          decryptKey(stored.encryptedKey, "billing:openai:api-key"),
          key,
        );
        assert.throws(() => decryptKey(stored.encryptedKey));
        assert.deepEqual((await owner.call(path)).body, saved.body);
        await assert.rejects(
          saveBillingCredential(
            { id: uid, role: "OWNER" },
            { provider: "openai", apiKey: key },
          ),
          /cuenta cambió/,
        );
        const engine = adapter("openai"),
          original = engine.dailyCosts;
        let calls = 0;
        try {
          engine.dailyCosts = async (received) => {
            calls++;
            assert.equal(received, key);
            return {
              rows: [{ day: "2026-01-01", micros: "123" }],
              totalMicros: "123",
              rounded: false,
              fetchedAt: new Date().toISOString(),
            };
          };
          assert.equal(
            (await readDailyCosts(actor, "openai", "2026-01-01", "2026-01-01"))
              .totalMicros,
            "123",
          );
          assert.equal(calls, 1);
          assert.equal(
            (
              await owner.call(path, "PUT", {
                provider: "openai",
                apiKey: replacement,
              })
            ).body.maskedKey,
            "••••••••5678",
          );
          assert.equal(
            decryptKey(
              (
                await db.providerBillingCredential.findUniqueOrThrow({
                  where: { provider: "openai" },
                })
              ).encryptedKey,
              "billing:openai:api-key",
            ),
            replacement,
          );
          assert.equal((await owner.call(path, "DELETE")).status, 200);
          assert.equal((await owner.call(path)).body.configured, false);
          await assert.rejects(
            readDailyCosts(actor, "openai", "2026-01-01", "2026-01-01"),
            /credencial/,
          );
          assert.equal(calls, 1);
        } finally {
          engine.dailyCosts = original;
        }
        const after = await db.providerConfiguration.findUniqueOrThrow({
          where: { id: "global" },
        });
        assert.equal(after.encryptedKey, before.encryptedKey);
        assert.equal(after.revision, before.revision);
        assert.equal(after.status, before.status);
        const audit = JSON.stringify(
          await db.auditEvent.findMany({
            where: { action: { startsWith: "CREDENCIAL_GASTOS_" } },
          }),
        );
        assert(!audit.includes(key));
        assert(!audit.includes(replacement));
        assert(!audit.includes(stored.encryptedKey));
      },
    );
    await t.test(
      "conexiones múltiples: OWNER exclusivo, cifrado, claves separadas, revocación y metadatos sin catálogos",
      async () => {
        const previous = await db.providerConfiguration.findUniqueOrThrow({
            where: { id: "global" },
          }),
          profiles = await db.providerConnection.findMany();
        const { decryptKey } = await import("../lib/crypto"),
          { saveConnection } = await import("../lib/provider-connections");
        const secrets = [
          "synthetic-google-provider-key-9876",
          "synthetic-fal-provider-key-5432",
          "synthetic-replicate-provider-key-1098",
        ];
        try {
          for (const client of [user, admin, observer, anonymous]) {
            const status = client === anonymous ? 401 : 403;
            for (const path of [
              "ai/connections",
              "ai/connections?provider=google",
            ])
              assert.equal((await client.call(path)).status, status);
            assert.equal(
              (
                await client.call("ai/connections", "PUT", {
                  provider: "google",
                  apiKey: secrets[0],
                })
              ).status,
              status,
            );
            assert.equal(
              (await client.call("ai/connections/google", "DELETE")).status,
              status,
            );
            assert.equal(
              (await client.call("ai/connections/google/verify", "POST", {}))
                .status,
              status,
            );
          }
          assert.equal(
            (
              await owner.call("ai/connections", "PUT", {
                provider: "unknown",
                apiKey: secrets[0],
              })
            ).status,
            400,
          );
          for (const [i, provider] of [
            "google",
            "fal",
            "replicate",
          ].entries()) {
            const response = await owner.call("ai/connections", "PUT", {
              provider,
              apiKey: secrets[i],
            });
            assert.equal(response.status, 200);
            assert.equal(response.body.status, "UNVERIFIED");
            assert.deepEqual(response.body.models, []);
            assert(response.body.maskedKey.endsWith(secrets[i].slice(-4)));
            assert(!JSON.stringify(response.body).includes(secrets[i]));
            assert(!("encryptedKey" in response.body));
            const row = await db.providerConnection.findUniqueOrThrow({
              where: { provider },
            });
            assert.equal(decryptKey(row.encryptedKey!), secrets[i]);
            assert.notEqual(row.encryptedKey, secrets[i]);
          }
          const rows = (await owner.call("ai/connections")).body;
          assert.equal(rows.length, 4);
          assert(rows.some((p: any) => p.id === "google"));
          assert(
            rows.every((p: any) => !("encryptedKey" in p) && !("models" in p)),
          );
          const unchanged = await db.providerConfiguration.findUniqueOrThrow({
            where: { id: "global" },
          });
          assert.equal(unchanged.encryptedKey, previous.encryptedKey);
          assert.equal(unchanged.revision, previous.revision);
          assert.equal(
            (
              await owner.call("ai/connections/google/verify", "POST", {
                query: "sk-" + "secret".repeat(5),
              })
            ).status,
            400,
          );
          await assert.rejects(
            saveConnection(
              { id: uid, role: "OWNER" },
              { provider: "google", apiKey: secrets[1] },
            ),
            /cuenta cambió/,
          );
          assert.equal(
            (await owner.call("ai/connections/fal", "DELETE")).status,
            200,
          );
          assert.equal(
            (await owner.call("ai/connections?provider=fal")).body.configured,
            false,
          );
          assert.equal(
            (await owner.call("ai/connections?provider=google")).body
              .configured,
            true,
          );
          assert.equal(
            (await owner.call("ai/connections/fal/verify", "POST", {})).status,
            409,
          );
          const meta = (await owner.call("ai/config?meta=1")).body
            .configuration;
          assert(!("models" in meta));
          assert(!("creativeModels" in meta));
          assert(!("encryptedKey" in meta));
          assert.equal(typeof meta.dailyLimitMicros, "string");
          const audit = JSON.stringify(
            await db.auditEvent.findMany({
              where: { action: { startsWith: "PROVEEDOR_IA_" } },
            }),
          );
          for (const key of secrets) assert(!audit.includes(key));
          assert.equal(
            (
              await owner.call("ai/connections", "PUT", {
                provider: previous.provider,
                apiKey: "synthetic-active-replacement-5678",
              })
            ).status,
            200,
          );
          const revoked = await db.providerConfiguration.findUniqueOrThrow({
            where: { id: "global" },
          });
          assert.equal(revoked.status, "UNVERIFIED");
          assert.equal(revoked.imageModel, null);
          assert(revoked.revision > previous.revision);
        } finally {
          await db.$transaction(async (tx) => {
            await tx.providerConfiguration.update({
              where: { id: "global" },
              data: {
                ...previous,
                models: previous.models as any,
                alternatives: previous.alternatives as any,
              },
            });
            await tx.providerConnection.deleteMany();
            if (profiles.length)
              await tx.providerConnection.createMany({
                data: profiles.map((p) => ({ ...p, models: p.models as any })),
              });
          });
        }
      },
    );
    await t.test(
      "catálogo de conexión: consulta simulada real en servidor, conflicto de credenciales y errores sin secretos",
      async () => {
        const previous = await db.providerConfiguration.findUniqueOrThrow({
            where: { id: "global" },
          }),
          profiles = await db.providerConnection.findMany();
        const { adapter } = await import("../lib/providers"),
          { verifyConnection } = await import("../lib/provider-connections");
        const ownerAccount = await db.user.findFirstOrThrow({
            where: { role: "OWNER", status: "APPROVED" },
          }),
          actor = { id: ownerAccount.id, role: "OWNER" };
        const engine = adapter("google"),
          old = engine.listModels;
        const key = "synthetic-google-catalogue-secret-1234";
        const models: any[] = [
          {
            id: "gemini-nano-banana-2.1",
            label: "Nano Banana 2.1",
            kind: "image",
            qualities: ["default"],
            resolutions: ["1K"],
            supportsReferences: true,
          },
          {
            id: "gemini-2.5-flash",
            kind: "creative",
            qualities: [],
            resolutions: [],
          },
        ];
        let release: () => void = () => {};
        try {
          assert.equal(
            (
              await owner.call("ai/connections", "PUT", {
                provider: "google",
                apiKey: key,
              })
            ).status,
            200,
          );
          engine.listModels = async (received) => {
            assert.equal(received, key);
            return models;
          };
          const verified = await verifyConnection(actor, "google");
          assert.equal(verified.status, "VERIFIED");
          assert.deepEqual(verified.models, models);
          assert(!JSON.stringify(verified).includes(key));
          let entered: () => void = () => {};
          const started = new Promise<void>((r) => (entered = r)),
            blocked = new Promise<void>((r) => (release = r));
          engine.listModels = async () => {
            entered();
            await blocked;
            return models;
          };
          const pending = verifyConnection(actor, "google");
          const rejected = assert.rejects(pending, /cambió/);
          await started;
          assert.equal(
            (
              await owner.call("ai/connections", "PUT", {
                provider: "google",
                apiKey: "synthetic-new-catalogue-key-5678",
              })
            ).status,
            200,
          );
          release();
          await rejected;
          const current = await db.providerConnection.findUniqueOrThrow({
            where: { provider: "google" },
          });
          assert.equal(current.status, "UNVERIFIED");
          assert(current.maskedKey!.endsWith("5678"));
          assert.deepEqual(current.models, []);
          engine.listModels = async () => {
            throw Error(key);
          };
          await assert.rejects(
            verifyConnection(actor, "google"),
            (e) =>
              e instanceof Error &&
              !e.message.includes(key) &&
              /consultar/.test(e.message),
          );
          const failed = (await owner.call("ai/connections?provider=google"))
            .body;
          assert.equal(failed.status, "ERROR");
          assert(!JSON.stringify(failed).includes(key));
        } finally {
          release();
          engine.listModels = old;
          await db.$transaction(async (tx) => {
            await tx.providerConfiguration.update({
              where: { id: "global" },
              data: {
                ...previous,
                models: previous.models as any,
                alternatives: previous.alternatives as any,
              },
            });
            await tx.providerConnection.deleteMany();
            if (profiles.length)
              await tx.providerConnection.createMany({
                data: profiles.map((p) => ({ ...p, models: p.models as any })),
              });
          });
        }
      },
    );
    await t.test(
      "generación multiproveedor: Google dirige, fal.ai o Replicate generan, claves/catálogos cambiados no se cobran",
      async () => {
        const previous = await db.providerConfiguration.findUniqueOrThrow({
            where: { id: "global" },
          }),
          profiles = await db.providerConnection.findMany();
        const { adapter } = await import("../lib/providers"),
          { verifyConnection } = await import("../lib/provider-connections"),
          { imageCapability } = await import("../lib/providers/schema");
        const ownerAccount = await db.user.findFirstOrThrow({
            where: { role: "OWNER", status: "APPROVED" },
          }),
          actor = { id: ownerAccount.id, role: "OWNER" };
        const google = adapter("google"),
          fal = adapter("fal"),
          replicate = adapter("replicate"),
          openai = adapter("openai");
        const methods = [
          {
            engine: google,
            list: google.listModels,
            direct: google.direct,
            generate: google.generate,
          },
          {
            engine: fal,
            list: fal.listModels,
            direct: fal.direct,
            generate: fal.generate,
          },
          {
            engine: replicate,
            list: replicate.listModels,
            direct: replicate.direct,
            generate: replicate.generate,
          },
          {
            engine: openai,
            list: openai.listModels,
            direct: openai.direct,
            generate: openai.generate,
          },
        ];
        const googleKey = "synthetic-director-google-key-1234",
          imageKeys = {
            fal: "synthetic-image-fal-key-4567",
            replicate: "synthetic-image-replicate-key-8901",
          };
        const creative: any = {
          id: "gemini-2.5-flash",
          kind: "creative",
          qualities: [],
          resolutions: [],
        };
        const schema = {
          components: {
            schemas: {
              Input: {
                type: "object",
                required: ["prompt"],
                properties: {
                  prompt: { type: "string" },
                  aspect_ratio: { type: "string", enum: ["1:1", "16:9"] },
                  num_outputs: { type: "integer", minimum: 1, maximum: 4 },
                },
              },
            },
          },
        };
        const caps = {
          fal: imageCapability("fal-ai/flux/dev", "FLUX dev", schema)!,
          replicate: imageCapability(
            "black-forest-labs/flux-schnell",
            "FLUX schnell",
            schema,
            "a".repeat(64),
          )!,
        };
        const bytes = await (
          await import("sharp")
        )
          .default({
            create: {
              width: 64,
              height: 64,
              channels: 3,
              background: "#123456",
            },
          })
          .png()
          .toBuffer();
        let directions = 0,
          images = 0;
        try {
          const created = await owner.call("users", "POST", {
            name: "Usuario de proveedores",
            email: `providers-${tag}@example.test`,
            password,
            role: "USER",
          });
          assert.equal(created.status, 201);
          const account = created.body;
          const client = new Client();
          assert.equal(
            (
              await client.call("auth/login", "POST", {
                email: account.email,
                password,
              })
            ).status,
            200,
          );
          const project = (
            await client.call("projects", "POST", {
              name: "Multiproveedor " + tag,
            })
          ).body;
          const product = (
            await client.call(`projects/${project.id}/categories`, "POST", {
              name: "Producto FLUX",
            })
          ).body;
          const sub = (
            await client.call(`categories/${product.id}/subproducts`, "POST", {
              names: ["Tema de imágenes"],
            })
          ).body[0];
          assert.equal(
            (
              await owner.call("ai/connections", "PUT", {
                provider: "google",
                apiKey: googleKey,
              })
            ).status,
            200,
          );
          google.listModels = async () => [creative];
          google.direct = async (received) => {
            assert.equal(received, googleKey);
            directions++;
            return {
              text: JSON.stringify({
                backgroundPrompt: "Fondo de prueba",
                backgroundColor: "#ffffff",
                texts: [],
                logos: [],
              }),
              usage: { tokens: 42 },
            };
          };
          await verifyConnection(actor, "google");
          openai.direct = async () => {
            throw Error("No debe utilizar OpenAI");
          };
          openai.generate = async () => {
            throw Error("No debe utilizar OpenAI");
          };
          const readyJobs: any[] = [];
          for (const provider of ["fal", "replicate"] as const) {
            const engine = adapter(provider),
              cap = caps[provider];
            assert.equal(
              (
                await owner.call("ai/connections", "PUT", {
                  provider,
                  apiKey: imageKeys[provider],
                })
              ).status,
              200,
            );
            engine.listModels = async () => [cap];
            engine.generate = async (received, args) => {
              assert.equal(received, imageKeys[provider]);
              assert.equal(args.model, cap.id);
              assert.equal(args.capability?.id, cap.id);
              images++;
              return { bytes, usage: { requestId: "synthetic" } };
            };
            await verifyConnection(actor, provider);
            const { apiKey: _unused, ...base } = config;
            const saved = await owner.call("ai/config", "PUT", {
              ...base,
              provider,
              creativeProvider: "google",
              imageModel: cap.id,
              creativeModel: creative.id,
              quality: "default",
              resolution: "1:1",
              imageReserveMicros: "1000",
              monthlyLimitMicros: "999999999999999",
              dailyLimitMicros: "999999999999999",
              operationLimitMicros: "999999999999999",
            });
            assert.equal(saved.status, 200, saved.body.error);
            await connectionCheck();
            const c = await db.providerConfiguration.findUniqueOrThrow({
              where: { id: "global" },
            });
            const [job] = await reserveJobs(
              account.id,
              project.id,
              [
                {
                  subproductId: sub.id,
                  key: randomUUID(),
                  snapshot: {
                    prompt: "Tema de imágenes",
                    mode: "Imagen + Texto",
                    renderMode: "editable",
                    format: "1:1",
                    index: 0,
                  },
                },
              ],
              c.revision,
            );
            assert.equal((job.snapshot as any).imageProvider, provider);
            assert.equal((job.snapshot as any).creativeProvider, "google");
            assert((job.snapshot as any).imageCapabilityFingerprint);
            assert.equal(await runOne({ id: job.id }), true);
            const result = await db.generationJob.findUniqueOrThrow({
              where: { id: job.id },
            });
            assert.equal(result.status, "COMPLETED");
            assert.equal(result.leaseToken, null);
            const ledger = await db.usageLedger.findUniqueOrThrow({
              where: { jobId: job.id },
            });
            assert.equal(ledger.actualMicros, null);
            assert.equal(ledger.model, cap.id);
            const variation = await db.variation.findUniqueOrThrow({
              where: { jobId: job.id },
            });
            assert(
              (await (await import("../lib/storage")).load(variation.path))
                .length > 0,
            );
            readyJobs.push(job);
          }
          assert.equal(directions, 2);
          assert.equal(images, 2);
          const view = (await client.call("jobs/list?project=" + project.id))
            .body;
          assert.equal(view.total, 2);
          assert(
            view.rows.every(
              (j: any) => j.status === "COMPLETED" && j.actualMicros === null,
            ),
          );
          const c = await db.providerConfiguration.findUniqueOrThrow({
            where: { id: "global" },
          });
          const item = () => ({
            subproductId: sub.id,
            key: randomUUID(),
            snapshot: {
              prompt: "Tema de imágenes",
              mode: "Imagen + Texto",
              renderMode: "editable",
              format: "1:1",
              index: 0,
            },
          });
          const [oldCredentialJob] = await reserveJobs(
            account.id,
            project.id,
            [item()],
            c.revision,
          );
          assert.equal(
            (
              await owner.call("ai/connections", "PUT", {
                provider: "google",
                apiKey: "synthetic-new-director-key-5678",
              })
            ).status,
            200,
          );
          await verifyConnection(actor, "google");
          await runOne({ id: oldCredentialJob.id });
          assert.equal(
            (
              await db.generationJob.findUniqueOrThrow({
                where: { id: oldCredentialJob.id },
              })
            ).status,
            "FAILED",
          );
          assert.equal(
            (
              await db.usageLedger.findUniqueOrThrow({
                where: { jobId: oldCredentialJob.id },
              })
            ).status,
            "RELEASED",
          );
          assert.equal(directions, 2);
          assert.equal(images, 2);
          const [oldModelJob] = await reserveJobs(
            account.id,
            project.id,
            [item()],
            c.revision,
          );
          await db.providerConfiguration.update({
            where: { id: "global" },
            data: {
              models: [
                {
                  ...caps.replicate,
                  binding: {
                    ...caps.replicate.binding,
                    version: "b".repeat(64),
                  },
                },
              ],
            },
          });
          await runOne({ id: oldModelJob.id });
          assert.equal(
            (
              await db.generationJob.findUniqueOrThrow({
                where: { id: oldModelJob.id },
              })
            ).status,
            "FAILED",
          );
          assert.equal(
            (
              await db.usageLedger.findUniqueOrThrow({
                where: { jobId: oldModelJob.id },
              })
            ).status,
            "RELEASED",
          );
          assert.equal(images, 2);
          assert.equal(directions, 2);
        } finally {
          for (const method of methods) {
            method.engine.listModels = method.list;
            method.engine.direct = method.direct;
            method.engine.generate = method.generate;
          }
          await db.$transaction(async (tx) => {
            await tx.providerConfiguration.update({
              where: { id: "global" },
              data: {
                ...previous,
                models: previous.models as any,
                alternatives: previous.alternatives as any,
              },
            });
            await tx.providerConnection.deleteMany();
            if (profiles.length)
              await tx.providerConnection.createMany({
                data: profiles.map((p) => ({ ...p, models: p.models as any })),
              });
          });
        }
      },
    );
    await t.test(
      "solo planes: OWNER e Ilimitado ignoran ceros heredados, reserva automática, idempotencia y saldo desconocido",
      async () => {
        const old = await db.providerConfiguration.findUniqueOrThrow({
          where: { id: "global" },
        });
        const account = await db.user.findUniqueOrThrow({ where: { id: uid } });
        const ownerId = (await owner.call("auth/me")).body.id;
        const plan = await db.membershipPlan.findUniqueOrThrow({
          where: { id: "INICIO" },
        });
        const jobIds: string[] = [];
        try {
          const c = await db.providerConfiguration.update({
            where: { id: "global" },
            data: {
              provider: "openai",
              creativeProvider: "openai",
              encryptedKey: (await import("../lib/crypto")).encryptKey(
                "synthetic-plan-test-not-real-1234",
              ),
              imageModel: "gpt-image-1",
              creativeModel: "gpt-4.1-mini",
              quality: "low",
              resolution: "1024x1024",
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
              monthlyLimitMicros: 0n,
              dailyLimitMicros: 0n,
              operationLimitMicros: 0n,
              imageReserveMicros: 10000000n,
              maxGenerations: 1,
              status: "VERIFIED",
              verifiedAt: new Date(),
              verifiedRevision: old.revision,
            },
          });
          const payload = () => ({
            key: randomUUID(),
            snapshot: { prompt: "Sin doble presupuesto" },
          });
          const items = [payload(), payload()];
          const jobs = await reserveJobs(ownerId, pid, items, c.revision);
          jobIds.push(...jobs.map((j) => j.id));
          assert(jobs.every((j) => j.reservedMicros === 0n));
          assert.deepEqual(
            (await reserveJobs(ownerId, pid, items, c.revision)).map(
              (j) => j.id,
            ),
            jobs.map((j) => j.id),
          );
          assert.equal(
            (await owner.call("ai/config")).body.testBudget.allowed,
            true,
          );
          await db.providerConfiguration.update({
            where: { id: "global" },
            data: { imageReserveMicros: 0n },
          });
          const { configured } = await import("../lib/ai");
          await configured();
          await db.user.update({
            where: { id: uid },
            data: { planId: "ILIMITADO", planValidUntil: null },
          });
          const unlimited = await reserveJobs(
            uid,
            pid,
            [payload(), payload()],
            c.revision,
          );
          jobIds.push(...unlimited.map((j) => j.id));
          assert(unlimited.every((j) => j.reservedMicros === 0n));
          await db.membershipPlan.update({
            where: { id: "INICIO" },
            data: { monthlyImages: 20, monthlyAIMicros: 10000000n },
          });
          // Cuenta nueva para comprobar una cuota sin consumos de escenarios previos.
          const fresh = await db.user.create({
            data: {
              name: "Solo plan",
              email: "plan-only-" + randomUUID() + "@example.test",
              passwordHash: account.passwordHash,
              status: "APPROVED",
              role: "USER",
              planId: "INICIO",
            },
          });
          try {
            const allocated = await reserveJobs(
              fresh.id,
              pid,
              [payload()],
              c.revision,
            );
            jobIds.push(...allocated.map((j) => j.id));
            assert.equal(allocated[0].reservedMicros, 500000n);
            const ledger = await db.usageLedger.findUniqueOrThrow({
              where: { jobId: allocated[0].id },
            });
            assert.equal(ledger.actualMicros, null);
            await db.user.update({
              where: { id: fresh.id },
              data: { planValidUntil: new Date(Date.now() - 1000) },
            });
            await assert.rejects(
              reserveJobs(fresh.id, pid, [payload()], c.revision),
              /vencido/,
            );
          } finally {
            await db.usageLedger.deleteMany({ where: { actorId: fresh.id } });
            await db.generationJob.deleteMany({ where: { actorId: fresh.id } });
            await db.user.delete({ where: { id: fresh.id } });
          }
        } finally {
          await db.usageLedger.deleteMany({ where: { jobId: { in: jobIds } } });
          await db.generationJob.deleteMany({ where: { id: { in: jobIds } } });
          await db.user.update({
            where: { id: uid },
            data: {
              planId: account.planId,
              planValidUntil: account.planValidUntil,
            },
          });
          await db.membershipPlan.update({
            where: { id: plan.id },
            data: {
              monthlyImages: plan.monthlyImages,
              monthlyAIMicros: plan.monthlyAIMicros,
            },
          });
          await db.providerConfiguration.update({
            where: { id: "global" },
            data: {
              ...old,
              models: old.models as any,
              alternatives: old.alternatives as any,
            },
          });
        }
      },
    );
    await t.test(
      "modelos y límites se guardan independientemente sin invalidar la conexión al guardar presupuesto",
      async () => {
        const previous = await db.providerConfiguration.findUniqueOrThrow({
          where: { id: "global" },
        });
        try {
          await owner.call("ai/config", "PUT", config);
          const row = await db.providerConfiguration.update({
            where: { id: "global" },
            data: {
              status: "VERIFIED",
              verifiedAt: new Date(),
              verifiedRevision: {
                set: (
                  await db.providerConfiguration.findUniqueOrThrow({
                    where: { id: "global" },
                  })
                ).revision,
              },
            },
          });
          for (const client of [user, admin, observer, anonymous])
            assert(
              [401, 403].includes(
                (
                  await client.call("ai/budgets", "PUT", {
                    monthlyLimitMicros: "999999",
                    dailyLimitMicros: "999999",
                    operationLimitMicros: "999999",
                    imageReserveMicros: "10000",
                    maxGenerations: 5,
                  })
                ).status,
              ),
            );
          assert.equal(
            (
              await owner.call("ai/budgets", "PUT", {
                monthlyLimitMicros: "9000000",
                dailyLimitMicros: "8000000",
                operationLimitMicros: "7000000",
                imageReserveMicros: "10000",
                maxGenerations: 5,
              })
            ).status,
            200,
          );
          const b = await db.providerConfiguration.findUniqueOrThrow({
            where: { id: "global" },
          });
          assert.equal(b.revision, row.revision);
          assert.equal(b.status, "VERIFIED");
          assert.equal(b.encryptedKey, row.encryptedKey);
          assert.equal(b.imageReserveMicros, 10000n);
          assert.equal(
            (
              await owner.call("ai/models", "PUT", {
                ...config,
                monthlyLimitMicros: "1",
                imageReserveMicros: "1",
              })
            ).status,
            200,
          );
          const c = await db.providerConfiguration.findUniqueOrThrow({
            where: { id: "global" },
          });
          assert.equal(c.monthlyLimitMicros, 9000000n);
          assert.equal(c.imageReserveMicros, 10000n);
          assert.equal(c.status, "UNVERIFIED");
          assert(c.revision > b.revision);
        } finally {
          await db.providerConfiguration.update({
            where: { id: "global" },
            data: {
              ...previous,
              models: previous.models as any,
              alternatives: previous.alternatives as any,
            },
          });
        }
      },
    );
    await t.test(
      "planes públicos, asignación OWNER, vencimiento, cuotas y concurrencia por mes de Lima",
      async () => {
        const plans = await import("../lib/membership-plans");
        const old = await db.user.findUniqueOrThrow({ where: { id: uid } }),
          p = await db.membershipPlan.findUniqueOrThrow({
            where: { id: "INICIO" },
          });
        const catalog = await anonymous.call("plans/public");
        assert.equal(catalog.status, 200);
        assert.equal(catalog.body.length, 3);
        assert(!JSON.stringify(catalog.body).includes("ILIMITADO"));
        assert.equal(
          catalog.body.find((p: any) => p.id === "INICIO").priceCents,
          2000,
        );
        for (const client of [user, admin, observer, anonymous])
          assert(
            [401, 403].includes(
              (
                await client.call("users/" + uid + "/plan", "PUT", {
                  planId: "ILIMITADO",
                })
              ).status,
            ),
          );
        const ledger: string[] = [];
        try {
          assert.equal(
            (
              await owner.call("users/" + uid + "/plan", "PUT", {
                planId: "INICIO",
              })
            ).status,
            200,
          );
          await db.membershipPlan.update({
            where: { id: "INICIO" },
            data: { monthlyImages: 1, monthlyAIMicros: 1000000n },
          });
          // Un usuario nuevo evita que consumos de otras pruebas falseen el cupo.
          const u = await db.user.create({
            data: {
              name: "Cuota planes",
              email: "quota-" + randomUUID() + "@example.test",
              passwordHash: old.passwordHash,
              role: "USER",
              status: "APPROVED",
              planId: "INICIO",
            },
          });
          const outcomes = await Promise.allSettled(
            Array.from({ length: 4 }, () =>
              db.$transaction(async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
                await plans.checkPlanAllowance(tx, u.id, 1, 100000n);
                const row = await tx.usageLedger.create({
                  data: {
                    jobId: "quota-" + randomUUID(),
                    actorId: u.id,
                    projectId: "quota-test",
                    model: "test",
                    reservedMicros: 100000n,
                    status: "RESERVED",
                  },
                });
                ledger.push(row.id);
              }),
            ),
          );
          assert.equal(
            outcomes.filter((r) => r.status === "fulfilled").length,
            1,
          );
          await db.usageLedger.update({
            where: { id: ledger[0] },
            data: { status: "RELEASED" },
          });
          await db.$transaction((tx) =>
            plans.checkPlanAllowance(tx, u.id, 1, 100000n),
          );
          await assert.rejects(
            db.$transaction((tx) =>
              plans.checkPlanAllowance(tx, u.id, 1, 2000000n),
            ),
            /presupuesto mensual/,
          );
          await db.user.update({
            where: { id: u.id },
            data: { planId: "ILIMITADO" },
          });
          await db.$transaction((tx) =>
            plans.checkPlanAllowance(tx, u.id, 500000, 999999999999n),
          );
          await db.user.update({
            where: { id: u.id },
            data: { planValidUntil: new Date(Date.now() - 10000) },
          });
          await assert.rejects(
            db.$transaction((tx) => plans.checkPlanAllowance(tx, u.id, 1, 1n)),
            /vencido/,
          );
          assert.equal(
            plans
              .membershipMonth(new Date("2026-11-01T04:59:59Z"))
              .toISOString(),
            "2026-10-01T05:00:00.000Z",
          );
          assert.equal(
            plans
              .membershipMonth(new Date("2026-11-01T05:00:00Z"))
              .toISOString(),
            "2026-11-01T05:00:00.000Z",
          );
          assert.equal(
            (
              await owner.call("plans/INICIO", "PUT", {
                name: "Inicio",
                description: "Prueba",
                priceCents: 2000,
                monthlyImages: null,
                monthlyAIMicros: null,
              })
            ).status,
            400,
          );
          await db.usageLedger.deleteMany({ where: { actorId: u.id } });
          await db.user.delete({ where: { id: u.id } });
        } finally {
          await db.membershipPlan.update({ where: { id: p.id }, data: p });
          await db.user.update({
            where: { id: uid },
            data: { planId: old.planId, planValidUntil: old.planValidUntil },
          });
        }
      },
    );
    await t.test(
      "pagos Mercado Pago y PayPal: cifrado, vendedor/importe/firma, idempotencia y Sandbox sin acceso real",
      async () => {
        const pay = await import("../lib/plan-payments");
        const { createHmac } = await import("node:crypto");
        const actor = {
            id: (await owner.call("auth/me")).body.id,
            role: "OWNER",
          },
          buyer = { id: uid, role: "USER" };
        const oldUser = await db.user.findUniqueOrThrow({ where: { id: uid } });
        const originals = await db.paymentConnection.findMany();
        const fetchOriginal = globalThis.fetch;
        const ppKeys = {
            clientId: "synthetic-client-id",
            clientSecret: "synthetic-client-secret-1234",
            webhookId: "WEBHOOK12345678",
          },
          mpKeys = {
            accessToken: "synthetic-mercadopago-token-1234",
            webhookSecret: "synthetic-webhook-secret-1234",
          };
        let currentOrder: any = null,
          wrongAmount = false,
          postOrders = 0,
          captures = 0,
          mpOrder: any = null;
        try {
          for (const client of [user, admin, observer, anonymous])
            assert(
              [401, 403].includes(
                (await client.call("payments/connections")).status,
              ),
            );
          assert.equal(
            (
              await owner.call("payments/connections", "PUT", {
                provider: "paypal",
                mode: "LIVE",
                currency: "USD",
                exchangeRateMicros: "1000000",
                merchantId: "MERCHANT123",
                enabled: true,
                credentials: ppKeys,
              })
            ).status,
            200,
          );
          assert.equal(
            (
              await owner.call("payments/connections", "PUT", {
                provider: "mercadopago",
                mode: "SANDBOX",
                currency: "PEN",
                exchangeRateMicros: "3800000",
                merchantId: "123456",
                enabled: true,
                credentials: mpKeys,
              })
            ).status,
            200,
          );
          const visible = (await owner.call("payments/connections")).body;
          assert(!JSON.stringify(visible).includes(ppKeys.clientSecret));
          assert(!JSON.stringify(visible).includes(mpKeys.accessToken));
          assert(
            (
              await db.paymentConnection.findUniqueOrThrow({
                where: { provider: "paypal" },
              })
            ).encryptedCredentials !== ppKeys.clientSecret,
          );
          const noSig = await fetchOriginal(
            root + "/api/payments/webhook/mercadopago?data.id=123",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "payment" }),
            },
          );
          assert.equal(noSig.status, 401);
          globalThis.fetch = async (url, init) => {
            const u = String(url);
            if (u.startsWith(root)) return fetchOriginal(url, init);
            const body = init?.body
              ? JSON.parse(
                  String(init.body).startsWith("{") ? String(init.body) : "{}",
                )
              : {};
            if (u.endsWith("/v1/oauth2/token"))
              return Response.json({ access_token: "synthetic-oauth-token" });
            if (u === "https://api.mercadopago.com/users/me")
              return Response.json({ id: 123456 });
            if (u.endsWith("/v2/checkout/orders") && init?.method === "POST") {
              postOrders++;
              return Response.json({
                id: "PAYPALORDER123",
                links: [
                  {
                    rel: "payer-action",
                    href: "https://www.paypal.com/checkoutnow?token=PAYPALORDER123",
                  },
                ],
              });
            }
            if (u.endsWith("/capture")) {
              captures++;
              return Response.json({ status: "COMPLETED" });
            }
            if (u.endsWith("/verify-webhook-signature"))
              return Response.json({ verification_status: "SUCCESS" });
            if (u.includes("/v2/checkout/orders/PAYPALORDER123"))
              return Response.json({
                status: "COMPLETED",
                purchase_units: [
                  {
                    custom_id: currentOrder.id,
                    payee: { merchant_id: "MERCHANT123" },
                    payments: {
                      captures: [
                        {
                          id: "CAPTURE12345",
                          status: "COMPLETED",
                          amount: {
                            currency_code: "USD",
                            value: wrongAmount ? "0.01" : "20.00",
                          },
                          final_capture: true,
                        },
                      ],
                    },
                  },
                ],
              });
            if (u.endsWith("/checkout/preferences"))
              return Response.json({
                id: "pref-123",
                sandbox_init_point:
                  "https://sandbox.mercadopago.com.pe/checkout/v1/redirect?pref_id=pref-123",
              });
            if (u.endsWith("/v1/payments/12345678"))
              return Response.json({
                external_reference: mpOrder.id,
                status: "approved",
                collector_id: 123456,
                currency_id: "PEN",
                transaction_amount: 76,
                live_mode: false,
                transaction_amount_refunded: 0,
              });
            throw Error("Llamada inesperada de prueba: " + new URL(u).pathname);
          };
          await pay.verifyPaymentConnection(actor, "paypal");
          await pay.verifyPaymentConnection(actor, "mercadopago");
          assert.equal((await pay.paymentOptions()).length, 2);
          const key = randomUUID();
          currentOrder = await pay.createPlanPurchase(buyer, {
            provider: "paypal",
            planId: "INICIO",
            requestId: key,
          });
          assert.equal(currentOrder.amountCents, 2000);
          assert.equal(
            (
              await pay.createPlanPurchase(buyer, {
                provider: "paypal",
                planId: "INICIO",
                requestId: key,
              })
            ).id,
            currentOrder.id,
          );
          assert.equal(postOrders, 1);
          await assert.rejects(
            pay.refreshPurchase({ id: aid, role: "ADMIN" }, currentOrder.id),
            /no encontrada/,
          );
          wrongAmount = true;
          await assert.rejects(
            pay.refreshPurchase(buyer, currentOrder.id),
            /no coincide/,
          );
          assert.equal(
            (await db.user.findUniqueOrThrow({ where: { id: uid } })).planId,
            oldUser.planId,
          );
          wrongAmount = false;
          const result = await pay.refreshPurchase(
            buyer,
            currentOrder.id,
            true,
          );
          assert.equal(result.status, "PAID");
          assert.equal(captures, 1);
          const active = await db.user.findUniqueOrThrow({
            where: { id: uid },
          });
          assert.equal(active.planId, "INICIO");
          assert(active.planValidUntil! > new Date());
          await pay.refreshPurchase(buyer, currentOrder.id, true);
          assert.equal(captures, 1);
          assert.equal(
            (
              await db.user.findUniqueOrThrow({ where: { id: uid } })
            ).planValidUntil?.toISOString(),
            active.planValidUntil?.toISOString(),
          );
          const webhook = new Headers({
            "paypal-auth-algo": "SHA256withRSA",
            "paypal-cert-url": "https://api.paypal.com/cert",
            "paypal-transmission-id": "id",
            "paypal-transmission-sig": "sig",
            "paypal-transmission-time": new Date().toISOString(),
          });
          await pay.paymentWebhook("paypal", webhook, new URLSearchParams(), {
            event_type: "PAYMENT.CAPTURE.COMPLETED",
            resource: {
              supplementary_data: {
                related_ids: { order_id: "PAYPALORDER123" },
              },
            },
          });
          assert.equal(
            (
              await db.user.findUniqueOrThrow({ where: { id: uid } })
            ).planValidUntil?.toISOString(),
            active.planValidUntil?.toISOString(),
          );
          mpOrder = await pay.createPlanPurchase(buyer, {
            provider: "mercadopago",
            planId: "INICIO",
            requestId: randomUUID(),
          });
          assert.equal(mpOrder.amountCents, 7600);
          const ts = String(Math.floor(Date.now() / 1000)),
            requestId = "synthetic-request",
            signature = createHmac("sha256", mpKeys.webhookSecret)
              .update(`id:12345678;request-id:${requestId};ts:${ts};`)
              .digest("hex");
          await assert.rejects(
            pay.paymentWebhook(
              "mercadopago",
              new Headers({
                "x-signature": `ts=${ts},v1=${"0".repeat(64)}`,
                "x-request-id": requestId,
              }),
              new URLSearchParams({ "data.id": "12345678" }),
              { type: "payment" },
            ),
            /inválida/,
          );
          await pay.paymentWebhook(
            "mercadopago",
            new Headers({
              "x-signature": `ts=${ts},v1=${signature}`,
              "x-request-id": requestId,
            }),
            new URLSearchParams({ "data.id": "12345678" }),
            { type: "payment" },
          );
          assert.equal(
            (
              await db.planPurchase.findUniqueOrThrow({
                where: { id: mpOrder.id },
              })
            ).status,
            "TEST_COMPLETED",
          );
          assert.equal(
            (
              await db.user.findUniqueOrThrow({ where: { id: uid } })
            ).planValidUntil?.toISOString(),
            active.planValidUntil?.toISOString(),
          );
          assert.equal(
            (
              await db.auditEvent.findMany({
                where: { action: { startsWith: "PAGO_" } },
              })
            ).some((r) =>
              JSON.stringify(r.detail).includes(mpKeys.accessToken),
            ),
            false,
          );
        } finally {
          globalThis.fetch = fetchOriginal;
          await db.user.update({
            where: { id: uid },
            data: {
              planId: oldUser.planId,
              planValidUntil: oldUser.planValidUntil,
            },
          });
          await db.paymentConnection.deleteMany();
          for (const c of originals)
            await db.paymentConnection.create({
              data: { ...c, maskedCredentials: c.maskedCredentials as any },
            });
        }
      },
    );

    await t.test(
      "planes personalizados por correo: varios, asignación automática, privacidad y retiro sin perder cuotas",
      async () => {
        const old = await db.user.findUniqueOrThrow({ where: { id: uid } }),
          email = old.email;
        const ids: string[] = [];
        const create = {
          name: "Campaña privada " + tag,
          email,
          priceCents: 3500,
          monthlyImages: 70,
          monthlyAIMicros: "18000000",
        };
        try {
          for (const client of [user, admin, observer, anonymous])
            assert(
              [401, 403].includes(
                (await client.call("plans/custom", "POST", create)).status,
              ),
            );
          const missing = await owner.call("plans/custom", "POST", {
            ...create,
            email: "missing-" + tag + "@example.test",
          });
          assert.equal(missing.status, 404);
          const first = await owner.call("plans/custom", "POST", create);
          assert.equal(first.status, 201, JSON.stringify(first.body));
          ids.push(first.body.id);
          const second = await owner.call("plans/custom", "POST", {
            ...create,
            name: "Segundo plan " + tag,
            priceCents: 4500,
          });
          assert.equal(second.status, 201);
          ids.push(second.body.id);
          assert.equal(
            (await db.user.findUniqueOrThrow({ where: { id: uid } })).planId,
            ids[1],
          );
          const list = await owner.call("plans");
          const custom = list.body.filter((p: any) => ids.includes(p.id));
          assert.equal(custom.length, 2);
          assert(
            custom.every(
              (p: any) =>
                p.customUserId === uid &&
                p.customUser.email === email &&
                !p.isPublic &&
                p.description === "",
            ),
          );
          const publicCatalog = await anonymous.call("plans/public");
          assert(!JSON.stringify(publicCatalog.body).includes(create.name));
          assert(!JSON.stringify(publicCatalog.body).includes(email));
          assert(!publicCatalog.body.some((p: any) => ids.includes(p.id)));
          assert(
            (await user.call("plans/available")).body.some(
              (p: any) => p.id === ids[0],
            ),
          );
          assert(
            !(await admin.call("plans/available")).body.some((p: any) =>
              ids.includes(p.id),
            ),
          );
          assert.equal(
            (
              await owner.call("users/" + aid + "/plan", "PUT", {
                planId: ids[0],
              })
            ).status,
            403,
          );
          const update = await owner.call("plans/" + ids[0], "PUT", {
            name: "Renombrado " + tag,
            description: "No debe conservarse",
            priceCents: 3900,
            monthlyImages: 80,
            monthlyAIMicros: "19000000",
          });
          assert.equal(update.status, 200);
          const edited = await db.membershipPlan.findUniqueOrThrow({
            where: { id: ids[0] },
          });
          assert.equal(edited.description, "");
          assert.equal(edited.isPublic, false);
          assert.equal(
            (
              await owner.call("users/" + uid + "/plan", "PUT", {
                planId: ids[0],
              })
            ).status,
            200,
          );
          assert.equal(
            (await owner.call("plans/" + ids[0], "DELETE")).status,
            200,
          );
          assert.equal(
            (await db.user.findUniqueOrThrow({ where: { id: uid } })).planId,
            ids[0],
          );
          assert(
            (
              await db.membershipPlan.findUniqueOrThrow({
                where: { id: ids[0] },
              })
            ).archivedAt,
          );
          assert(
            !(await owner.call("plans")).body.some((p: any) => p.id === ids[0]),
          );
          assert.equal(
            (
              await owner.call("users/" + uid + "/plan", "PUT", {
                planId: ids[0],
              })
            ).status,
            404,
          );
          assert.equal(
            (
              await owner.call("plans/" + ids[0], "PUT", {
                name: "x",
                description: "",
                priceCents: 1,
                monthlyImages: 1,
                monthlyAIMicros: "1",
              })
            ).status,
            409,
          );
          const users = (await owner.call("users")).body;
          assert.equal(
            users.find((u: any) => u.id === uid).plan.name,
            "Renombrado " + tag,
          );
          assert.equal(
            (
              await user.call("payments/purchases", "POST", {
                provider: "paypal",
                planId: ids[0],
                requestId: randomUUID(),
              })
            ).status,
            404,
          );
        } finally {
          await db.user.update({
            where: { id: uid },
            data: { planId: old.planId, planValidUntil: old.planValidUntil },
          });
          await db.membershipPlan.deleteMany({ where: { id: { in: ids } } });
        }
      },
    );
    await t.test('Legal: páginas públicas, compatibilidad de sitio previo y solicitudes privadas atendidas solo por OWNER',async()=>{
      const before=await db.siteContent.findUnique({where:{id:'public'}}),{defaultSite}=await import('../lib/site-content');
      try{
        const {legal,...legacy}=defaultSite;await db.siteContent.upsert({where:{id:'public'},create:{id:'public',content:legacy},update:{content:legacy}});
        for(const path of ['/privacidad','/terminos','/eliminacion-de-datos','/solicitudes-de-privacidad']){const r=await fetch(root+path);assert.equal(r.status,200,path);const html=await r.text();assert(html.includes('CAMARA NACIONAL DE NEGOCIOS SAC'));assert(html.includes('PULPO ANALISIS Y AUTO'));assert(!html.includes('mailto:'));assert(!html.includes('name="password"'));}
        const site=(await owner.call('site/admin')).body;assert.equal(site.content.legal.contactEmail,'');assert(site.content.legal.privacyText.length>200);assert.equal(site.content.hero.title,legacy.hero.title);
        for(const c of [user,admin,observer,anonymous])assert([401,403].includes((await c.call('site/legal','PUT',{revision:site.revision,value:site.content.legal})).status));
        const updated=await owner.call('site/legal','PUT',{revision:site.revision,value:{...site.content.legal,privacyText:site.content.legal.privacyText+'\n\n<script>window.privateLeak=1</script>'}});assert.equal(updated.status,200);const html=await(await fetch(root+'/privacidad')).text();assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>window.privateLeak=1</script>'));
        assert.equal((await owner.call('site/legal','PUT',{revision:site.revision,value:site.content.legal})).status,409);
        const input={kind:'DELETE_META',name:'Persona prueba',email:'privacy.'+Date.now()+'@example.test',message:'Solicito eliminar los datos importados de mi cuenta publicitaria de prueba.',consent:true,website:''};
        assert.equal((await anonymous.call('site/privacy-requests','POST',input,'https://untrusted.example')).status,403);
        assert.equal((await anonymous.call('site/privacy-requests','POST',{...input,consent:false})).status,400);
        assert.equal((await anonymous.call('site/privacy-requests','POST',{...input,website:'spam'})).status,400);
        const userCount=await db.user.count(),metaCount=await db.metaAdAccount.count();const created=await anonymous.call('site/privacy-requests','POST',input);assert.equal(created.status,201);assert(/^[a-f0-9]{64}$/.test(created.body.receipt));assert(!JSON.stringify(created.body).includes(input.email));const stored=await db.privacyRequest.findUniqueOrThrow({where:{id:created.body.id}});assert.notEqual(stored.receiptHash,created.body.receipt);assert.equal(stored.origin,new URL(root).origin);
        const lookup=await anonymous.call('site/privacy-requests/lookup','POST',{receipt:created.body.receipt});assert.equal(lookup.status,200);assert.equal(lookup.body.status,'PENDING');assert(!JSON.stringify(lookup.body).includes(input.message));assert(!JSON.stringify(lookup.body).includes(input.email));assert(!JSON.stringify(lookup.body).includes(stored.receiptHash));assert.equal((await anonymous.call('site/privacy-requests/lookup','POST',{receipt:'f'.repeat(64)})).status,404);
        for(const c of [user,admin,observer,anonymous]){assert([401,403].includes((await c.call('site/privacy-requests')).status));assert([401,403].includes((await c.call('site/privacy-requests/'+stored.id,'PATCH',{status:'CLOSED',reply:'No autorizado',revision:stored.updatedAt.toISOString()})).status));}
        const list=await owner.call('site/privacy-requests?status=PENDING&page=1');assert.equal(list.status,200);assert(list.body.items.some((r:any)=>r.email===input.email));assert(!JSON.stringify(list.body).includes(stored.receiptHash));
        const answer={status:'IN_REVIEW',reply:'Recibimos tu solicitud. Confirma el identificador de la cuenta afectada para revisar el alcance.',revision:stored.updatedAt.toISOString()};assert.equal((await owner.call('site/privacy-requests/'+stored.id,'PATCH',answer)).status,200);assert.equal((await owner.call('site/privacy-requests/'+stored.id,'PATCH',answer)).status,409);
        const answered=await anonymous.call('site/privacy-requests/lookup','POST',{receipt:created.body.receipt});assert.equal(answered.body.reply,answer.reply);assert.equal(answered.body.status,'IN_REVIEW');assert.equal(await db.user.count(),userCount);assert.equal(await db.metaAdAccount.count(),metaCount);
        for(let i=1;i<5;i++)assert.equal((await anonymous.call('site/privacy-requests','POST',input)).status,201);assert.equal((await anonymous.call('site/privacy-requests','POST',input)).status,429);
      }finally{if(before)await db.siteContent.upsert({where:{id:'public'},create:{...before,content:before.content as any},update:{...before,content:before.content as any}});else await db.siteContent.deleteMany({where:{id:'public'}});}
    });
    await t.test(
      "página pública editable OWNER: secciones persistidas, conflicto entre pestañas y testimonios sin inventar",
      async () => {
        const previous = await db.siteContent.findUnique({
          where: { id: "public" },
        });
        try {
          for (const client of [user, admin, observer, anonymous])
            assert(
              [401, 403].includes((await client.call("site/admin")).status),
            );
          const original = (await owner.call("site/admin")).body;
          assert.equal(original.content.testimonials.enabled, false);
          assert.equal(original.content.testimonials.items.length, 0);
          for (const client of [user, admin, observer, anonymous])
            assert(
              [401, 403].includes(
                (
                  await client.call("site/hero", "PUT", {
                    revision: original.revision,
                    value: original.content.hero,
                  })
                ).status,
              ),
            );
          const title = "Campañas de prueba " + tag;
          const r = await owner.call("site/hero", "PUT", {
            revision: original.revision,
            value: { ...original.content.hero, title },
          });
          assert.equal(r.status, 200);
          assert.equal(r.body.revision, original.revision + 1);
          assert.equal(
            (
              await owner.call("site/hero", "PUT", {
                revision: original.revision,
                value: original.content.hero,
              })
            ).status,
            409,
          );
          const publicContent = await anonymous.call("site/public");
          assert.equal(publicContent.body.content.hero.title, title);
          assert(!JSON.stringify(publicContent.body).includes("encrypted"));
          assert.equal(
            (
              await owner.call("site/testimonials", "PUT", {
                revision: r.body.revision,
                value: { enabled: true, title: "Clientes", items: [] },
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await owner.call("site/hero", "PUT", {
                revision: r.body.revision,
                value: {
                  ...original.content.hero,
                  title: "",
                  html: "<script>",
                },
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await owner.call("site/__proto__", "PUT", {
                revision: r.body.revision,
                value: {},
              })
            ).status,
            404,
          );
          const response = await fetch(root + "/plans");
          assert.equal(response.status, 200);
          const html = await response.text();
          assert(html.includes(title));
          assert(html.includes("Funcionalidades"));
          assert(!html.includes("Lo que cuentan nuestros clientes"));
          assert(!html.includes("CUSTOM_"));
        } finally {
          if (previous)
            await db.siteContent.upsert({
              where: { id: "public" },
              create: { ...previous, content: previous.content as any },
              update: { ...previous, content: previous.content as any },
            });
          else await db.siteContent.deleteMany({ where: { id: "public" } });
        }
      },
    );

    await t.test(
      "explorador: jerarquía según permisos, carpetas anidadas, movimientos atómicos sin ciclos y documentos privados",
      async () => {
        const privateProject = (
          await owner.call("projects", "POST", {
            name: "Biblioteca privada no compartida " + tag,
          })
        ).body;
        const tree = await user.call("library/tree");
        assert.equal(tree.status, 200);
        assert(
          !tree.body.some((n: any) => n.id === "project:" + privateProject.id),
        );
        assert(
          [403, 404].includes(
            (await user.call("library/explorer?project=" + privateProject.id))
              .status,
          ),
        );
        assert(tree.body.some((n: any) => n.id === "project:" + pid));
        const create = async (
          name: string,
          destination: string | null = null,
        ) =>
          (
            await user.call("library/folder-actions", "POST", {
              action: "create",
              name,
              destination,
            })
          ).body;
        const a = await create("Carpeta A"),
          b = await create("Carpeta B", "folder:" + a.id),
          c = await create("Carpeta C", "folder:" + b.id),
          dest = await create("Destino");
        assert.equal(
          (
            await user.call("library/folder-actions", "POST", {
              action: "move",
              ids: [a.id],
              destination: "folder:" + c.id,
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await admin.call("library/folder-actions", "POST", {
              action: "move",
              ids: [a.id],
              destination: null,
            })
          ).status,
          404,
        );
        assert.equal(
          (
            await observer.call("library/folder-actions", "POST", {
              action: "create",
              name: "No",
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await user.call("library/folder-actions", "POST", {
              action: "move",
              ids: [a.id, b.id],
              destination: "folder:" + dest.id,
            })
          ).status,
          200,
        );
        assert.equal(
          (await db.libraryFolder.findUniqueOrThrow({ where: { id: b.id } }))
            .parentId,
          a.id,
        );
        const form = new FormData();
        form.set(
          "file",
          new File(["Documento privado"], "manual.txt", { type: "text/plain" }),
        );
        form.set("folderId", c.id);
        const oversized = new FormData();
        oversized.set(
          "file",
          new File([new Uint8Array(3200000)], "large.txt", {
            type: "text/plain",
          }),
        );
        assert.equal(
          (
            await fetch(root + "/api/library/documents", {
              method: "POST",
              headers: { Origin: root, Cookie: user.cookie },
              body: oversized,
            })
          ).status,
          413,
        );
        const uploaded = await fetch(root + "/api/library/documents", {
          method: "POST",
          headers: { Origin: root, Cookie: user.cookie },
          body: form,
        });
        assert.equal(uploaded.status, 201);
        const doc = await uploaded.json();
        const get = await fetch(root + "/api/library/documents/" + doc.id, {
          headers: { Cookie: user.cookie },
        });
        assert.equal(await get.text(), "Documento privado");
        assert.equal(
          (await admin.call("library/documents/" + doc.id)).status,
          404,
        );
        const before = await db.libraryDocument.count();
        assert.equal(
          (
            await user.call("library/folder-actions", "POST", {
              action: "delete",
              ids: [dest.id],
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await db.libraryDocument.findUniqueOrThrow({
              where: { id: doc.id },
            })
          ).folderId,
          null,
        );
        assert.equal(await db.libraryDocument.count(), before);
        assert.equal(
          (await user.call("library/documents/" + doc.id, "DELETE")).status,
          200,
        );
        const anchored = await create(
          "Archivos del proyecto",
          "project:" + pid,
        );
        assert.equal(
          (
            await db.libraryFolder.findUniqueOrThrow({
              where: { id: anchored.id },
            })
          ).anchorScope,
          "project",
        );
        const options = await user.call("library/explorer?project=" + pid);
        assert.equal(options.status, 200);
        assert(
          options.body.tree.some(
            (n: any) =>
              n.id === "folder:" + anchored.id &&
              n.parentId === "project:" + pid,
          ),
        );
        await user.call("library/folder-actions", "POST", {
          action: "delete",
          ids: [anchored.id],
        });
      },
    );
    await t.test(
      "primera muestra: ninguna llamada antes de aprobar, aprobación conserva el mismo archivo y resto del lote pasa a Biblioteca",
      async () => {
        const { adapter } = await import("../lib/providers"),
          { encryptKey } = await import("../lib/crypto"),
          { processJob } = await import("../lib/jobs");
        const previous = await db.providerConfiguration.findUniqueOrThrow({
            where: { id: "global" },
          }),
          provider = adapter("openai"),
          direct = provider.direct;
        let calls = 0;
        try {
          const c = await db.providerConfiguration.update({
            where: { id: "global" },
            data: {
              provider: "openai",
              creativeProvider: "openai",
              encryptedKey: encryptKey("synthetic-preview-not-real-1234"),
              imageModel: "gpt-image-1",
              creativeModel: "gpt-4.1-mini",
              quality: "low",
              resolution: "1024x1024",
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
              status: "VERIFIED",
              verifiedAt: new Date(),
              verifiedRevision: previous.revision,
            },
          });
          const group = randomUUID(),
            jobs = await reserveJobs(
              uid,
              pid,
              [0, 1, 2].map((index) => ({
                subproductId: sid,
                key: randomUUID(),
                snapshot: {
                  prompt: "Prueba local de muestra",
                  mode: "Texto",
                  format: "1:1",
                  renderMode: "editable",
                  index,
                  previewFirst: true,
                  approvalGroup: group,
                },
              })),
              c.revision,
            );
          provider.direct = async () => {
            calls++;
            return {
              text: JSON.stringify({
                backgroundPrompt: "",
                backgroundColor: "#ffffff",
                texts: [],
                logos: [],
              }),
              usage: null,
            };
          };
          assert.equal(await runOne({ id: jobs[1].id }), false);
          assert.equal(calls, 0);
          assert.equal(
            (await user.call("jobs/" + jobs[1].id + "/process", "POST")).status,
            409,
          );
          assert.equal(calls, 0);
          await processJob({ id: uid, role: "USER" }, jobs[0].id);
          assert.equal(calls, 1);
          const first = await db.variation.findUniqueOrThrow({
              where: { jobId: jobs[0].id },
            }),
            path = first.path;
          assert.equal(
            (await observer.call("jobs/" + jobs[0].id + "/approve", "POST"))
              .status,
            403,
          );
          assert.equal(
            (await admin.call("jobs/" + jobs[0].id + "/approve", "POST"))
              .status,
            403,
          );
          const approval = await user.call(
            "jobs/" + jobs[0].id + "/approve",
            "POST",
          );
          assert.equal(approval.status, 200);
          assert.equal(approval.body.pending.length, 2);
          assert.equal(calls, 1);
          assert.equal(
            (await db.variation.findUniqueOrThrow({ where: { id: first.id } }))
              .path,
            path,
          );
          assert.equal(
            (await db.variation.findUniqueOrThrow({ where: { id: first.id } }))
              .permanent,
            true,
          );
          await processJob({ id: uid, role: "USER" }, jobs[1].id);
          assert.equal(calls, 2);
          const second = await db.variation.findUniqueOrThrow({
            where: { jobId: jobs[1].id },
          });
          assert.equal(second.reviewStatus, "APPROVED");
          assert.equal(second.permanent, true);
          const folder = (
            await user.call("library/folder-actions", "POST", {
              action: "create",
              name: "Afiches seleccionados",
            })
          ).body;
          const assetCount = await db.storedAsset.count();
          assert.equal(
            (
              await user.call("library/item-actions", "POST", {
                action: "move",
                ids: [second.id],
                folderId: folder.id,
              })
            ).status,
            200,
          );
          const moved = await user.call(
            "library/explorer?folder=folder:" + folder.id,
          );
          assert.equal(moved.status, 200);
          assert(moved.body.items.some((v: any) => v.id === second.id));
          assert.equal(await db.storedAsset.count(), assetCount);
          assert.equal(
            (
              await admin.call("library/item-actions", "POST", {
                action: "move",
                ids: [second.id],
                folderId: folder.id,
              })
            ).status,
            404,
          );
          assert.equal(
            (await db.variation.findUniqueOrThrow({ where: { id: second.id } }))
              .path,
            second.path,
          );

          const removedProject = (
            await owner.call("projects", "POST", {
              name: "Biblioteca de proyecto borrado",
            })
          ).body;
          const removedJob = await db.generationJob.create({
            data: {
              actorId: (await owner.call("auth/me")).body.id,
              projectId: removedProject.id,
              status: "COMPLETED",
              snapshot: {},
              idempotencyKey: randomUUID(),
              reservedMicros: 0n,
            },
          });
          const removedVariation = await db.variation.create({
            data: {
              jobId: removedJob.id,
              path: second.path,
              model: "doble-explícito",
              reviewStatus: "APPROVED",
              permanent: true,
              expiresAt: new Date(Date.now() + 86400000),
            },
          });
          await owner.call("projects/" + removedProject.id, "DELETE");
          assert(
            !(await owner.call("library/explorer?limit=100")).body.items.some(
              (v: any) => v.id === removedVariation.id,
            ),
          );
          const explorer = await user.call("library/explorer?project=" + pid);
          assert.equal(explorer.status, 200);
          assert(!explorer.body.items.some((v: any) => v.id === second.id)); // Moving removes the entry from its prior folder, without changing the source project.
          const listed = await user.call(
            "jobs/list?project=" + pid + "&size=100",
          );
          assert(
            !JSON.stringify(listed.body.rows).includes(
              "Prueba local de muestra",
            ),
          );
          assert.equal(
            (
              await user.call("library/item-actions", "POST", {
                action: "remove",
                ids: [second.id],
              })
            ).status,
            200,
          );
          assert(
            !(
              await user.call("library/explorer?project=" + pid)
            ).body.items.some((v: any) => v.id === second.id),
          );
          assert.equal(
            (await db.variation.findUniqueOrThrow({ where: { id: second.id } }))
              .path,
            second.path,
          );
          await user.call("jobs/" + jobs[2].id + "/cancel", "POST");
        } finally {
          provider.direct = direct;
          await db.providerConfiguration.update({
            where: { id: "global" },
            data: {
              ...previous,
              models: previous.models as any,
              alternatives: previous.alternatives as any,
            },
          });
        }
      },
    );
    async function withOrderProvider(
      fn: (c: any, calls: () => number) => Promise<void>,
    ) {
      const { adapter } = await import("../lib/providers"),
        { encryptKey } = await import("../lib/crypto");
      const previous = await db.providerConfiguration.findUniqueOrThrow({
          where: { id: "global" },
        }),
        provider = adapter("openai"),
        original = provider.direct;
      let count = 0;
      try {
        const c = await db.providerConfiguration.update({
          where: { id: "global" },
          data: {
            provider: "openai",
            creativeProvider: "openai",
            encryptedKey: encryptKey("synthetic-order-test-not-real-1234"),
            imageModel: "gpt-image-1",
            creativeModel: "gpt-4.1-mini",
            quality: "low",
            resolution: "1024x1024",
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
            status: "VERIFIED",
            verifiedAt: new Date(),
            verifiedRevision: previous.revision,
          },
        });
        provider.direct = async () => {
          count++;
          return {
            text: JSON.stringify({
              backgroundPrompt: "",
              backgroundColor: "#ffffff",
              texts: [],
              logos: [],
            }),
            usage: null,
          };
        };
        await fn(c, () => count);
      } finally {
        provider.direct = original;
        await db.providerConfiguration.update({
          where: { id: "global" },
          data: previous as any,
        });
      }
    }
    await t.test("aprobar conserva la muestra ante bloqueo y permite continuar solo pendientes tras corregir la causa",async()=>withOrderProvider(async(config,calls)=>{
      const {orderTick}=await import("../lib/generation-orders"),{p,s}=await hierarchyForReview(),actor=await db.user.findFirstOrThrow({where:{role:"OWNER",status:"APPROVED"}}),group=randomUUID();
      const jobs=await reserveJobs(actor.id,p.id,[0,1].map(index=>({subproductId:s.id,key:randomUUID(),snapshot:{prompt:"Prueba de aprobación y continuación",mode:"Texto",format:"1:1",renderMode:"editable",index,previewFirst:true,approvalGroup:group}})),config.revision);
      const created=await owner.call("orders","POST",{ids:jobs.map(j=>j.id),requestId:randomUUID(),mode:"immediate"});assert.equal(created.status,202);const id=created.body.orders[0];let order=await db.generationOrder.findUniqueOrThrow({where:{id}});
      assert.equal(await orderTick(id,order.runId!),"CONTINUE");assert.equal(await orderTick(id,order.runId!),"REVIEW");assert.equal(calls(),1);
      const original=await db.variation.findUniqueOrThrow({where:{jobId:jobs[0].id}}),originalBytes=await (await import("../lib/storage")).load(original.path),firstLedger=await db.usageLedger.findUniqueOrThrow({where:{jobId:jobs[0].id}});
      // A continuation error after the approval commit must not turn approval into an HTTP error.
      await db.generationJob.update({where:{id:jobs[1].id},data:{status:"UNCERTAIN"}});
      const approved=await owner.call(`orders/${id}/approve`,"POST",{jobId:jobs[0].id});assert.equal(approved.status,200);assert.equal(approved.body.sample.reviewStatus,"APPROVED");assert.equal(approved.body.status,"NEEDS_REVIEW");assert.equal(approved.body.canContinuePending,false);assert.equal((await owner.call(`orders/${id}/resume`,"POST",{})).status,409);assert.equal(calls(),1);
      // Explicit test setup restores a job that has never called the provider.
      await db.generationJob.update({where:{id:jobs[1].id},data:{status:"PENDING"}});
      assert.equal((await owner.call(`orders/${id}/resume`,"POST",{})).status,200);order=await db.generationOrder.findUniqueOrThrow({where:{id}});
      await db.providerConfiguration.update({where:{id:"global"},data:{verifiedAt:new Date(Date.now()-90000000)}});
      try{assert.equal(await orderTick(id,order.runId!),"STOP");}finally{await db.providerConfiguration.update({where:{id:"global"},data:{verifiedAt:config.verifiedAt}});}
      let summary=(await owner.call(`orders?ids=${id}`)).body[0];assert.equal(summary.status,"NEEDS_REVIEW");assert.equal(summary.completed,1);assert.equal(summary.pending,1);assert.equal(summary.canContinuePending,true);assert.equal(summary.needsConnectionReview,true);assert(summary.error.includes("verificar la conexión"));assert.equal(calls(),1);
      const inLibrary=(await owner.call(`library/explorer?project=${p.id}&product=${s.categoryId}&subproduct=${s.id}`)).body.orders.find((o:any)=>o.id===id);assert.equal(inLibrary.canContinuePending,true);assert.equal(inLibrary.error,summary.error);
      assert.equal((await observer.call(`orders/${id}/resume`,"POST",{})).status,403);assert.equal((await user.call(`orders/${id}/resume`,"POST",{})).status,403);
      const attempts=await Promise.all([owner.call(`orders/${id}/resume`,"POST",{}),owner.call(`orders/${id}/resume`,"POST",{})]);assert(attempts.every(r=>r.status===200));order=await db.generationOrder.findUniqueOrThrow({where:{id}});assert.notEqual(order.runId,null);
      assert.equal(await orderTick(id,order.runId!),"CONTINUE");assert.equal(await orderTick(id,order.runId!),"STOP");assert.equal(calls(),2);summary=(await owner.call(`orders?ids=${id}`)).body[0];assert.equal(summary.status,"COMPLETED");assert.equal(summary.completed,2);
      const after=await db.variation.findUniqueOrThrow({where:{id:original.id}});assert.equal(after.reviewStatus,"APPROVED");assert.equal(after.revision,original.revision);assert((await (await import("../lib/storage")).load(after.path)).equals(originalBytes));assert.deepEqual(await db.usageLedger.findUniqueOrThrow({where:{jobId:jobs[0].id}}),firstLedger);
      for(const status of ["FAILED","UNCERTAIN","RUNNING"]){await db.generationOrder.update({where:{id},data:{status:"NEEDS_REVIEW"}});await db.generationJob.update({where:{id:jobs[1].id},data:{status}});assert.equal((await owner.call(`orders/${id}/resume`,"POST",{})).status,409);assert.equal((await owner.call(`orders?ids=${id}`)).body[0].canContinuePending,false);}
      await db.generationJob.update({where:{id:jobs[1].id},data:{status:"COMPLETED"}});await db.generationOrder.update({where:{id},data:{status:"COMPLETED",error:null}});assert.equal(calls(),2);
    }));
    await t.test("arranque concurrente continúa si el mismo ejecutor ya fue confirmado y se detiene ante pausa u otro ejecutor",async()=>withOrderProvider(async(config,calls)=>{
      const {registerOrders,orderTick}=await import("../lib/generation-orders"),{p,s}=await hierarchyForReview(),actor=await db.user.findFirstOrThrow({where:{role:"OWNER",status:"APPROVED"}});
      for(const winner of ["same","other","paused"]){
        const jobs=await reserveJobs(actor.id,p.id,[{subproductId:s.id,key:randomUUID(),snapshot:{prompt:"Prueba de carrera de arranque",mode:"Texto",format:"1:1",renderMode:"editable",index:0}}],config.revision),ids=await registerOrders(actor,jobs.map(j=>j.id),"background",randomUUID()),id=ids[0],runId="synthetic-start-race-"+randomUUID();
        await db.generationOrder.update({where:{id},data:{status:"STARTING",runId:null}});
        const original=db.generationOrder.updateMany.bind(db.generationOrder);let injected=false;
        db.generationOrder.updateMany=(async(args:any)=>{
          if(!injected&&args.where?.id===id&&args.where?.status==="STARTING"){
            injected=true;await original({where:{id},data:{status:winner==="paused"?"PAUSED":"ACTIVE",runId:winner==="other"?"another-run":runId}});
          }
          return original(args);
        }) as typeof db.generationOrder.updateMany;
        try{assert.equal(await orderTick(id,runId),winner==="same"?"CONTINUE":"STOP");assert.equal(injected,true);}finally{db.generationOrder.updateMany=original;}
        assert.equal((await db.generationJob.findUniqueOrThrow({where:{id:jobs[0].id}})).status,winner==="same"?"COMPLETED":"PENDING");
        await owner.call(`orders/${id}/stop`,"POST",{});
      }
      assert.equal(calls(),1);
    }));
    await t.test("Workflow local aprueba la primera muestra y completa la segunda tipográfica sin IA ni duplicar la primera",async()=>withOrderProvider(async(config,calls)=>{
      const {p,s}=await hierarchyForReview(),actor=await db.user.findFirstOrThrow({where:{role:"OWNER",status:"APPROVED"}}),group=randomUUID();
      const jobs=await reserveJobs(actor.id,p.id,[0,1].map(index=>({subproductId:s.id,key:randomUUID(),snapshot:{prompt:"Título: MUESTRA LOCAL DE APROBACIÓN\nOferta: TEXTO AUTORIZADO\nPrecio: Pago único $40 USD",mode:"Texto",format:"1:1",renderMode:"flat",index,previewFirst:true,approvalGroup:group}})),config.revision);
      const registered=await owner.call("orders","POST",{ids:jobs.map(j=>j.id),requestId:randomUUID(),mode:"background"});assert.equal(registered.status,202);const id=registered.body.orders[0];
      const wait=async(status:string)=>{for(let i=0;i<150;i++){const order=await db.generationOrder.findUniqueOrThrow({where:{id}});if(order.status===status)return order;if(["NEEDS_REVIEW","DISPATCH_UNCERTAIN"].includes(order.status))assert.fail("La orden local no llegó a "+status+": "+order.error);await new Promise(resolve=>setTimeout(resolve,100));}assert.fail("Workflow local no alcanzó "+status);};
      try{
      const review=await wait("REVIEW"),first=await db.variation.findUniqueOrThrow({where:{jobId:jobs[0].id}}),path=first.path;
      assert.equal(await db.variation.count({where:{jobId:{in:jobs.map(j=>j.id)}}}),1);
      const approved=await owner.call(`orders/${id}/approve`,"POST",{jobId:jobs[0].id});assert.equal(approved.status,200);await wait("COMPLETED");
      const final=await db.generationOrder.findUniqueOrThrow({where:{id}});assert.notEqual(final.runId,review.runId);assert.equal(await db.variation.count({where:{jobId:{in:jobs.map(j=>j.id)}}}),2);
      const kept=await db.variation.findUniqueOrThrow({where:{id:first.id}});assert.equal(kept.path,path);assert.equal(kept.revision,first.revision);assert.equal(kept.reviewStatus,"APPROVED");assert.equal(await db.imageVersion.count({where:{variationId:first.id}}),1);
      const ledgers=await db.usageLedger.findMany({where:{jobId:{in:jobs.map(j=>j.id)}}});assert(ledgers.every(row=>row.actualMicros===0n));assert.equal(calls(),0);
      }finally{await owner.call(`orders/${id}/stop`,"POST",{});}
    }));
    await t.test(
      "orden 7: progreso propio, muestra, pausa 4/7, detener y finalizar 4/4 sin cambiar ledger histórico",
      async () =>
        withOrderProvider(async (c, calls) => {
          const { orderTick } = await import("../lib/generation-orders");
          const group = randomUUID();
          const jobs = await reserveJobs(
            uid,
            pid,
            Array.from({ length: 7 }, (_, index) => ({
              subproductId: sid,
              key: randomUUID(),
              snapshot: {
                index,
                prompt: "Prueba sintética de siete imágenes",
                mode: "Texto",
                format: "1:1",
                renderMode: "editable",
                previewFirst: true,
                approvalGroup: group,
              },
            })),
            c.revision,
          );
          const payload = {
            ids: jobs.map((j) => j.id),
            mode: "immediate",
            requestId: randomUUID(),
          };
          const launched = await user.call("orders", "POST", payload);
          assert.equal(launched.status, 202);
          assert.equal(launched.body.orders.length, 1);
          const id = launched.body.orders[0],
            record = await db.generationOrder.findUniqueOrThrow({
              where: { id },
            }),
            runId = record.runId!;
          assert.equal(calls(), 0);
          assert.equal(
            (await user.call("orders", "POST", payload)).body.orders[0],
            id,
          );
          assert.equal(
            (await admin.call(`orders/${id}/pause`, "POST", {})).status,
            403,
          );
          assert.equal(
            (await observer.call(`orders/${id}/pause`, "POST", {})).status,
            403,
          );
          assert.equal(await runOne({ id: jobs[0].id }), false);
          assert.equal(
            (await user.call(`jobs/${jobs[0].id}/process`, "POST", {})).status,
            409,
          );
          assert.equal(await orderTick(id, runId), "CONTINUE");
          assert.equal(calls(), 1);
          assert.equal(await orderTick(id, runId), "REVIEW");
          assert.equal(calls(), 1);
          let library = await user.call(
            `library/explorer?project=${pid}&product=${cid}&subproduct=${sid}`,
          );
          assert.equal(library.status, 200);
          let progress = library.body.orders.find((o: any) => o.id === id);
          assert.equal(progress.completed, 1);
          assert.equal(progress.target, 7);
          assert.equal(progress.pending, 6);
          assert.equal(progress.requested, 7);
          const first = await db.variation.findUniqueOrThrow({
            where: { jobId: jobs[0].id },
          });
          assert(library.body.items.some((v: any) => v.id === first.id));
          const ownerPending = await owner.call(
            `library/explorer?project=${pid}&product=${cid}&subproduct=${sid}`,
          );
          assert.equal(ownerPending.status, 200);
          assert(ownerPending.body.items.some((v: any) => v.id === first.id));
          assert(
            !JSON.stringify(progress).includes(
              "Prueba sintética de siete imágenes",
            ),
          );
          const approved = await user.call(`orders/${id}/approve`, "POST", {
            jobId: jobs[0].id,
          });
          assert.equal(approved.status, 200);
          assert.equal(calls(), 1);
          const resumed = await db.generationOrder.findUniqueOrThrow({
            where: { id },
          });
          for (let i = 0; i < 3; i++)
            assert.equal(await orderTick(id, resumed.runId!), "CONTINUE");
          assert.equal(calls(), 4);
          await user.call(`orders/${id}/pause`, "POST", {});
          assert.equal(await orderTick(id, resumed.runId!), "STOP");
          assert.equal(calls(), 4);
          progress = (
            await user.call(
              `library/explorer?project=${pid}&product=${cid}&subproduct=${sid}`,
            )
          ).body.orders.find((o: any) => o.id === id);
          assert.equal(progress.completed, 4);
          assert.equal(progress.target, 7);
          assert.equal(progress.pending, 3);
          assert.equal(progress.status, "PAUSED");
          const before = await db.usageLedger.findMany({
            where: { jobId: { in: jobs.slice(0, 4).map((j) => j.id) } },
            orderBy: { jobId: "asc" },
          });
          assert.equal(
            (await user.call(`orders/${id}/stop`, "POST", {})).status,
            200,
          );
          progress = (await user.call(`orders?ids=${id}`)).body[0];
          assert.equal(progress.cancelled, 3);
          assert.equal(progress.completed, 4);
          assert.equal(progress.target, 7);
          assert.equal(
            (
              await user.call(`orders/${id}/finish`, "POST", {
                expectedCompleted: 3,
              })
            ).status,
            409,
          );
          const finished = await user.call(`orders/${id}/finish`, "POST", {
            expectedCompleted: 4,
          });
          assert.equal(finished.status, 200);
          assert.equal(finished.body.status, "ACCEPTED");
          assert.equal(finished.body.target, 4);
          assert.equal(finished.body.requested, 7);
          assert.equal(finished.body.completed, 4);
          assert.deepEqual(
            await db.usageLedger.findMany({
              where: { jobId: { in: jobs.slice(0, 4).map((j) => j.id) } },
              orderBy: { jobId: "asc" },
            }),
            before,
          );
          assert.equal(
            (await user.call(`orders/${id}/resume`, "POST", {})).status,
            409,
          );
          assert.equal(calls(), 4);
          const closed = await db.variation.findMany({
            where: { jobId: { in: jobs.slice(0, 4).map((j) => j.id) } },
          });
          assert(
            closed.every((v) => v.permanent && v.reviewStatus === "APPROVED"),
          );
          assert.equal(
            (await user.call(`orders/${id}/finish`, "POST", {})).status,
            200,
          );
        }),
    );
    await t.test(
      "orden: detener durante la imagen actual no la cancela ni autoriza la siguiente",
      async () =>
        withOrderProvider(async (c, calls) => {
          const { orderTick } = await import("../lib/generation-orders"),
            { adapter } = await import("../lib/providers");
          const jobs = await reserveJobs(
            uid,
            pid,
            [0, 1, 2].map((index) => ({
              subproductId: sid,
              key: randomUUID(),
              snapshot: {
                index,
                prompt: "Detención sintética",
                mode: "Texto",
                format: "1:1",
                renderMode: "editable",
              },
            })),
            c.revision,
          );
          const launched = await user.call("orders", "POST", {
              ids: jobs.map((j) => j.id),
              mode: "immediate",
              requestId: randomUUID(),
            }),
            id = launched.body.orders[0],
            record = await db.generationOrder.findUniqueOrThrow({
              where: { id },
            });
          const provider = adapter("openai"),
            direct = provider.direct;
          let release!: () => void;
          provider.direct = async (...args: Parameters<typeof direct>) => {
            await new Promise<void>((resolve) => {
              release = resolve;
            });
            return direct(...args);
          };
          try {
            const inFlight = orderTick(id, record.runId!);
            for (let i = 0; i < 200 && !release; i++)
              await new Promise((r) => setTimeout(r, 5));
            assert(release);
            await user.call(`orders/${id}/stop`, "POST", {});
            assert.equal(
              (await user.call(`orders/${id}/finish`, "POST", {})).status,
              409,
            );
            assert.equal(
              (
                await db.generationJob.findUniqueOrThrow({
                  where: { id: jobs[0].id },
                })
              ).status,
              "RUNNING",
            );
            assert.equal(
              await db.generationJob.count({
                where: {
                  id: { in: jobs.map((j) => j.id) },
                  status: "CANCELLED",
                },
              }),
              2,
            );
            release();
            await inFlight;
            assert.equal(calls(), 1);
            assert.equal(await orderTick(id, record.runId!), "STOP");
            const done = await user.call(`orders/${id}/finish`, "POST", {});
            assert.equal(done.status, 200);
            assert.equal(done.body.target, 1);
            assert.equal(done.body.requested, 3);
          } finally {
            release?.();
            provider.direct = direct;
          }
        }),
    );
    await t.test(
      "colas: usuario respeta órdenes previas; sistema serializa cuentas y pausa no consume proveedor",
      async () =>
        withOrderProvider(async (c, calls) => {
          const { registerOrders, orderTick, pauseOrder, stopOrder } =
            await import("../lib/generation-orders");
          async function create(
            actorId: string,
            mode: "user-queue" | "system-queue",
            name: string,
          ) {
            const jobs = await reserveJobs(
              actorId,
              pid,
              [
                {
                  subproductId: sid,
                  key: randomUUID(),
                  snapshot: {
                    index: 0,
                    prompt: name,
                    mode: "Texto",
                    format: "1:1",
                    renderMode: "editable",
                  },
                },
              ],
              c.revision,
            );
            const actor = {
              id: actorId,
              role: actorId === uid ? "USER" : "OWNER",
            };
            const [id] = await registerOrders(
              actor,
              jobs.map((j) => j.id),
              mode,
              randomUUID(),
            );
            await db.generationOrder.update({
              where: { id },
              data: { status: "ACTIVE", runId: id },
            });
            return { id, actor, jobs };
          }
          const first = await create(
            uid,
            "user-queue",
            "Primera orden usuario",
          );
          await new Promise((r) => setTimeout(r, 5));
          const next = await create(uid, "user-queue", "Segunda orden usuario");
          assert.equal(await orderTick(next.id, next.id), "WAIT");
          assert.equal(calls(), 0);
          await pauseOrder(first.actor, first.id);
          assert.equal(await orderTick(next.id, next.id), "CONTINUE");
          assert.equal(calls(), 1);
          assert.equal(await orderTick(next.id, next.id), "STOP");
          await stopOrder(first.actor, first.id);
          const ownerId = (
            await db.user.findFirstOrThrow({
              where: { role: "OWNER", name: "Owner prueba" },
            })
          ).id;
          const systemFirst = await create(
            ownerId,
            "system-queue",
            "Primera del sistema",
          );
          await new Promise((r) => setTimeout(r, 5));
          const systemNext = await create(
            uid,
            "system-queue",
            "Segunda del sistema",
          );
          assert.equal(await orderTick(systemNext.id, systemNext.id), "WAIT");
          assert.equal(calls(), 1);
          assert.equal(
            await orderTick(systemFirst.id, systemFirst.id),
            "CONTINUE",
          );
          assert.equal(await orderTick(systemFirst.id, systemFirst.id), "STOP");
          assert.equal(
            await orderTick(systemNext.id, systemNext.id),
            "CONTINUE",
          );
          assert.equal(await orderTick(systemNext.id, systemNext.id), "STOP");
          assert.equal(calls(), 3);
        }),
    );
    await t.test(
      "editor aplanado: original como fondo, texto y formas nuevas, versiones, permisos y eliminación sin IA",
      async () => {
        const { store } = await import("../lib/storage"),
          sharp = (await import("sharp")).default;
        const bytes = await sharp({
            create: {
              width: 1024,
              height: 1024,
              channels: 3,
              background: "#176b59",
            },
          })
            .png()
            .toBuffer(),
          path = await store(bytes);
        const job = await db.generationJob.create({
          data: {
            actorId: uid,
            projectId: pid,
            subproductId: sid,
            idempotencyKey: randomUUID(),
            status: "COMPLETED",
            snapshot: { prompt: "Texto privado no expuesto", index: 0 },
            reservedMicros: 0n,
          },
        });
        const image = await db.variation.create({
          data: {
            jobId: job.id,
            subproductId: sid,
            path,
            model: "doble-explicito-overlay",
            expiresAt: new Date(Date.now() + 86400000),
          },
        });
        await db.imageVersion.create({
          data: {
            variationId: image.id,
            number: 1,
            path,
            actorId: uid,
            sourceJobId: job.id,
          },
        });
        const beforeJobs = await db.generationJob.count(),
          beforeLedger = await db.usageLedger.count();
        assert.equal(
          (
            await observer.call(
              `variations/${image.id}/enable-layers`,
              "POST",
              { expectedRevision: 1 },
            )
          ).status,
          403,
        );
        const enabled = await user.call(
          `variations/${image.id}/enable-layers`,
          "POST",
          { expectedRevision: 1 },
        );
        assert.equal(enabled.status, 200);
        const design = (await user.call(`variations/${image.id}/design`)).body;
        assert.equal(design.hasBackground, true);
        assert.equal(design.document.layers.length, 0);
        assert(!JSON.stringify(design).includes("Texto privado"));
        const layerVersion = await db.imageVersion.findUniqueOrThrow({
          where: { variationId_number: { variationId: image.id, number: 2 } },
        });
        assert.equal(layerVersion.path, path);
        assert.equal(layerVersion.backgroundPath, path);
        assert.equal(
          (
            await user.call(`variations/${image.id}/enable-layers`, "POST", {
              expectedRevision: 1,
            })
          ).status,
          409,
        );
        const document = {
          ...design.document,
          layers: [
            {
              id: "cover",
              type: "shape",
              kind: "rectangle",
              x: 80,
              y: 80,
              width: 500,
              height: 130,
              color: "#ffffff",
            },
            {
              id: "new-title",
              type: "text",
              x: 100,
              y: 100,
              width: 450,
              text: "Nuevo texto",
              fontSize: 42,
              color: "#123456",
              font: "DejaVu Sans",
              align: "left",
            },
          ],
        };
        assert.equal(
          (
            await user.call(`variations/${image.id}/manual`, "POST", {
              expectedRevision: 2,
              document,
            })
          ).status,
          200,
        );
        const updated = await db.variation.findUniqueOrThrow({
          where: { id: image.id },
        });
        assert.notEqual(updated.path, path);
        assert.equal(updated.revision, 3);
        const bad = {
          ...document,
          layers: [{ ...document.layers[0], y: 1000 }],
        };
        assert.equal(
          (
            await user.call(`variations/${image.id}/manual`, "POST", {
              expectedRevision: 3,
              document: bad,
            })
          ).status,
          400,
        );
        assert.equal(await db.generationJob.count(), beforeJobs);
        assert.equal(await db.usageLedger.count(), beforeLedger);
        assert.equal(
          (await user.call(`variations/${image.id}`, "DELETE")).status,
          200,
        );
        assert.equal(
          (await user.call(`variations/${image.id}/design`)).status,
          404,
        );
      },
    );
    await t.test(
      "Workflow de orden se detiene ante configuración obsoleta antes de cualquier llamada facturable",
      async () =>
        withOrderProvider(async (c, calls) => {
          const jobs = await reserveJobs(
            uid,
            pid,
            [
              {
                subproductId: sid,
                key: randomUUID(),
                snapshot: {
                  index: 0,
                  prompt: "Configuración obsoleta",
                  mode: "Texto",
                  format: "1:1",
                  renderMode: "editable",
                },
              },
            ],
            c.revision,
          );
          const snapshot = { ...(jobs[0].snapshot as any), configRevision: -1 };
          await db.generationJob.update({
            where: { id: jobs[0].id },
            data: { snapshot },
          });
          const result = await user.call("orders", "POST", {
            ids: jobs.map((j) => j.id),
            mode: "background",
            requestId: randomUUID(),
          });
          assert.equal(result.status, 202);
          let row = await db.generationOrder.findUniqueOrThrow({
            where: { id: result.body.orders[0] },
          });
          for (
            let i = 0;
            i < 200 && ["STARTING", "ACTIVE", "QUEUED"].includes(row.status);
            i++
          ) {
            await new Promise((r) => setTimeout(r, 50));
            row = await db.generationOrder.findUniqueOrThrow({
              where: { id: row.id },
            });
          }
          assert.equal(row.status, "NEEDS_REVIEW", row.error ?? "");
          assert.equal(calls(), 0);
          assert.equal(
            (
              await db.generationJob.findUniqueOrThrow({
                where: { id: jobs[0].id },
              })
            ).status,
            "FAILED",
          );
        }),
    );
    async function hierarchyForReview() {
      const p=(await owner.call("projects","POST",{name:"Revisión "+randomUUID(),prompt:"Proyecto privado S/40 por los primeros 3 meses."})).body;
      const c=(await owner.call(`projects/${p.id}/categories`,"POST",{name:"Producto de revisión",prompt:"Producto privado: conservar marca."})).body;
      const created=await owner.call(`categories/${c.id}/subproducts`,"POST",{names:["Tema de revisión"]});
      assert.equal(created.status,201);
      const s=(await owner.call(`categories/${c.id}`)).body.subproducts[0];
      await owner.call(`subproducts/${s.id}`,"PATCH",{name:s.name,prompt:"Luego S/20 mensuales. Subproducto propio.",settings:{}});
      return {p,c,s};
    }
    async function uploadReviewText(resourceId:string,name="instrucciones.txt",scope="project",purpose="Material de contexto") {
      const form=new FormData();form.set("scope",scope);form.set("resourceId",resourceId);form.set("purpose",purpose);form.set("file",new File(["Documento de revisión"],name,{type:"text/plain"}));
      const result=await fetch(root+"/api/attachments",{method:"POST",headers:{Cookie:owner.cookie,Origin:root},body:form});assert.equal(result.status,201);return (await result.json()).id as string;
    }
    await t.test("herencia configurable conserva textos y acepta promoción seguida de mensualidad sin precio único",async()=>{
      const {p,c,s}=await hierarchyForReview();let preview=await owner.call(`subproducts/${s.id}/instructions`);assert.equal(preview.status,200);assert.equal(preview.body.warnings.length,0);assert(preview.body.text.includes("S/40"));assert(preview.body.text.includes("S/20"));
      assert.equal((await owner.call(`projects/${p.id}`,"PATCH",{name:p.name,prompt:p.prompt,instructionPolicy:{includeSelf:false}})).status,200);
      preview=await owner.call(`subproducts/${s.id}/instructions`);assert(!preview.body.text.includes("Proyecto privado"));assert.equal((await owner.call(`projects/${p.id}`)).body.prompt,p.prompt);
      assert.equal((await owner.call(`categories/${c.id}`,"PATCH",{name:c.name,prompt:c.prompt,settings:{},instructionPolicy:{includeProject:false,includeSelf:false}})).status,200);
      preview=await owner.call(`subproducts/${s.id}/instructions`);assert(!preview.body.text.includes("Producto privado"));assert(preview.body.text.includes("Subproducto propio"));
      await owner.call(`subproducts/${s.id}`,"PATCH",{name:s.name,prompt:"Conservar texto particular",settings:{},instructionPolicy:{includeSelf:false,includeProject:false,includeProduct:false}});
      preview=await owner.call(`subproducts/${s.id}/instructions`);assert(!preview.body.text.includes("Conservar texto particular"));assert(preview.body.text.includes(s.name));assert.equal((await owner.call(`subproducts/${s.id}`)).body.prompt,"Conservar texto particular");
      assert.equal((await owner.call(`projects/${p.id}`,"PATCH",{name:p.name,prompt:p.prompt,instructionPolicy:{includeSelf:"no"}})).status,400);
    });
    await t.test("revisión local del subproducto: padres intactos, guardado atómico, conflicto y privacidad",async()=>{
      const {p,c,s}=await hierarchyForReview();const initial=await owner.call(`subproducts/${s.id}/review`);assert.equal(initial.status,200);assert.equal(initial.body.layers.length,3);assert(initial.body.layers.every((l:any)=>l.canEdit));
      const before=await db.promptVersion.count({where:{resourceId:{in:[p.id,c.id,s.id]}}});const body={layers:initial.body.layers.map((l:any)=>({scope:l.scope,id:l.id,prompt:l.prompt+" Cambio total.",policy:l.policy,revision:l.revision}))};
      assert.equal((await owner.call(`subproducts/${s.id}/review`,"POST",body)).status,200);assert.equal(await db.promptVersion.count({where:{resourceId:{in:[p.id,c.id,s.id]}}}),before+1);assert.equal((await owner.call(`subproducts/${s.id}/review`,"POST",body)).status,409);
      assert.equal((await db.project.findUniqueOrThrow({where:{id:p.id}})).prompt,p.prompt);assert.equal((await db.category.findUniqueOrThrow({where:{id:c.id}})).prompt,c.prompt);
      const local=(await owner.call(`subproducts/${s.id}/instructions`)).body;assert(local.text.includes("Cambio total"));assert(!(await owner.call(`subproducts/${s.id}`)).body.instructionPolicy.reviewOverrides);assert(!(await owner.call(`categories/${c.id}`)).body.subproducts[0].instructionPolicy.reviewOverrides);
      await owner.call(`categories/${c.id}/subproducts`,"POST",{names:["Hermano sin cambios locales"]});const sibling=(await owner.call(`categories/${c.id}`)).body.subproducts.find((r:any)=>r.id!==s.id);assert(!(await owner.call(`subproducts/${sibling.id}/instructions`)).body.text.includes("Cambio total"));
      const userRow=await db.user.findUniqueOrThrow({where:{id:uid}});await owner.call(`subproducts/${s.id}/members`,"POST",{email:userRow.email});
      const limited=await user.call(`subproducts/${s.id}/review`);assert.equal(limited.status,200);assert.equal(limited.body.layers[0].prompt,null);assert.equal(limited.body.layers[1].prompt,null);assert.equal(limited.body.layers[2].canEdit,true);
      const safe=await user.call(`subproducts/${s.id}/instructions`);assert(!safe.body.text.includes("Proyecto privado"));assert(!safe.body.text.includes("Producto privado"));assert(safe.body.text.includes("Subproducto propio"));assert(!JSON.stringify((await user.call(`subproducts/${s.id}`)).body).includes("Proyecto privado"));
      const storedBefore=(await db.subproduct.findUniqueOrThrow({where:{id:s.id}})).instructionPolicy;await user.call(`subproducts/${s.id}`,"PATCH",{name:s.name,prompt:"Subproducto propio Cambio total.",settings:{},instructionPolicy:{reviewOverrides:{project:{sourceId:p.id,prompt:"Inyección de herencia"}}}});assert.deepEqual((await db.subproduct.findUniqueOrThrow({where:{id:s.id}})).instructionPolicy,storedBefore);
      const fresh=(await owner.call(`subproducts/${s.id}/review`)).body;const own=fresh.layers[2];const ownBefore=(await db.subproduct.findUniqueOrThrow({where:{id:s.id}})).prompt;
      const denied=await user.call(`subproducts/${s.id}/review`,"POST",{layers:[{...fresh.layers[0],prompt:"No autorizado"},{...own,prompt:"No debe guardarse"}]});assert.equal(denied.status,404);assert.equal((await db.subproduct.findUniqueOrThrow({where:{id:s.id}})).prompt,ownBefore);
      assert.equal((await user.call(`subproducts/${s.id}/review`,"POST",{layers:[{...(await user.call(`subproducts/${s.id}/review`)).body.layers[2],policy:{includeProject:false},prompt:ownBefore}]})).status,200);
      const observerRow=await db.user.findUniqueOrThrow({where:{id:oid}});await owner.call(`subproducts/${s.id}/members`,"POST",{email:observerRow.email});assert.equal((await observer.call(`subproducts/${s.id}/review`,"POST",{layers:[own]})).status,403);assert.equal((await anonymous.call(`subproducts/${s.id}/review`)).status,401);
    });
    await t.test("configuraciones por nivel: proyecto con adjuntos, recarga sin duplicados y sobreescritura protegida",async()=>{
      const {p,c,s}=await hierarchyForReview(),target=(await owner.call("projects","POST",{name:"Destino de configuración"})).body;await uploadReviewText(p.id);
      const payload={name:"Proyecto reutilizable",prompt:p.prompt,settings:{},level:"project",policy:{includeSelf:true},sourceProjectId:p.id,includeAttachments:true,visibility:"PERSONAL"};
      const preset=await owner.call("presets","POST",payload);assert.equal(preset.status,201);assert.equal(preset.body.level,"project");
      const listed=await owner.call("presets?level=project&summary=1");assert(listed.body.some((r:any)=>r.id===preset.body.id));assert(!JSON.stringify(listed.body).includes(p.prompt));assert(!(await owner.call("presets?level=subproduct")).body.some((r:any)=>r.id===preset.body.id));
      for(let i=0;i<2;i++)assert.equal((await owner.call(`presets/${preset.body.id}/apply`,"POST",{projectId:target.id,includeAttachments:true})).status,200);
      assert.equal(await db.attachment.count({where:{scope:"project",resourceId:target.id}}),1);assert.equal((await owner.call(`projects/${target.id}`)).body.prompt,p.prompt);
      assert.equal((await owner.call(`presets/${preset.body.id}/apply`,"POST",{subproductId:s.id})).status,400);
      const timestamp=(await db.savedPreset.findUniqueOrThrow({where:{id:preset.body.id}})).updatedAt.toISOString();const update={...payload,prompt:"Instrucciones actualizadas",expectedUpdatedAt:timestamp};assert.equal((await owner.call(`presets/${preset.body.id}`,"PATCH",update)).status,200);assert.equal((await owner.call(`presets/${preset.body.id}`,"PATCH",update)).status,409);
      assert.equal((await user.call(`presets/${preset.body.id}`,"PATCH",payload)).status,404);const separate=await owner.call("presets","POST",{...payload,name:"Proyecto nuevo nombre"});assert.equal(separate.status,201);assert.notEqual(separate.body.id,preset.body.id);
      assert.equal((await owner.call(`presets/${preset.body.id}/apply`,"POST",{categoryId:c.id})).status,400);
    });
    await t.test("identidad reutilizable conserva colores y logos autorizados del destino sin duplicar adjuntos",async()=>{
      const {p}=await hierarchyForReview(),target=(await owner.call("projects","POST",{name:"Marca destino"})).body;
      const sharp=(await import("sharp")).default;const bytes=await sharp({create:{width:30,height:20,channels:3,background:"#123456"}}).png().toBuffer();
      const upload=async(name:string,purpose:string)=>{const form=new FormData();form.set("scope","project");form.set("resourceId",p.id);form.set("purpose",purpose);form.set("file",new File([new Uint8Array(bytes)],name,{type:"image/png"}));const r=await fetch(root+"/api/attachments",{method:"POST",headers:{Cookie:owner.cookie,Origin:root},body:form});assert.equal(r.status,201);return (await r.json()).id;};
      const logo=await upload("autorizado.png","Logo institucional");await upload("no-seleccionado.png","Logo institucional");await upload("referencia.png","Referencia visual");
      assert.equal((await owner.call(`projects/${p.id}/brand`,"PUT",{expectedRevision:0,name:"Marca reutilizable",prompt:"Identidad cálida",colors:["#123456"],font:null,logoAttachmentIds:[logo]})).status,200);
      const preset=await owner.call("presets","POST",{name:"Marca compartida",level:"brand",sourceProjectId:p.id,includeAttachments:true,prompt:"Identidad cálida",settings:{brandName:"Marca reutilizable",colors:["#123456"],font:null},visibility:"PERSONAL"});assert.equal(preset.status,201);
      assert.equal(await db.attachment.count({where:{scope:"preset",resourceId:preset.body.id}}),2);
      for(let i=0;i<2;i++)assert.equal((await owner.call(`presets/${preset.body.id}/apply`,"POST",{projectId:target.id,brand:true,includeAttachments:true})).status,200);
      const brand=(await owner.call(`projects/${target.id}/brand`)).body.kit;assert.equal(brand.name,"Marca reutilizable");assert.deepEqual(brand.colors,["#123456"]);assert.equal(brand.logoAttachmentIds.length,1);assert.notEqual(brand.logoAttachmentIds[0],logo);assert.equal(await db.attachment.count({where:{scope:"project",resourceId:target.id}}),2);
      assert.equal((await owner.call(`presets/${preset.body.id}/apply`,"POST",{projectId:target.id,brand:false})).status,400);
      const directory=await owner.call("brands");assert.equal(directory.status,200);assert(directory.body.some((row:any)=>row.projectId===p.id));assert(!JSON.stringify(directory.body).includes("Identidad cálida"));assert(!(await admin.call("brands")).body.some((row:any)=>row.projectId===p.id));
      const direct=(await owner.call("projects","POST",{name:"Identidad directa"})).body;
      for(let i=0;i<2;i++)assert.equal((await owner.call(`brands/${p.id}/apply`,"POST",{projectId:direct.id})).status,200);
      assert.equal(await db.attachment.count({where:{scope:"project",resourceId:direct.id}}),2);assert.equal((await owner.call(`projects/${direct.id}/brand`)).body.kit.logoAttachmentIds.length,1);assert.equal((await user.call(`brands/${p.id}/apply`,"POST",{projectId:direct.id})).status,404);
    });
    await t.test("eliminar producto lo oculta, cancela solo pendientes y permite restaurar sin repetir cargos",async()=>{
      const {p,c,s}=await hierarchyForReview(),actor=(await db.user.findFirstOrThrow({where:{role:"OWNER",status:"APPROVED"}}));
      const job=await db.generationJob.create({data:{actorId:actor.id,projectId:p.id,subproductId:s.id,idempotencyKey:randomUUID(),status:"PENDING",snapshot:{prompt:"Sintético"},reservedMicros:100n}});await db.usageLedger.create({data:{jobId:job.id,actorId:actor.id,projectId:p.id,model:"synthetic-review",reservedMicros:100n}});
      assert.equal((await admin.call(`categories/${c.id}`,"DELETE")).status,403);assert.equal((await owner.call(`categories/${c.id}`,"DELETE")).status,200);assert.equal((await owner.call(`categories/${c.id}`)).status,404);assert.equal((await owner.call(`subproducts/${s.id}`)).status,404);assert.equal((await db.generationJob.findUniqueOrThrow({where:{id:job.id}})).status,"CANCELLED");assert.equal((await db.usageLedger.findUniqueOrThrow({where:{jobId:job.id}})).status,"RELEASED");assert(!(await owner.call(`projects/${p.id}`)).body.categories.some((row:any)=>row.id===c.id));
      assert((await owner.call("categories/trash")).body.some((row:any)=>row.id===c.id));assert.equal((await owner.call(`categories/${c.id}/restore`,"POST",{})).status,200);assert.equal((await owner.call(`subproducts/${s.id}`)).status,200);assert.equal((await db.generationJob.findUniqueOrThrow({where:{id:job.id}})).status,"CANCELLED");assert.equal((await observer.call(`categories/${c.id}`,"DELETE")).status,403);
    });

    await t.test("inicio rápido atómico, propio e idempotente sin generar; herencias excluyen documentos y marca",async()=>{
      const before=await db.generationJob.count(),requestId=crypto.randomUUID();
      const payload={requestId,name:"Campaña rápida",prompt:"Oferta específica",count:3};
      const results=await Promise.all([user.call("quick-start","POST",payload),user.call("quick-start","POST",payload)]);
      assert(results.every(r=>r.status===201));assert.deepEqual(results[0].body,results[1].body);
      const ids=results[0].body,sub=(await user.call(`subproducts/${ids.subproductId}`)).body;
      assert.equal(sub.name,payload.name);assert.equal(sub.prompt,payload.prompt);
      const project=(await user.call(`projects/${ids.projectId}`)).body;assert.equal(project.ownerId,uid);
      const preview=(await user.call(`subproducts/${ids.subproductId}/instructions`)).body;assert.equal(preview.settings.count,3);assert.equal(preview.settings.imageTextCount,3);assert(preview.text.includes(payload.prompt));assert.equal(await db.generationJob.count(),before);
      assert.equal((await observer.call("quick-start","POST",{...payload,requestId:crypto.randomUUID()})).status,403);
      assert.equal((await owner.call("quick-start","POST",payload)).status,409);
      assert.equal((await user.call("quick-start","POST",{...payload,requestId:crypto.randomUUID(),count:13})).status,400);
      const {p,c,s:subproduct}=await hierarchyForReview();const pf=await uploadReviewText(p.id,"proyecto-heredado.txt","project"),cf=await uploadReviewText(c.id,"producto-heredado.txt","category");
      await owner.call(`projects/${p.id}/brand`,"PUT",{expectedRevision:0,name:"Marca a excluir",prompt:"Marca heredada",colors:[],font:null,logoAttachmentIds:[]});
      let view=(await owner.call(`subproducts/${subproduct.id}/instructions`)).body;assert(view.attachments.some((a:any)=>a.id===pf));assert(view.attachments.some((a:any)=>a.id===cf));assert(view.text.includes("Marca heredada"));
      await owner.call(`subproducts/${subproduct.id}`,"PATCH",{name:subproduct.name,prompt:"Luego S/20 mensuales. Subproducto propio.",settings:{},instructionPolicy:{includeProject:false,includeProduct:true,includeSelf:true}});
      view=(await owner.call(`subproducts/${subproduct.id}/instructions`)).body;assert(!view.attachments.some((a:any)=>a.id===pf));assert(view.attachments.some((a:any)=>a.id===cf));assert.equal(view.brand,null);assert(!view.text.includes("Marca heredada"));assert(!view.text.includes(p.prompt));
      await owner.call(`subproducts/${subproduct.id}`,"PATCH",{name:subproduct.name,prompt:"Luego S/20 mensuales. Subproducto propio.",settings:{},instructionPolicy:{includeProject:false,includeProduct:false,includeSelf:true}});
      view=(await owner.call(`subproducts/${subproduct.id}/instructions`)).body;assert.equal(view.attachments.length,0);assert(!view.text.includes("Producto privado"));assert(view.text.includes("Subproducto propio"));assert.equal((await owner.call(`attachments?scope=project&id=${p.id}`)).body.length,1);
    });
    await t.test("inicio rápido elige proyectos/productos autorizados o crea solo sus nombres, sin modificar ancestros",async()=>{
      const {p,c,s:old}=await hierarchyForReview(),before=await db.generationJob.count();
      const beforeProject=await db.project.findUniqueOrThrow({where:{id:p.id}}),beforeProduct=await db.category.findUniqueOrThrow({where:{id:c.id}});
      const payload={requestId:randomUUID(),name:"Subproducto añadido al final",prompt:"Detalle nuevo",count:2,projectId:p.id,categoryId:c.id};
      const [a,b]=await Promise.all([owner.call("quick-start","POST",payload),owner.call("quick-start","POST",payload)]);assert.equal(a.status,201);assert.deepEqual(a.body,b.body);assert.equal(a.body.projectId,p.id);assert.equal(a.body.categoryId,c.id);
      const list=(await owner.call(`categories/${c.id}`)).body.subproducts;assert.equal(list.at(-1).id,a.body.subproductId);assert(list.some((s:any)=>s.id===old.id));
      assert.deepEqual(await db.project.findUniqueOrThrow({where:{id:p.id}}),beforeProject);assert.deepEqual(await db.category.findUniqueOrThrow({where:{id:c.id}}),beforeProduct);assert.equal(await db.generationJob.count(),before);
      const view=(await owner.call(`subproducts/${a.body.subproductId}/instructions`)).body;assert.equal(view.settings.count,2);assert(view.text.includes(p.prompt));assert(view.text.includes(c.prompt));
      const named=await user.call("quick-start","POST",{requestId:randomUUID(),name:"Tema propio",count:1,projectName:"Nombre del proyecto rápido",productName:"Nombre del producto rápido"});assert.equal(named.status,201);assert.equal((await user.call(`projects/${named.body.projectId}`)).body.name,"Nombre del proyecto rápido");assert.equal((await user.call(`categories/${named.body.categoryId}`)).body.name,"Nombre del producto rápido");
      assert(!(await user.call("quick-start")).body.some((row:any)=>row.id===p.id));
      assert.equal((await user.call("quick-start","POST",{...payload,requestId:randomUUID()})).status,404);
      await db.categoryMember.create({data:{categoryId:c.id,userId:uid}});
      const options=(await user.call("quick-start")).body,option=options.find((row:any)=>row.id===p.id);assert(option);assert.equal(option.canCreateProduct,false);assert.deepEqual(Object.keys(option).sort(),["canCreateProduct","categories","id","name"]);assert.deepEqual(option.categories,[{id:c.id,name:c.name}]);
      const shared=await user.call("quick-start","POST",{...payload,requestId:randomUUID()});assert.equal(shared.status,201);assert.equal((await user.call(`subproducts/${shared.body.subproductId}`)).status,200);
      assert.equal((await user.call("quick-start","POST",{requestId:randomUUID(),name:"Sin permiso",count:1,projectId:p.id,productName:"Producto nuevo"})).status,404);
      assert.equal((await user.call("quick-start","POST",{requestId:randomUUID(),name:"Producto cruzado",count:1,projectId:named.body.projectId,categoryId:c.id})).status,404);
      assert.equal((await observer.call("quick-start")).status,403);await db.categoryMember.delete({where:{categoryId_userId:{categoryId:c.id,userId:uid}}});
    });
    await t.test("generación rápida autoriza sin afirmar revisión y conserva muestras, permisos, cuotas e idempotencia",async()=>withOrderProvider(async(_config,calls)=>{
      const quick=await owner.call("quick-start","POST",{requestId:randomUUID(),name:"Generación directa",prompt:"Contenido autorizado",count:2,projectName:"Proyecto rápido",productName:"Producto rápido"});assert.equal(quick.status,201);
      const id=quick.body.subproductId,payload={requestId:randomUUID(),quickGeneration:true,confirmCharge:true};
      assert.equal((await owner.call(`subproducts/${id}/generate`,"POST",{...payload,confirmCharge:false})).status,400);
      assert.equal((await owner.call(`subproducts/${id}/generate`,"POST",{...payload,quickGeneration:false})).status,400);
      assert.equal((await observer.call(`subproducts/${id}/generate`,"POST",payload)).status,403);
      assert.equal((await user.call(`subproducts/${id}/generate`,"POST",payload)).status,404);
      const created=await owner.call(`subproducts/${id}/generate`,"POST",payload);assert.equal(created.status,202);assert.equal(created.body.jobs.length,2);assert.equal(created.body.runnable.length,1);
      const again=await owner.call(`subproducts/${id}/generate`,"POST",payload);assert.deepEqual(again.body,created.body);
      const jobs=await db.generationJob.findMany({where:{id:{in:created.body.jobs}}});assert(jobs.every(j=>(j.snapshot as any).previewFirst===true));assert(jobs.every(j=>(j.snapshot as any).prompt.includes("Contenido autorizado")));
      const audit=await db.auditEvent.findFirstOrThrow({where:{action:"GENERACION_AUTORIZADA",resourceId:id},orderBy:{createdAt:"desc"}});assert.equal((audit.detail as any).source,"generacion_rapida");
      for(const job of jobs)await owner.call(`jobs/${job.id}/cancel`,"POST");assert.equal(calls(),0);
    }));
    await t.test("acabado profesional nativo por defecto y regeneración; capas opcionales conservan edición sin llamadas extra",async()=>withOrderProvider(async()=>{
      const {adapter}=await import("../lib/providers"),{default:sharp}=await import("sharp");const provider=adapter("openai"),oldDirect=provider.direct,oldGenerate=provider.generate;let directions=0,images=0;const structured:boolean[]=[],briefs:string[]=[];
      const bytes=await sharp({create:{width:80,height:80,channels:3,background:"#327568"}}).png().toBuffer();
      provider.direct=async(_key,_model,prompt,isStructured=false)=>{directions++;structured.push(isStructured);briefs.push(prompt);return {text:isStructured?JSON.stringify({backgroundPrompt:"Fotografía y contraste coordinados con las capas",backgroundColor:"#ffffff",texts:[{id:"title",text:"TERAPIA INFANTIL",x:70,y:70,width:900,fontSize:100,color:"#123456",font:"DejaVu Sans",align:"left"}],logos:[]}):"AFICHE COMPLETO profesional de TERAPIA INFANTIL con jerarquía visual.",usage:null};};
      provider.generate=async(_key,options)=>{images++;assert(options.prompt.includes("AFICHE COMPLETO"));return {bytes,usage:null};};
      try{
        const p=(await owner.call("projects","POST",{name:"Calidad visual",prompt:"Publicidad profesional. No inventar datos."})).body,c=(await owner.call(`projects/${p.id}/categories`,"POST",{name:"Campaña",prompt:"Terapia infantil"})).body;
        await owner.call(`categories/${c.id}`,"PATCH",{name:c.name,prompt:c.prompt,settings:{count:1,textCount:0,imageTextCount:1,imageCount:0,editable:true},applySettingsToAll:true,applyPromptToAll:true});await owner.call(`categories/${c.id}/subproducts`,"POST",{names:["TERAPIA INFANTIL"]});const sub=(await owner.call(`categories/${c.id}`)).body.subproducts[0];
        let preview=(await owner.call(`subproducts/${sub.id}/instructions`)).body;assert.equal(preview.settings.designMode,"professional");assert.equal(preview.settings.editable,false);
        const created=await owner.call(`subproducts/${sub.id}/generate`,"POST",{confirmCharge:true,reviewedInstructions:true,requestId:randomUUID()});assert.equal(created.status,202);const id=created.body.jobs[0];assert.equal(((await db.generationJob.findUniqueOrThrow({where:{id}})).snapshot as Record<string,unknown>).renderMode,"flat");await runOne({id});assert.equal(directions,1);assert.equal(images,1);assert.equal(structured[0],false);assert(briefs[0].includes("afiche publicitario terminado"));
        const first=await db.generationJob.findUniqueOrThrow({where:{id},include:{variation:true}});assert.equal(first.status,"COMPLETED");assert.equal((await owner.call(`variations/${first.variation!.id}/design`)).body.document,null);
        await owner.call(`categories/${c.id}`,"PATCH",{name:c.name,prompt:c.prompt,settings:{count:1,textCount:1,imageTextCount:0,imageCount:0,designMode:"editable",editable:true},applySettingsToAll:true,applyPromptToAll:true});preview=(await owner.call(`subproducts/${sub.id}/instructions`)).body;assert.equal(preview.settings.editable,true);
        const layered=await owner.call(`subproducts/${sub.id}/generate`,"POST",{confirmCharge:true,reviewedInstructions:true,requestId:randomUUID()});const layeredId=layered.body.jobs[0];await runOne({id:layeredId});assert.equal(directions,2);assert.equal(images,1);assert.equal(structured[1],true);const layeredJob=await db.generationJob.findUniqueOrThrow({where:{id:layeredId},include:{variation:true}});assert.equal(layeredJob.status,"COMPLETED");const design=(await owner.call(`variations/${layeredJob.variation!.id}/design`)).body;assert(design.document.layers.some((layer:any)=>layer.type==="text"));
        for(const designMode of [undefined,"editable"]){const r=await owner.call(`variations/${layeredJob.variation!.id}/regenerate`,"POST",{expectedRevision:1,prompt:"Otra composición profesional",confirmCharge:true,reviewedInstructions:true,requestId:randomUUID(),...(designMode?{designMode}:{})});assert.equal(r.status,202);const regenId=r.body.jobs[0];assert.equal(((await db.generationJob.findUniqueOrThrow({where:{id:regenId}})).snapshot as Record<string,unknown>).renderMode,designMode==="editable"?"editable":"flat");await owner.call(`jobs/${regenId}/cancel`,"POST");}
        assert.equal(directions,2);assert.equal(images,1);assert.equal(((await db.generationJob.findUniqueOrThrow({where:{id:layeredId}})).snapshot as Record<string,unknown>).renderMode,"editable");
        await owner.call(`categories/${c.id}`,"PATCH",{name:c.name,prompt:c.prompt,settings:{count:1,textCount:1,imageTextCount:0,imageCount:0,designMode:"professional",editable:false},applySettingsToAll:true,applyPromptToAll:true});
        const typography=await owner.call(`subproducts/${sub.id}/generate`,"POST",{confirmCharge:true,reviewedInstructions:true,requestId:randomUUID()});await runOne({id:typography.body.jobs[0]});assert.equal(directions,3);assert.equal(images,2);assert.equal(structured[2],false);assert(briefs[2].includes("afiche tipográfico de diseño"));
      }finally{provider.direct=oldDirect;provider.generate=oldGenerate;}
    }));
    await t.test("niveles y recuperación local completan afiches con referencias sin repetir IA; fallos reales conservan incertidumbre",async()=>withOrderProvider(async()=>{
      const {adapter}=await import("../lib/providers"),{default:sharp}=await import("sharp");
      const provider=adapter("openai"),oldDirect=provider.direct,oldGenerate=provider.generate;
      const bytes=await sharp({create:{width:80,height:80,channels:3,background:"#327568"}}).png().toBuffer();
      let directions=0,images=0,variant="empty";const efforts:string[]=[],outputs:string[]=[];
      provider.direct=async(_key,_model,_prompt,_structured,_signal,level)=>{
        directions++;efforts.push(level??"unset");
        if(variant==="network")throw Error("synthetic unavailable");
        if(variant==="truncated")return {text:"{\"backgroundPrompt\":\"Oferta incompleta",usage:{output_tokens:33},incomplete:true};
        if(variant==="invalid")return {text:"```json\n{\"texts\":[]}\n```",usage:{output_tokens:33}};
        if(variant==="fenced")return {text:"```json\n"+JSON.stringify({backgroundPrompt:"Fondo",backgroundColor:"#ffffff",texts:[{id:"title",text:"TERAPIA INFANTIL",x:40,y:50,width:900,fontSize:90,color:"#123456",font:"DejaVu Sans",align:"left"}],logos:[]})+"\n```",usage:{output_tokens:33}};
        return {text:"",usage:{output_tokens:33},incomplete:false};
      };
      provider.generate=async(_key,options)=>{images++;outputs.push(options.prompt);assert.equal(options.quality,"low");assert.equal(options.size,"1024x1024");assert.equal(options.images?.length,1);assert(options.prompt.includes("S/40"));assert(options.prompt.includes("S/20"));assert(options.prompt.includes("Documento de revisión"));return {bytes,usage:{output_tokens:44}};};
      try{
        const {p,c,s:sub}=await hierarchyForReview();await uploadReviewText(p.id);
        const form=new FormData();form.set("scope","subproduct");form.set("resourceId",sub.id);form.set("purpose","Referencia visual");form.set("file",new File([new Uint8Array(bytes)],"referencia.png",{type:"image/png"}));
        const uploaded=await fetch(root+"/api/attachments",{method:"POST",headers:{Cookie:owner.cookie,Origin:root},body:form});assert.equal(uploaded.status,201);
        let beforeImages=0;
        for(const [level,mode,response] of [["medium","professional","empty"],["low","professional","empty"],["medium","professional","truncated"],["high","editable","invalid"],["medium","editable","fenced"]]){
          variant=response;
          const patched=await owner.call(`subproducts/${sub.id}`,"PATCH",{name:sub.name,prompt:"Luego S/20 mensuales. Subproducto propio.",settings:{count:1,textCount:response==="fenced"?1:0,imageTextCount:response==="fenced"?0:1,imageCount:0,designMode:mode,reasoningLevel:level}});assert.equal(patched.status,200);
          const created=await owner.call(`subproducts/${sub.id}/generate`,"POST",{confirmCharge:true,reviewedInstructions:true,requestId:randomUUID()});assert.equal(created.status,202);
          const id=created.body.jobs[0];let job=await db.generationJob.findUniqueOrThrow({where:{id}});assert.equal((job.snapshot as Record<string,unknown>).reasoningLevel,level);
          await runOne({id});job=await db.generationJob.findUniqueOrThrow({where:{id},include:{variation:true}});assert.equal(job.status,"COMPLETED");assert.equal(job.error,null);
          const ledger=await db.usageLedger.findUniqueOrThrow({where:{jobId:id}});assert.equal(ledger.status,"CONSUMED_ESTIMATE");assert.deepEqual((ledger.usage as any).creative,level==="low"?null:{output_tokens:33});
          if(response!=="fenced"){assert.equal(images,++beforeImages);assert.equal((job.snapshot as Record<string,unknown>).creativeRecovery,level==="low"?undefined:"authorized-brief");}
          else assert.equal(images,beforeImages);
          const variation=await db.variation.findUniqueOrThrow({where:{jobId:id}});const design=(await owner.call(`variations/${variation.id}/design`)).body;assert.equal(!!design.document,response==="fenced");
          if(response==="empty"&&level==="medium"){
            const regen=await owner.call(`variations/${variation.id}/regenerate`,"POST",{expectedRevision:1,requestId:randomUUID(),confirmCharge:true,reviewedInstructions:true,reasoningLevel:"low"});assert.equal(regen.status,202);const regenJob=await db.generationJob.findUniqueOrThrow({where:{id:regen.body.jobs[0]}});assert.equal((regenJob.snapshot as Record<string,unknown>).reasoningLevel,"low");await owner.call(`jobs/${regenJob.id}/cancel`,"POST");
            const bulk=await owner.call("variations/bulk-regenerate","POST",{ids:[variation.id],requestId:randomUUID(),confirmCharge:true,reviewedInstructions:true,reasoningLevel:"medium"});assert.equal(bulk.status,202);const bulkJob=await db.generationJob.findUniqueOrThrow({where:{id:bulk.body.jobs[0]}});assert.equal((bulkJob.snapshot as Record<string,unknown>).reasoningLevel,"medium");await owner.call(`jobs/${bulkJob.id}/cancel`,"POST");
          }
        }
        assert.equal(directions,4);assert.equal(images,4);assert.deepEqual(efforts,["medium","medium","high","medium"]);
        variant="network";const failed=await owner.call(`subproducts/${sub.id}/generate`,"POST",{confirmCharge:true,reviewedInstructions:true,requestId:randomUUID()});await runOne({id:failed.body.jobs[0]});assert.equal((await db.generationJob.findUniqueOrThrow({where:{id:failed.body.jobs[0]}})).status,"UNCERTAIN");assert.equal(images,4);assert.equal(directions,5);
        const invalidLevel=await owner.call(`subproducts/${sub.id}`,"PATCH",{name:sub.name,settings:{reasoningLevel:"max"}});assert.equal(invalidLevel.status,400);
        assert.equal((await owner.call(`projects/${p.id}`)).body.prompt,p.prompt);assert.equal((await owner.call(`categories/${c.id}`)).body.prompt,c.prompt);
      }finally{provider.direct=oldDirect;provider.generate=oldGenerate;}
    }));
    await t.test("detener primer intento vacío retira solo carpeta/tarjeta; conserva configuración, historial, costos y carpetas existentes",async()=>withOrderProvider(async(config,calls)=>{
      const {libraryTree}=await import("../lib/library-explorer");
      const actor={id:(await db.user.findFirstOrThrow({where:{role:"OWNER"}})).id,role:"OWNER"};
      const {p,c,s:sub}=await hierarchyForReview();
      async function orderFor(subproductId:string){
        const jobs=await reserveJobs(actor.id,p.id,Array.from({length:2},(_,index)=>({subproductId,key:randomUUID(),snapshot:{prompt:"Contenido sintético",mode:"Texto",renderMode:"editable",index,format:"1:1"}})),config.revision);
        const created=await owner.call("orders","POST",{ids:jobs.map(j=>j.id),mode:"immediate",requestId:randomUUID()});assert.equal(created.status,202);return {id:created.body.orders[0] as string,jobs};
      }
      const first=await orderFor(sub.id);
      assert((await libraryTree(actor)).some(n=>n.id==="subproduct:"+sub.id));
      await db.generationJob.update({where:{id:first.jobs[0].id},data:{status:"UNCERTAIN",error:"Respuesta creativa vacía"}});
      await db.usageLedger.update({where:{jobId:first.jobs[0].id},data:{status:"UNCERTAIN",usage:{creative:{output_tokens:1200}}}});
      const uncertainBefore=await db.usageLedger.findUniqueOrThrow({where:{jobId:first.jobs[0].id}});
      const stopped=await owner.call(`orders/${first.id}/stop`,"POST",{});assert.equal(stopped.status,200);assert.equal(stopped.body.hiddenFromProduction,true);
      assert.equal(stopped.body.viewerId,actor.id);assert.equal(stopped.body.uncertain,1);
      assert(!(await libraryTree(actor)).some(n=>n.id==="subproduct:"+sub.id));
      const category=(await owner.call(`categories/${c.id}`)).body;assert(category.subproducts.some((row:any)=>row.id===sub.id));assert.equal((await db.subproduct.findUniqueOrThrow({where:{id:sub.id}})).deletedAt,null);
      assert.equal((await owner.call(`subproducts/${sub.id}/instructions`)).status,200);
      assert(!(await owner.call(`orders?project=${p.id}&product=${c.id}`)).body.some((row:any)=>row.id===first.id));
      const explicit=(await owner.call(`orders?ids=${first.id}`)).body[0];assert.equal(explicit.status,"STOPPED");assert.equal(explicit.hiddenFromProduction,true);
      const uncertainAfter=await db.usageLedger.findUniqueOrThrow({where:{jobId:first.jobs[0].id}});assert.equal(uncertainAfter.status,uncertainBefore.status);assert.deepEqual(uncertainAfter.usage,uncertainBefore.usage);assert.equal(uncertainAfter.reservedMicros,uncertainBefore.reservedMicros);
      assert.equal((await db.generationJob.findUniqueOrThrow({where:{id:first.jobs[1].id}})).status,"CANCELLED");
      assert.equal((await owner.call(`orders/${first.id}/stop`,"POST",{})).status,200);
      const added=await orderFor(sub.id);assert((await libraryTree(actor)).some(n=>n.id==="subproduct:"+sub.id));await owner.call(`orders/${added.id}/stop`,"POST",{});assert((await libraryTree(actor)).some(n=>n.id==="subproduct:"+sub.id));
      await owner.call(`categories/${c.id}/subproducts`,"POST",{names:["En curso","Con resultados","Con carpeta personal"]});
      const rows=(await owner.call(`categories/${c.id}`)).body.subproducts;const runningSub=rows.find((row:any)=>row.name==="En curso"),savedSub=rows.find((row:any)=>row.name==="Con resultados"),personalSub=rows.find((row:any)=>row.name==="Con carpeta personal");
      const running=await orderFor(runningSub.id);await db.generationJob.update({where:{id:running.jobs[0].id},data:{status:"RUNNING",leaseToken:randomUUID(),heartbeatAt:new Date(),startedAt:new Date()}});const runningStop=await owner.call(`orders/${running.id}/stop`,"POST",{});assert.equal(runningStop.body.hiddenFromProduction,false);assert((await libraryTree(actor)).some(n=>n.id==="subproduct:"+runningSub.id));
      // A late completion remains available; no provider request is executed here.
      await db.generationJob.update({where:{id:running.jobs[0].id},data:{status:"COMPLETED",leaseToken:null,heartbeatAt:null}});await db.variation.create({data:{jobId:running.jobs[0].id,subproductId:runningSub.id,path:"synthetic-late.png",model:"synthetic",expiresAt:new Date(Date.now()+86400000)}});assert((await libraryTree(actor)).some(n=>n.id==="subproduct:"+runningSub.id));
      const saved=await orderFor(savedSub.id);await db.generationJob.update({where:{id:saved.jobs[0].id},data:{status:"COMPLETED"}});await db.variation.create({data:{jobId:saved.jobs[0].id,subproductId:savedSub.id,path:"synthetic-saved.png",model:"synthetic",expiresAt:new Date(Date.now()+86400000)}});const savedStop=await owner.call(`orders/${saved.id}/stop`,"POST",{});assert.equal(savedStop.body.hiddenFromProduction,false);assert((await libraryTree(actor)).some(n=>n.id==="subproduct:"+savedSub.id));
      const personal=await orderFor(personalSub.id);await db.libraryFolder.create({data:{userId:actor.id,name:"Mi carpeta manual",anchorScope:"subproduct",anchorId:personalSub.id}});await owner.call(`orders/${personal.id}/stop`,"POST",{});assert((await libraryTree(actor)).some(n=>n.id==="subproduct:"+personalSub.id));
      assert.equal((await observer.call(`orders/${first.id}/stop`,"POST",{})).status,403);
      assert.equal(calls(),0);
    }));
    await t.test("copy exacto en flyers forenses: una imagen independiente por modalidad, logos autorizados y cero llamadas creativas",async()=>withOrderProvider(async()=>{
      const {readFile}=await import("node:fs/promises"),{adapter}=await import("../lib/providers"),{default:sharp}=await import("sharp");
      const provider=adapter("openai"),oldDirect=provider.direct,oldGenerate=provider.generate;let directions=0,images=0;
      const bytes=await sharp({create:{width:80,height:80,channels:3,background:"#327568"}}).png().toBuffer();
      provider.direct=async()=>{directions++;throw Error("No necesita dirección creativa para copiar texto literal");};
      provider.generate=async(_key,args)=>{images++;assert(args.prompt.includes("SOLO EL RECURSO VISUAL"));assert(args.prompt.includes("no dibujes letras"));assert(!args.prompt.includes("VARIACIÓN 2"));assert(args.prompt.includes("Documento de revisión"));assert(!args.prompt.includes("Modalidad Imagen + Texto: diseña un afiche publicitario terminado"));assert(!args.prompt.includes("MENSUALIDADES GRATIS"));assert.equal(args.images?.length,1);return {bytes,usage:{output_tokens:44}};};
      try{
        const {p,c,s:sub}=await hierarchyForReview();const prompt=await readFile("tests/fixtures/forensic-brief.txt","utf8");
        await owner.call(`subproducts/${sub.id}`,"PATCH",{name:"PSICOLOGÍA FORENSE",prompt,settings:{count:2,textCount:0,imageTextCount:2,imageCount:0,designMode:"professional",reasoningLevel:"medium"}});await uploadReviewText(p.id);
        const resolved=(await owner.call(`subproducts/${sub.id}/instructions`)).body;assert.equal(resolved.settings.textCount,1);assert.equal(resolved.settings.imageTextCount,1);
        const uploads:string[]=[];
        for(const [name,purpose] of [["WOSA.png","Logo institucional"],["ministerio.png","Logo institucional"],["referencia.png","Referencia visual"]]){const form=new FormData();form.set("scope","subproduct");form.set("resourceId",sub.id);form.set("purpose",purpose);form.set("file",new File([new Uint8Array(bytes)],name,{type:"image/png"}));const r=await fetch(root+"/api/attachments",{method:"POST",headers:{Cookie:owner.cookie,Origin:root},body:form});assert.equal(r.status,201);uploads.push((await r.json()).id);}
        const created=await owner.call(`subproducts/${sub.id}/generate`,"POST",{requestId:randomUUID(),reviewedInstructions:true,confirmCharge:true});assert.equal(created.status,202);assert.equal(created.body.jobs.length,2);
        assert.deepEqual((await db.generationJob.findMany({where:{id:{in:created.body.jobs}},orderBy:{createdAt:"asc"}})).map(j=>(j.snapshot as any).mode),["Imagen + Texto","Texto"]);
        for(const id of created.body.jobs){await runOne({id});const job=await db.generationJob.findUniqueOrThrow({where:{id},include:{variation:true}});assert.equal(job.status,"COMPLETED");assert.equal((job.snapshot as any).literalCopy,true);
          const design=(await owner.call(`variations/${job.variation!.id}/design`)).body.document;const text=design.layers.filter((l:any)=>l.type==="text").map((l:any)=>l.text);assert(text.includes("DIPLOMADO EN PSICOLOGÍA FORENSE"));assert(text.includes("MENSUALIDADES GRATIS"));assert(text.includes("Pago único $40 USD"));assert(!text.join(" ").includes("Ministerio"));assert(!text.join(" ").includes("Perú"));assert(design.layers.some((l:any)=>l.type==="logo"&&l.attachmentId===uploads[0]));assert(!design.layers.some((l:any)=>l.attachmentId===uploads[1]));
          if((job.snapshot as any).mode==="Texto")assert.equal((await db.usageLedger.findUniqueOrThrow({where:{jobId:id}})).actualMicros,0n);
        }
        assert.equal(directions,0);assert.equal(images,1);
      }finally{provider.direct=oldDirect;provider.generate=oldGenerate;}
    }));
    await t.test("Biblioteca: raíz solo carpetas, cargas completas aprobadas ocultas y retirada personal sin borrar imágenes ni cargos",async()=>withOrderProvider(async(config)=>{
      const {p,c,s:sub}=await hierarchyForReview(),actor=(await db.user.findFirstOrThrow({where:{role:"OWNER"}}));
      const jobs=await reserveJobs(actor.id,p.id,[{subproductId:sub.id,key:randomUUID(),snapshot:{prompt:"Contenido sintético",mode:"Texto",format:"1:1"}}],config.revision);
      const created=await owner.call("orders","POST",{ids:jobs.map(j=>j.id),mode:"immediate",requestId:randomUUID()});const id=created.body.orders[0];
      assert.equal((await owner.call("orders/hide","POST",{ids:[id]})).status,409);
      await db.generationJob.update({where:{id:jobs[0].id},data:{status:"COMPLETED"}});const variation=await db.variation.create({data:{jobId:jobs[0].id,subproductId:sub.id,path:"synthetic-list.png",model:"synthetic",expiresAt:new Date(Date.now()+86400000)}});await db.generationOrder.update({where:{id},data:{status:"COMPLETED"}});
      const path=`library/explorer?project=${p.id}&product=${c.id}&subproduct=${sub.id}`;
      assert((await owner.call(path)).body.orders.some((o:any)=>o.id===id));
      const rootView=(await owner.call("library/explorer")).body;assert.equal(rootView.foldersOnly,true);assert.equal(rootView.items.length,0);assert.equal(rootView.documents.length,0);assert(rootView.tree.some((n:any)=>n.id==="subproduct:"+sub.id));
      const upload=new FormData();upload.set("file",new File(["Documento suelto"],"sin-carpeta.txt",{type:"text/plain"}));const uploaded=await fetch(root+"/api/library/documents",{method:"POST",headers:{Cookie:owner.cookie,Origin:root},body:upload});assert.equal(uploaded.status,201);const doc=await uploaded.json();assert.equal((await owner.call("library/explorer")).body.documents.length,0);assert((await owner.call("library/explorer?folder=loose:root")).body.documents.some((row:any)=>row.id===doc.id));assert(!(await observer.call("library/explorer?folder=loose:root")).body.documents.some((row:any)=>row.id===doc.id));
      const before=await db.usageLedger.findUniqueOrThrow({where:{jobId:jobs[0].id}});
      assert.equal((await user.call("orders/hide","POST",{ids:[id]})).status,403);
      assert.equal((await observer.call("orders/hide","POST",{ids:[id]})).status,403);
      const hidden=await owner.call("orders/hide","POST",{ids:[id]});assert.equal(hidden.status,200);assert(!(await owner.call(path)).body.orders.some((o:any)=>o.id===id));assert((await owner.call(path)).body.items.some((v:any)=>v.id===variation.id));assert.equal((await owner.call(`orders?ids=${id}`)).body[0].hiddenFromProduction,true);assert.equal((await db.usageLedger.findUniqueOrThrow({where:{jobId:jobs[0].id}})).status,before.status);assert.equal((await db.variation.findUniqueOrThrow({where:{id:variation.id}})).reviewStatus,"PENDING");
      // Clearing this presentation event is test setup to isolate automatic completion filtering.
      await db.auditEvent.deleteMany({where:{actorId:actor.id,action:"ORDEN_RETIRADA_DE_BIBLIOTECA",resourceId:id}});await db.variation.update({where:{id:variation.id},data:{reviewStatus:"APPROVED"}});assert(!(await owner.call(path)).body.orders.some((o:any)=>o.id===id));assert((await owner.call(path)).body.items.some((v:any)=>v.id===variation.id));assert((await owner.call(`orders?project=${p.id}&includeClosed=true`)).body.some((o:any)=>o.id===id&&o.status==="COMPLETED"));
    }));
    await t.test("Galería unificada: espacios paginados, aprobación, retiradas y contador real",async()=>withOrderProvider(async(config)=>{
      const {p,c,s:sub}=await hierarchyForReview(),actor=await db.user.findFirstOrThrow({where:{role:"OWNER"}});
      const jobs=await reserveJobs(actor.id,p.id,Array.from({length:28},()=>({subproductId:sub.id,key:randomUUID(),snapshot:{prompt:"Galería sintética",mode:"Texto",format:"1:1"}})),config.revision);
      const created=await owner.call("orders","POST",{ids:jobs.map(j=>j.id),mode:"immediate",requestId:randomUUID()});const id=created.body.orders[0];
      const images=[];
      for(const job of jobs.slice(0,4)){
        await db.generationJob.update({where:{id:job.id},data:{status:"COMPLETED"}});
        images.push(await db.variation.create({data:{jobId:job.id,subproductId:sub.id,path:"gallery-test.png",model:"synthetic",expiresAt:new Date(Date.now()+86400000)}}));
      }
      await db.generationOrder.update({where:{id},data:{status:"REVIEW"}});
      const path=`library/explorer?project=${p.id}&product=${c.id}&subproduct=${sub.id}&limit=25`;
      const first=(await owner.call(path)).body,second=(await owner.call(path+"&page=2")).body;
      assert.equal(first.total,4);assert.equal(first.inflightTotal,24);assert.equal(first.entries.length,25);assert.equal(second.entries.length,3);assert.equal(first.pages,2);
      assert.equal(new Set([...first.entries,...second.entries].map((v:any)=>v.id)).size,28);
      assert.equal(first.inflight.length+second.inflight.length,24);assert(first.inflight.every((v:any)=>v.orderId===id));
      assert.equal((await owner.call("library/explorer")).body.entries.length,0);
      assert.equal((await owner.call(path+"&review=approved")).body.inflightTotal,0);
      assert.equal((await observer.call(path)).status,404);
      await db.subproductMember.createMany({data:[{subproductId:sub.id,userId:oid},{subproductId:sub.id,userId:uid}]});
      await db.variation.update({where:{id:images[0].id},data:{reviewStatus:"APPROVED"}});
      const observerView=await observer.call(path);assert.equal(observerView.status,200);assert.equal(observerView.body.inflightTotal,0);assert.equal(observerView.body.total,1);
      const sharedView=await user.call(path);assert.equal(sharedView.status,200);assert.equal(sharedView.body.inflightTotal,0);
      assert.equal((await observer.call(`categories/${c.id}/image-counts`)).body.find((s:any)=>s.id===sub.id).count,1);
      const removed=await owner.call("library/item-actions","POST",{action:"remove",ids:images.slice(0,2).map(v=>v.id)});assert.equal(removed.status,200);
      assert.equal((await owner.call(path)).body.total,2);
      const category=(await owner.call(`categories/${c.id}`)).body;
      assert.equal(category.subproducts.find((s:any)=>s.id===sub.id)._count.variations,2);
      assert.equal((await owner.call(`categories/${c.id}/image-counts`)).body.find((s:any)=>s.id===sub.id).count,2);
      assert.equal(await db.variation.count({where:{subproductId:sub.id,deletedAt:null}}),4);
      assert.equal((await observer.call(`categories/${c.id}/image-counts`)).body.find((s:any)=>s.id===sub.id).count,1);
      await db.variation.update({where:{id:images[3].id},data:{expiresAt:new Date(Date.now()-1000)}});
      assert.equal((await owner.call(`categories/${c.id}/image-counts`)).body.find((s:any)=>s.id===sub.id).count,1);
      await db.variation.update({where:{id:images[3].id},data:{expiresAt:new Date(Date.now()+86400000)}});
      await db.generationJob.updateMany({where:{id:{in:jobs.slice(4).map(j=>j.id)}},data:{status:"FAILED"}});
      await db.generationOrder.update({where:{id},data:{status:"NEEDS_REVIEW",error:"Error sintético"}});
      assert.equal((await owner.call(path)).body.inflightTotal,24);
      assert.equal((await owner.call("orders/hide","POST",{ids:[id]})).status,200);
      assert.equal((await owner.call(path)).body.inflightTotal,0);
      assert.equal((await owner.call(path)).body.total,2);
    }));
    await t.test("Contadores por período: historial completo, eliminadas personales, muestras, retención, errores y permisos",async()=>{
      const {p,c,s:sub}=await hierarchyForReview(),actor=await db.user.findFirstOrThrow({where:{role:"OWNER"}});
      const empty=await db.subproduct.create({data:{name:"Sin generaciones",categoryId:c.id}});
      const day=new Date("2026-10-01T05:00:00Z"),end=new Date("2026-10-02T04:59:59.999Z"),next=new Date("2026-10-02T05:00:00Z");
      const createdJobs:string[]=[],images:string[]=[];
      async function seed(status:string,group:string,index:number,review?:string,options:{date?:Date;actorId?:string;previewFirst?:boolean}={}){
        const job=await db.generationJob.create({data:{actorId:options.actorId??actor.id,projectId:p.id,subproductId:sub.id,idempotencyKey:randomUUID(),status,createdAt:options.date??day,reservedMicros:0n,snapshot:{previewFirst:options.previewFirst??true,approvalGroup:group,index}}});createdJobs.push(job.id);
        if(review){const image=await db.variation.create({data:{jobId:job.id,subproductId:sub.id,path:"statistics-synthetic.png",model:"synthetic",reviewStatus:review,expiresAt:new Date(Date.now()+86400000)}});images.push(image.id);return image.id;}return job.id;
      }
      await seed("COMPLETED","held",0,"PENDING");await seed("PENDING","held",1);await seed("CANCELLED","held",2);await seed("FAILED","held",3);await seed("UNCERTAIN","held",4);await seed("RUNNING","held",5);
      await seed("COMPLETED","held-end",0,"PENDING",{date:end});await seed("PENDING","held-end",1,undefined,{date:end});
      const approved=await seed("COMPLETED","approved",0,"APPROVED");await seed("PENDING","approved",1);
      await seed("FAILED","failed-sample",0);await seed("PENDING","failed-sample",1);
      await seed("COMPLETED","no-preview",0,"PENDING",{previewFirst:false});
      for(let i=0;i<31;i++)await seed("COMPLETED","normal-"+i,0,"APPROVED",{previewFirst:false});
      const deleted=images.at(-1)!,excluded=images.at(-2)!,expired=images.at(-3)!;
      await db.variation.update({where:{id:deleted},data:{deletedAt:new Date()}});
      await db.libraryExclusion.create({data:{userId:actor.id,variationId:excluded}});
      await db.variation.update({where:{id:expired},data:{expiresAt:new Date(Date.now()-1000),expired:true}});
      await seed("COMPLETED","other-actor",0,"PENDING",{actorId:uid});await seed("PENDING","other-actor",1);
      await seed("COMPLETED","tomorrow",0,"APPROVED",{date:next});await seed("FAILED","tomorrow",1,undefined,{date:next});
      const endpoint=`categories/${c.id}/image-counts?statistics=true`,period="&from=2026-10-01&to=2026-10-01";
      const response=await owner.call(endpoint+period);assert.equal(response.status,200);
      const row=response.body.find((r:any)=>r.id===sub.id);
      assert.deepEqual(row.statistics,{generated:36,deleted:2,unapproved:3,approvalBlocked:3,failed:2,uncertain:1});
      assert.equal(row.count,34);assert.deepEqual(response.body.find((r:any)=>r.id===empty.id).statistics,{generated:0,deleted:0,unapproved:0,approvalBlocked:0,failed:0,uncertain:0});
      const tomorrow=(await owner.call(endpoint+"&from=2026-10-02&to=2026-10-02")).body.find((r:any)=>r.id===sub.id);assert.equal(tomorrow.statistics.generated,1);assert.equal(tomorrow.statistics.failed,1);assert.equal(tomorrow.statistics.unapproved,0);assert.equal(tomorrow.count,34);
      assert.equal((await owner.call(endpoint)).body.find((r:any)=>r.id===sub.id).statistics.generated,37);
      assert.equal((await owner.call(endpoint+"&from=2026-02-30")).status,400);assert.equal((await owner.call(endpoint+"&from=2026-10-02&to=2026-10-01")).status,400);
      assert.equal((await user.call(endpoint)).status,404);
      await db.subproductMember.createMany({data:[{userId:uid,subproductId:sub.id},{userId:oid,subproductId:sub.id}]});
      const personal=(await user.call(endpoint+period)).body;assert.equal(personal.length,1);assert.equal(personal[0].statistics.unapproved,1);assert.equal(personal[0].statistics.failed,0);assert.equal(personal[0].statistics.uncertain,0);assert.equal(personal[0].statistics.approvalBlocked,0);assert.equal(personal[0].statistics.deleted,0);
      const watched=(await observer.call(endpoint+period)).body;assert.equal(watched.length,1);assert.equal(watched[0].statistics.unapproved,0);assert.equal(watched[0].statistics.approvalBlocked,0);assert.equal(watched[0].statistics.failed,0);assert.equal(watched[0].statistics.deleted,0);
      await db.libraryExclusion.create({data:{userId:uid,variationId:approved}});assert.equal((await user.call(endpoint+period)).body[0].statistics.deleted,1);assert.equal((await owner.call(endpoint+period)).body.find((r:any)=>r.id===sub.id).statistics.deleted,2);
      await seed("FAILED","published-status-private",0,"APPROVED",{previewFirst:false});
      assert.equal((await observer.call(endpoint+period)).body[0].statistics.failed,0);
      assert.equal((await owner.call(endpoint+period)).body.find((r:any)=>r.id===sub.id).statistics.failed,3);
      assert(!JSON.stringify(response.body).includes("approvalGroup"));assert(!JSON.stringify(response.body).includes("actorId"));
      await owner.call(endpoint+period);assert.equal(await db.generationJob.count({where:{id:{in:createdJobs}}}),createdJobs.length);assert.equal(await db.usageLedger.count({where:{jobId:{in:createdJobs}}}),0);
      await db.generationJob.updateMany({where:{id:{in:createdJobs},status:"RUNNING"},data:{status:"CANCELLED"}});
    });
    await t.test("Biblioteca independiente del origen: eliminar/restaurar cada nivel conserva carpetas, imágenes, edición, permisos y descargas",async()=>{
      const {default:sharp}=await import("sharp"),{store,load}=await import("../lib/storage"),JSZip=(await import("jszip")).default;
      const bytes=await sharp({create:{width:512,height:512,channels:3,background:"#164c58"}}).png().toBuffer();
      const actor=await db.user.findFirstOrThrow({where:{role:"OWNER"}});
      for(const level of ["subproduct","category","project"]){
        const {p,c,s:sub}=await hierarchyForReview();
        const sibling=await db.subproduct.create({data:{name:"Hermano privado",categoryId:c.id,prompt:"No compartir este contenido"}});
        await db.subproductMember.createMany({data:[{userId:uid,subproductId:sub.id},{userId:oid,subproductId:sub.id}]});
        const job=await db.generationJob.create({data:{actorId:actor.id,projectId:p.id,subproductId:sub.id,idempotencyKey:randomUUID(),status:"COMPLETED",snapshot:{prompt:"Snapshot privado",mode:"Texto",orderId:"synthetic-source-order"},reservedMicros:0n}});
        const path=await store(bytes),image=await db.variation.create({data:{jobId:job.id,subproductId:sub.id,path,model:"synthetic",reviewStatus:"APPROVED",expiresAt:new Date(Date.now()+86400000)}});
        await db.imageVersion.create({data:{variationId:image.id,number:1,path,actorId:actor.id}});
        await db.usageLedger.create({data:{jobId:job.id,actorId:actor.id,projectId:p.id,model:"synthetic",reservedMicros:0n,status:"FINAL",actualMicros:0n}});
        const autoKey=(level==="category"?"product":level)+":"+(level==="project"?p.id:level==="category"?c.id:sub.id);
        const parent=(await owner.call("library/folder-actions","POST",{action:"create",name:"Carpeta independiente",destination:autoKey})).body;
        const child=(await owner.call("library/folder-actions","POST",{action:"create",name:"Subcarpeta independiente",destination:"folder:"+parent.id})).body;
        await db.libraryItem.create({data:{userId:actor.id,variationId:image.id,folderId:child.id}});
        const ids=["project:"+p.id,"product:"+c.id,"subproduct:"+sub.id,"folder:"+parent.id,"folder:"+child.id];
        const resource=level==="project"?`projects/${p.id}`:level==="category"?`categories/${c.id}`:`subproducts/${sub.id}`;
        assert.equal((await owner.call(resource,"DELETE")).status,200);
        const filter=new URLSearchParams({project:p.id,product:c.id,subproduct:sub.id,folder:"subproduct:"+sub.id});
        const ownerFilter=new URLSearchParams(filter);ownerFilter.set("folder","folder:"+child.id);
        const current=await owner.call("library/explorer?"+ownerFilter);assert.equal(current.status,200);assert.equal(current.body.total,1);
        assert.equal(current.body.items[0].sourceNotice,"Viene de un "+({project:"proyecto",category:"producto",subproduct:"subproducto"}[level])+" eliminado");
        for(const id of ids)assert(current.body.tree.some((node:any)=>node.id===id));
        assert.equal((await owner.call("library/explorer?folder=folder:"+child.id)).body.items[0].id,image.id);
        assert.equal((await owner.call(`subproducts/${sub.id}`)).status,404);assert.equal((await owner.call(`subproducts/${sub.id}/instructions`)).status,404);
        const metadata=await user.call("library/hierarchy?"+filter);assert.equal(metadata.status,200);assert.deepEqual(metadata.body.subproducts.map((v:any)=>v.id),[sub.id]);assert(!JSON.stringify(metadata.body).includes("Snapshot privado"));assert(!JSON.stringify(metadata.body).includes("No compartir este contenido"));
        for(const reader of [owner,user,observer]){
          const listing=await reader.call("library/explorer?"+(reader===owner?ownerFilter:filter));assert.equal(listing.status,200);assert.equal(listing.body.items[0].id,image.id);assert(!listing.body.tree.some((node:any)=>node.id==="subproduct:"+sibling.id&&reader!==owner));
          const download=await fetch(root+`/api/variations/${image.id}?download`,{headers:{Cookie:reader.cookie}});assert.equal(download.status,200);assert(Buffer.from(await download.arrayBuffer()).equals(bytes));
          assert.equal((await reader.call(`variations/${image.id}/design`)).status,200);
        }
        const exported=await fetch(root+"/api/exports",{method:"POST",headers:{Cookie:user.cookie,Origin:root,"Content-Type":"application/json"},body:JSON.stringify({ids:[image.id],format:"png"})});assert.equal(exported.status,200);const zip=await JSZip.loadAsync(await exported.arrayBuffer());assert.equal(Object.values(zip.files).filter(f=>!f.dir).length,1);
        assert.equal((await observer.call(`variations/${image.id}/enable-layers`,"POST",{expectedRevision:1})).status,403);
        assert.equal((await owner.call(`variations/${image.id}/enable-layers`,"POST",{expectedRevision:1})).status,200);
        const design=await owner.call(`variations/${image.id}/design`);assert.equal(design.body.revision,2);assert.equal(design.body.orderId,null);
        assert.equal((await owner.call(`variations/${image.id}/manual`,"POST",{expectedRevision:2,document:design.body.document})).status,200);
        assert.equal((await owner.call(`jobs/${job.id}/approve`,"POST")).status,200);
        assert.equal((await owner.call(`variations/${image.id}/regenerate`,"POST",{expectedRevision:3,prompt:"Otra",requestId:randomUUID(),confirmCharge:true,reviewedInstructions:true})).status,404);
        assert.equal((await owner.call(`variations/${image.id}/edit-ai`,"POST",{expectedRevision:3,prompt:"Otra",requestId:randomUUID(),confirmCharge:true,reviewedInstructions:true})).status,404);
        assert.equal(await db.generationJob.count({where:{subproductId:sub.id}}),1);assert.equal((await db.usageLedger.findUniqueOrThrow({where:{jobId:job.id}})).actualMicros,0n);
        await db.subproductMember.delete({where:{subproductId_userId:{subproductId:sub.id,userId:uid}}});
        assert.equal((await user.call("library/explorer?"+filter)).status,404);assert.equal((await user.call(`variations/${image.id}/design`)).status,404);
        const afterRevocation=await user.call("library/tree");assert(!afterRevocation.body.some((node:any)=>ids.includes(node.id)));
        assert.equal((await owner.call(resource+"/restore","POST")).status,200);
        const restored=(await owner.call("library/explorer?"+ownerFilter)).body;assert.equal(restored.items[0].sourceNotice,null);for(const id of ids)assert.equal(restored.tree.filter((node:any)=>node.id===id).length,1);
        const before=await db.subproduct.findUniqueOrThrow({where:{id:sub.id}});
        assert.equal((await owner.call("library/folder-actions","POST",{action:"delete",ids:[parent.id]})).status,200);
        assert.equal(await db.libraryFolder.count({where:{id:{in:[parent.id,child.id]}}}),0);
        assert.equal((await db.libraryItem.findUniqueOrThrow({where:{userId_variationId:{userId:actor.id,variationId:image.id}}})).folderId,null);
        assert((await owner.call("library/explorer?folder=loose:root")).body.items.some((v:any)=>v.id===image.id));
        const after=await db.subproduct.findUniqueOrThrow({where:{id:sub.id}});assert.deepEqual(after,before);assert.equal((await owner.call(`projects/${p.id}`)).status,200);assert.equal((await owner.call(`categories/${c.id}`)).status,200);assert.equal((await owner.call(`subproducts/${sub.id}`)).status,200);
        assert((await load(path)).equals(bytes));assert.equal(await db.generationJob.count({where:{subproductId:sub.id}}),1);
      }
    });
    await t.test("Costos de selección: ninguno/todos, uno y varios con CSV, fechas, desconocidos y permisos",async()=>{
      const {p,c,s}=await hierarchyForReview(),actor=await db.user.findFirstOrThrow({where:{role:"OWNER"}});
      const others=(await owner.call(`categories/${c.id}/subproducts`,"POST",{names:["Segundo costo","Costo desconocido"]})).body,subs=[s,...others];
      for(const [i,sub] of subs.entries()){
        const job=await db.generationJob.create({data:{actorId:actor.id,projectId:p.id,subproductId:sub.id,idempotencyKey:randomUUID(),status:"COMPLETED",snapshot:{},reservedMicros:0n}});
        await db.usageLedger.create({data:{jobId:job.id,actorId:actor.id,projectId:p.id,model:"selected-cost-"+i,status:"CONSUMED_ESTIMATE",reservedMicros:0n,actualMicros:i===2?null:BigInt(i+1)*1000000n,createdAt:new Date("2026-10-01T05:00:00Z")}});
      }
      const base=`days=all&project=${p.id}&product=${c.id}`,one=`&subproducts=${s.id}`,two=`&subproducts=${s.id},${others[0].id}`;
      const all=await owner.call("usage/list?"+base);assert.equal(all.body.total,3);assert.equal(all.body.summary.knownActualMicros,"3000000");assert.equal(all.body.summary.unknownCosts,1);
      const single=await owner.call("usage/list?"+base+one);assert.equal(single.body.total,1);assert.equal(single.body.summary.knownActualMicros,"1000000");
      const pair=await owner.call("usage/list?"+base+two);assert.equal(pair.body.total,2);assert.equal(pair.body.summary.knownActualMicros,"3000000");assert.equal(pair.body.summary.unknownCosts,0);
      assert.equal((await owner.call("usage/summary?"+base+two)).body.summary.knownActualMicros,"3000000");
      assert.equal((await owner.call("usage/list?"+base+two+"&from=2026-10-02&to=2026-10-02")).body.total,0);
      const csv=await fetch(root+"/api/usage/export?"+base+two,{headers:{Cookie:owner.cookie}});assert.equal(csv.status,200);const text=await csv.text();assert(text.includes("selected-cost-0"));assert(text.includes("selected-cost-1"));assert(!text.includes("selected-cost-2"));
      const foreign=await hierarchyForReview();assert.equal((await owner.call("usage/list?"+base+`&subproducts=${s.id},${foreign.s.id}`)).status,404);
      assert.equal((await owner.call("usage/list?"+base+"&subproducts=,")).status,400);assert.equal((await owner.call("usage/list?"+base+one+`&subproduct=${s.id}`)).status,400);
      await db.subproductMember.create({data:{userId:uid,subproductId:s.id}});
      assert.equal((await user.call("usage/list?"+base+one)).body.total,1);assert.equal((await user.call("usage/list?"+base+two)).status,404);
      assert.equal((await observer.call("usage/list?"+base+one)).status,403);
    });
    await t.test("Compartir selección: un correo, operación atómica, pertenencia, permisos y revocación acotada",async()=>{
      const {p,c,s}=await hierarchyForReview(),others=(await owner.call(`categories/${c.id}/subproducts`,"POST",{names:["Compartido dos","Hermano sin compartir"]})).body;
      const ids=[s.id,others[0].id],email=(await db.user.findUniqueOrThrow({where:{id:uid}})).email,base=`categories/${c.id}/subproduct-members`,url=base+"?ids="+ids.join(",");
      const jobs=await db.generationJob.count(),ledger=await db.usageLedger.count();
      assert.equal((await owner.call(base+"?ids=","POST",{email})).status,400);assert.equal((await user.call(url,"POST",{email})).status,403);assert.equal((await observer.call(url+"&q=a")).status,403);
      const foreign=await hierarchyForReview();assert.equal((await owner.call(base+`?ids=${s.id},${foreign.s.id}`,"POST",{email})).status,404);assert.equal(await db.subproductMember.count({where:{subproductId:s.id}}),0);
      const granted=await Promise.all([owner.call(url,"POST",{email}),owner.call(url,"POST",{email})]);assert(granted.every(r=>r.status===200));assert.equal(await db.subproductMember.count({where:{subproductId:{in:ids},userId:uid}}),2);
      const list=await owner.call(url);assert.equal(list.body.members.find((m:any)=>m.userId===uid).subproductCount,2);
      assert.equal((await user.call(`subproducts/${s.id}`)).status,200);assert.equal((await user.call(`subproducts/${others[0].id}`)).status,200);assert.equal((await user.call(`subproducts/${others[1].id}`)).status,404);
      const parent=(await user.call(`categories/${c.id}`)).body;assert.equal(parent.prompt,"");assert.equal(parent.subproducts.length,2);assert.equal(await db.projectMember.count({where:{projectId:p.id,userId:uid}}),0);assert.equal(await db.categoryMember.count({where:{categoryId:c.id,userId:uid}}),0);
      assert.equal((await user.call(url)).status,403);assert.equal((await user.call(base+"/directory?ids="+ids.join(","))).status,403);
      const directory=await owner.call(base+"/directory?ids="+ids.join(",")+"&q="+encodeURIComponent(email));assert.equal(directory.status,200);assert(directory.body.users.some((u:any)=>u.id===uid));
      await db.subproductMember.create({data:{subproductId:others[1].id,userId:uid}});
      const revoked=await owner.call(base+"/"+uid+"?ids="+ids.join(","),"DELETE");assert.equal(revoked.status,200);assert.equal(await db.subproductMember.count({where:{subproductId:{in:ids},userId:uid}}),0);assert.equal(await db.subproductMember.count({where:{subproductId:others[1].id,userId:uid}}),1);
      await owner.call(`subproducts/${others[0].id}`,"DELETE");assert.equal((await owner.call(url,"POST",{email})).status,404);assert.equal(await db.subproductMember.count({where:{subproductId:s.id,userId:uid}}),0);
      assert.equal(await db.generationJob.count(),jobs);assert.equal(await db.usageLedger.count(),ledger);
    });
    await t.test("Biblioteca: movimientos y copias por selección, ciclos mixtos, borrado independiente y revocación",async()=>{
      const {p,c,s:sub}=await hierarchyForReview(),actor=await db.user.findFirstOrThrow({where:{role:"OWNER"}});
      const source=await db.variation.findFirstOrThrow({where:{deletedAt:null,expired:false,expiresAt:{gt:new Date()}}});
      const job=await db.generationJob.create({data:{actorId:actor.id,projectId:p.id,subproductId:sub.id,idempotencyKey:randomUUID(),status:"COMPLETED",snapshot:{prompt:"Privado"},reservedMicros:0n}});
      const image=await db.variation.create({data:{jobId:job.id,subproductId:sub.id,path:source.path,model:"synthetic-organization",reviewStatus:"APPROVED",expiresAt:new Date(Date.now()+86400000)}});
      const sourceBefore=await db.subproduct.findUniqueOrThrow({where:{id:sub.id}}),jobs=await db.generationJob.count(),ledger=await db.usageLedger.count();
      const run=(client:Client,operation:string,selection:string[],destination?:string)=>client.call("library/selection-actions","POST",{operation,selection,...(destination?{destination}:{})});
      const folder=(await owner.call("library/folder-actions","POST",{action:"create",name:"Destino Windows"})).body,key="folder:"+folder.id,auto="subproduct:"+sub.id;
      assert.equal((await run(observer,"move",["n:"+auto],key)).status,403);
      assert.equal((await run(user,"move",["n:"+auto],key)).status,404);
      assert.equal((await run(owner,"move",["n:"+auto],key)).status,200);
      let tree=(await owner.call("library/tree")).body;assert.equal(tree.find((n:any)=>n.id===auto).parentId,key);
      assert.equal((await owner.call("library/tree?organization=source")).body.find((n:any)=>n.id===auto).parentId,"product:"+c.id);
      assert.equal((await run(owner,"move",["n:"+key],auto)).status,400);
      assert.equal((await owner.call("library/explorer?folder="+key)).body.total,0);
      assert.equal((await owner.call("library/explorer?folder="+auto)).body.items[0].id,image.id);
      assert.equal((await run(owner,"copy",["n:"+auto],"loose:root")).status,200);
      const copied=await db.libraryFolder.findFirstOrThrow({where:{userId:actor.id,name:sub.name+" · copia"}}),copyKey="folder:"+copied.id;
      let view=(await owner.call("library/explorer?folder="+copyKey)).body;assert.equal(view.total,1);assert.equal(view.items[0].id,image.id);assert.equal(view.items[0].copied,true);assert.equal(view.counts.BROUGHT,1);assert.equal(view.counts.COMPLETED??0,0);
      const copySelection=view.items[0].selectionId;
      assert.equal((await run(owner,"move",[copySelection],auto)).status,200);
      assert.equal((await owner.call("library/explorer?folder="+copyKey)).body.total,0);
      assert.equal((await run(owner,"move",["v:"+image.id],copyKey)).status,200);
      view=(await owner.call("library/explorer?folder="+copyKey)).body;assert.equal(view.total,1);assert.equal(view.counts.BROUGHT,1);
      assert.equal((await run(owner,"delete",["v:"+image.id])).status,200);
      view=(await owner.call("library/explorer?folder="+copyKey)).body;assert.equal(view.total,0);assert.equal(view.counts.DELETED,1);assert.equal(view.counts.BROUGHT,1);
      view=(await owner.call("library/explorer?folder="+auto)).body;assert.equal(view.total,1);assert.equal(view.items[0].selectionId,copySelection);
      // Explicit references preserve original permissions, even after moving/copying into personal folders.
      await db.subproductMember.create({data:{subproductId:sub.id,userId:uid}});
      const userFolder=(await user.call("library/folder-actions","POST",{action:"create",name:"Copia de usuario"})).body;
      assert.equal((await run(user,"copy",["v:"+image.id],"folder:"+userFolder.id)).status,200);
      assert.equal((await user.call("library/explorer?folder=folder:"+userFolder.id)).body.total,1);
      await db.subproductMember.delete({where:{subproductId_userId:{subproductId:sub.id,userId:uid}}});
      assert.equal((await user.call("library/explorer?folder=folder:"+userFolder.id)).body.total,0);
      assert.equal((await run(owner,"delete",["n:"+key])).status,200);
      assert(!(await owner.call("library/tree")).body.some((n:any)=>n.id===auto));
      assert((await owner.call("library/tree?organization=source")).body.some((n:any)=>n.id===auto));
      assert.equal((await owner.call("library/explorer?folder=loose:root")).body.items.some((i:any)=>i.selectionId===copySelection),true);
      assert.deepEqual(await db.subproduct.findUniqueOrThrow({where:{id:sub.id}}),sourceBefore);
      assert.equal((await run(owner,"restore",[])).status,200);assert((await owner.call("library/tree")).body.some((n:any)=>n.id===auto));
      assert.equal(await db.generationJob.count(),jobs);assert.equal(await db.usageLedger.count(),ledger);assert.equal((await db.variation.findUniqueOrThrow({where:{id:image.id}})).path,source.path);
    });
    await t.test("Biblioteca: paginación combinada y contadores de importados, eliminados y fechas",async()=>{
      const {p,c,s:sub}=await hierarchyForReview(),actor=await db.user.findFirstOrThrow({where:{role:"OWNER"}}),source=await db.variation.findFirstOrThrow({where:{deletedAt:null,expired:false,expiresAt:{gt:new Date()}}});
      const job=await db.generationJob.create({data:{actorId:actor.id,projectId:p.id,subproductId:sub.id,idempotencyKey:randomUUID(),status:"COMPLETED",snapshot:{},reservedMicros:0n,createdAt:new Date("2026-10-01T15:00:00Z")}});
      const image=await db.variation.create({data:{jobId:job.id,subproductId:sub.id,path:source.path,model:"synthetic-pages",reviewStatus:"APPROVED",expiresAt:new Date(Date.now()+86400000),createdAt:new Date("2026-10-01T15:00:00Z")}});
      const key="subproduct:"+sub.id;
      await db.libraryImageCopy.createMany({data:Array.from({length:28},(_,i)=>({userId:actor.id,variationId:image.id,destinationKey:key,createdAt:new Date("2026-10-02T15:00:00Z")}))});
      const one=(await owner.call("library/explorer?folder="+key+"&limit=25")).body,two=(await owner.call("library/explorer?folder="+key+"&limit=25&page=2")).body;
      assert.equal(one.items.length,25);assert.equal(two.items.length,4);assert.equal(new Set([...one.items,...two.items].map((i:any)=>i.entryId)).size,29);
      const filtered=(await owner.call("library/explorer?folder="+key+"&from=2026-10-02&to=2026-10-02")).body;assert.equal(filtered.total,28);assert.equal(filtered.counts.BROUGHT,28);
      const form=new FormData();form.set("destination",key);form.set("file",new File(["Documento pegado"],"importado.txt",{type:"text/plain"}));
      const uploaded=await fetch(root+"/api/library/documents",{method:"POST",headers:{Cookie:owner.cookie,Origin:root},body:form});assert.equal(uploaded.status,201);const doc=await uploaded.json();
      assert((await owner.call("library/explorer?folder="+key)).body.documents.some((d:any)=>d.id===doc.id));
      assert.equal((await owner.call("library/selection-actions","POST",{operation:"copy",selection:["d:"+doc.id],destination:key})).status,200);
      assert.equal((await owner.call("library/documents/"+doc.id,"DELETE")).status,200);
      const docs=(await owner.call("library/explorer?folder="+key)).body;assert.equal(docs.documents.length,1);assert.equal(docs.counts.DELETED,1);assert.equal(docs.counts.BROUGHT,30);
      const bytes=await fetch(root+"/api/library/documents/"+docs.documents[0].id,{headers:{Cookie:owner.cookie}});assert.equal(bytes.status,200);assert.equal(await bytes.text(),"Documento pegado");
      const malformed=await owner.call("library/selection-actions","POST",{operation:"move",selection:["d:"+docs.documents[0].id,"v:unknown"],destination:"loose:root"});assert.equal(malformed.status,404);
      assert.equal((await owner.call("library/explorer?folder="+key)).body.documents.length,1);
      const survivor=docs.documents[0].id;assert.equal(await db.assetDeletion.count({where:{path:doc.path}}),0);
      assert.equal((await owner.call("library/selection-actions","POST",{operation:"delete",selection:["d:"+survivor]})).status,200);
      assert.equal(await db.assetDeletion.count({where:{path:doc.path}}),1);
    });
    const engineValues=(c:any)=>({aiEnabled:c.aiEnabled,propioxEnabled:c.propioxEnabled,defaultEngine:c.defaultEngine,quality:c.quality,resolution:c.resolution,revision:c.revision});
    async function setEngines(patch:Record<string,unknown>){const c=(await owner.call('engines/config')).body;const r=await owner.call('engines/config','PUT',{...engineValues(c),...patch});assert.equal(r.status,200,JSON.stringify(r.body));return r.body;}
    async function uploadStored(folderId:string,name:string,purpose:string,client=owner){const sharp=(await import('sharp')).default;const png=await sharp({create:{width:400,height:500,channels:3,background:'#9fbccc'}}).png().toBuffer();const form=new FormData();form.set('file',new File([new Uint8Array(png)],name,{type:'image/png'}));form.set('folderId',folderId);form.set('purpose',purpose);const r=await fetch(root+'/api/storage/files',{method:'POST',headers:{Cookie:client.cookie,Origin:root},body:form});return {status:r.status,body:await r.json()};}
    await t.test('Referencias de Biblioteca: propiedad, carpetas heredadas, selección acotada y logos conservados en versiones',async()=>withOrderProvider(async()=>{
      const {previewSubproduct}=await import('../lib/generation');const {boundStorageReferences}=await import('../lib/resource-storage');const {load}=await import('../lib/storage');
      const provider=(await import('../lib/providers')).adapter('openai'),originalGenerate=provider.generate;provider.generate=async()=>({bytes:await (await import('sharp')).default({create:{width:1024,height:1024,channels:3,background:'#6789ab'}}).png().toBuffer(),usage:null});
      try{
        await setEngines({aiEnabled:true,propioxEnabled:false,defaultEngine:'ai'});const actor=await db.user.findFirstOrThrow({where:{role:'OWNER'}});const {p,c,s}=await hierarchyForReview();
        const f=(await owner.call('library/folder-actions','POST',{action:'create',name:'Recursos Psicología'})).body;const child=(await owner.call('library/folder-actions','POST',{action:'create',name:'Fotos',destination:'folder:'+f.id})).body;
        const photo=await uploadStored(child.id,'Psicología forense profesional.png','Fotografía principal'),logo=await uploadStored(f.id,'WOSA.png','Logo');assert.equal(photo.status,201);assert.equal(logo.status,201);
        assert.equal((await uploadStored(f.id,'Ajena.png','Logo',user)).status,404);assert.equal((await user.call('storage/files?folder='+f.id)).status,404);assert.equal((await user.call('storage/files/'+photo.body.id,'PATCH',{name:'Ajena',purpose:'Fondo',description:''})).status,404);assert.equal((await observer.call('storage/files/'+photo.body.id,'PATCH',{name:'Ajena',purpose:'Fondo',description:''})).status,403);
        const privateDownload=await fetch(root+'/api/library/documents/'+photo.body.id,{headers:{Cookie:user.cookie}});assert.equal(privateDownload.status,404);
        const own=(await user.call('library/folder-actions','POST',{action:'create',name:'Mis recursos'})).body;assert.equal((await owner.call(`storage-bindings/subproduct/${s.id}`,'PUT',{folderIds:[own.id]})).status,404);
        assert.equal((await owner.call(`storage-bindings/project/${p.id}`,'PUT',{folderIds:[f.id]})).status,200);
        await owner.call('subproducts/'+s.id,'PATCH',{name:'PSICOLOGÍA FORENSE',prompt:'Título: DIPLOMADO EN PSICOLOGÍA FORENSE\nOferta: MENSUALIDADES GRATIS',settings:{count:1,textCount:0,imageTextCount:1,imageCount:0}});
        let preview=await previewSubproduct(s.id);assert.equal(preview.storageReferences.length,2);
        await db.subproductMember.create({data:{subproductId:s.id,userId:uid}});let visible=await user.call(`subproducts/${s.id}/instructions`);assert.equal(visible.status,200);assert(!JSON.stringify(visible.body).includes('WOSA.png'));assert.equal((await user.call(`storage-bindings/project/${p.id}`)).status,404);
        await owner.call('subproducts/'+s.id,'PATCH',{name:'PSICOLOGÍA FORENSE',prompt:'Diseño limpio',settings:{count:1,textCount:1,imageTextCount:0,imageCount:0},instructionPolicy:{includeProject:false}});assert.equal((await previewSubproduct(s.id)).storageReferences.length,0);
        await owner.call('subproducts/'+s.id,'PATCH',{name:'PSICOLOGÍA FORENSE',prompt:'Título: DIPLOMADO EN PSICOLOGÍA FORENSE\nOferta: MENSUALIDADES GRATIS',settings:{count:1,textCount:0,imageTextCount:1,imageCount:0},instructionPolicy:{includeProject:true}});
        // More resources never become an unbounded provider input.
        await db.libraryDocument.createMany({data:Array.from({length:15},(_,index)=>({userId:actor.id,folderId:child.id,destinationKey:'folder:'+child.id,name:`Otro recurso ${index}.png`,mime:photo.body.mime,size:photo.body.size,path:photo.body.path,purpose:'Referencia visual'}))});const bounded=await boundStorageReferences([{scope:'project',resourceId:p.id}],'Psicología forense');assert.equal(bounded.length,8);assert(bounded.some(a=>a.id===photo.body.id));
        const r=await owner.call(`subproducts/${s.id}/generate`,'POST',{engine:'ai',requestId:randomUUID(),confirmCharge:true,quickGeneration:true});assert.equal(r.status,202);await runOne({id:r.body.jobs[0]});const job=await db.generationJob.findUniqueOrThrow({where:{id:r.body.jobs[0]},include:{variation:true}});assert.equal(job.status,'COMPLETED',job.error??'');
        const version=await db.imageVersion.findFirstOrThrow({where:{variationId:job.variation!.id}}),layer=(version.document as any).layers.find((l:any)=>l.type==='logo');assert(layer);const clone=await db.attachment.findUniqueOrThrow({where:{id:layer.attachmentId}});assert.notEqual(clone.path,logo.body.path);assert.equal(clone.scope,'variation');assert.equal(clone.resourceId,job.variation!.id);
        assert.equal((await owner.call('library/documents/'+logo.body.id,'DELETE')).status,200);assert((await load(clone.path)).length>0);assert.equal((await owner.call('variations/'+job.variation!.id+'/design')).status,200);
      }finally{provider.generate=originalGenerate;await setEngines({aiEnabled:true,propioxEnabled:false,defaultEngine:'ai'});}
    }));
    await t.test('IA pura usa referencias vinculadas y publica logos independientes sin composición incompleta',async()=>withOrderProvider(async()=>{
      const {adapter}=await import('../lib/providers'),provider=adapter('openai'),generate=provider.generate,direct=provider.direct;let calls=0,directions=0;const sharp=(await import('sharp')).default,bytes=await sharp({create:{width:1024,height:1024,channels:3,background:'#63869e'}}).png().toBuffer();provider.generate=async(_key,args)=>{calls++;assert.equal(args.images?.length,1);return {bytes,usage:{output_tokens:20}};};provider.direct=async()=>{directions++;throw Error('No debe solicitar dirección con copy literal');};
      try{
        await setEngines({aiEnabled:true,propioxEnabled:false,defaultEngine:'ai'});const {s}=await hierarchyForReview();const folder=(await owner.call('library/folder-actions','POST',{action:'create',name:'Fotografía y logo IA'})).body;await uploadStored(folder.id,'Psicología Forense.png','Fotografía principal');await uploadStored(folder.id,'WOSA.png','Logo');await owner.call(`storage-bindings/subproduct/${s.id}`,'PUT',{folderIds:[folder.id]});await owner.call('subproducts/'+s.id,'PATCH',{name:'PSICOLOGÍA FORENSE',prompt:'Título: DIPLOMADO EN PSICOLOGÍA FORENSE\nOferta: MENSUALIDADES GRATIS',settings:{count:1,textCount:0,imageTextCount:1,imageCount:0}});
        const r=await owner.call(`subproducts/${s.id}/generate`,'POST',{engine:'ai',requestId:randomUUID(),confirmCharge:true,quickGeneration:true});assert.equal(r.status,202);await runOne({id:r.body.jobs[0]});const job=await db.generationJob.findUniqueOrThrow({where:{id:r.body.jobs[0]},include:{variation:true}});assert.equal(job.status,'COMPLETED',job.error??'');const version=await db.imageVersion.findFirstOrThrow({where:{variationId:job.variation!.id}}),layer=(version.document as any).layers.find((l:any)=>l.type==='logo');assert(layer);const clone=await db.attachment.findUniqueOrThrow({where:{id:layer.attachmentId}});assert.equal(clone.scope,'variation');assert.equal(clone.resourceId,job.variation!.id);assert.equal(calls,1);assert.equal(directions,0);
      }finally{provider.generate=generate;provider.direct=direct;await setEngines({aiEnabled:true,propioxEnabled:false,defaultEngine:'ai'});}
    }));
    async function completeLarge(id:string,preview?:Buffer){const form=new FormData();if(preview)form.set('preview',new File([new Uint8Array(preview)],'preview.png',{type:'image/png'}));const r=await fetch(root+`/api/storage/uploads/${id}/complete`,{method:'POST',headers:{Cookie:owner.cookie,Origin:root},body:form});return {status:r.status,body:await r.json()};}
    async function putLarge(id:string,index:number,bytes:Buffer,client=owner){const r=await fetch(root+`/api/storage/uploads/${id}/chunks/${index}`,{method:'PUT',headers:{Cookie:client.cookie,Origin:root,'Content-Type':'application/octet-stream'},body:new Uint8Array(bytes)});return {status:r.status,body:await r.json()};}
    await t.test('Subida fragmentada: límites, propiedad, idempotencia, integridad, descarga por rangos y limpieza',async()=>{
      const {uploadChunkBytes,maxResourceFileBytes}=await import('../lib/large-upload-limits');const make=(size:number,name='archivo.pdf',client=owner)=>client.call('storage/uploads','POST',{clientKey:randomUUID(),name,size,folderId:null,purpose:'Material de contexto'});
      assert.equal((await make(maxResourceFileBytes+1)).status,400);assert.equal((await make(0)).status,400);assert.equal((await make(10,'peligro.html')).status,400);assert.equal((await make(10,'archivo.pdf',observer)).status,403);
      const requestId=randomUUID(),data={clientKey:requestId,name:'carpeta/archivo.pdf',size:uploadChunkBytes+9,folderId:null,purpose:'Material de contexto'};const created=await owner.call('storage/uploads','POST',data);assert.equal(created.status,201,JSON.stringify(created.body));const id=created.body.id;assert.equal((await owner.call('storage/uploads','POST',data)).body.id,id);assert.equal((await user.call('storage/uploads/'+id)).status,404);assert.equal((await user.call('storage/uploads/'+id,'DELETE')).status,404);assert.equal((await putLarge(id,0,Buffer.alloc(uploadChunkBytes),user)).status,404);assert.equal((await completeLarge(id)).status,409);
      assert.equal((await putLarge(id,0,Buffer.alloc(2))).status,400);assert.equal((await putLarge(id,0,Buffer.alloc(uploadChunkBytes))).status,400);assert.equal((await putLarge(id,2,Buffer.alloc(9))).status,400);
      const chunk=Buffer.alloc(uploadChunkBytes,32);chunk.write('%PDF-1.7\n');assert.equal((await putLarge(id,0,chunk)).status,200);assert.equal((await putLarge(id,0,chunk)).status,200);const changed=Buffer.from(chunk);changed[20]=33;assert.equal((await putLarge(id,0,changed)).status,409);assert.equal((await owner.call('storage/uploads/'+id)).body.receivedBytes,uploadChunkBytes);
      assert.equal((await putLarge(id,1,Buffer.from('final-PDF'))).status,200);const complete=await completeLarge(id);assert.equal(complete.status,201);assert.equal(complete.body.name,'archivo.pdf');assert.equal(complete.body.generationReady,false);assert.equal((await completeLarge(id)).body.id,complete.body.id);
      const download=await fetch(root+'/api/library/documents/'+complete.body.id,{headers:{Cookie:owner.cookie,Range:`bytes=${uploadChunkBytes-2}-${uploadChunkBytes+8}`}});assert.equal(download.status,206);assert.equal(download.headers.get('content-range'),`bytes ${uploadChunkBytes-2}-${uploadChunkBytes+8}/${uploadChunkBytes+9}`);assert.equal(Buffer.from(await download.arrayBuffer()).toString(),'  final-PDF');assert.equal((await fetch(root+'/api/library/documents/'+complete.body.id,{headers:{Cookie:user.cookie}})).status,404);assert.equal((await fetch(root+'/api/library/documents/'+complete.body.id,{headers:{Cookie:owner.cookie,Range:'bytes=9999999999-'}})).status,416);
      assert.equal((await owner.call('library/documents/'+complete.body.id,'DELETE')).status,200);await (await import('../lib/storage')).remove('large:'+id);assert.equal(await db.largeAssetChunk.count({where:{assetId:id}}),0);
      const expired=await make(uploadChunkBytes);await db.largeAsset.update({where:{id:expired.body.id},data:{expiresAt:new Date(0)}});await (await import('../lib/large-uploads')).cleanupIncompleteUploads();assert.equal(await db.largeAsset.count({where:{id:expired.body.id}}),0);
    });
    await t.test('Original grande: copia optimizada privada para IA y preservación al copiar/eliminar',async()=>{
      const sharp=(await import('sharp')).default,png=await sharp({create:{width:40,height:40,channels:3,background:'#123456'}}).png().toBuffer(),{uploadChunkBytes}=await import('../lib/large-upload-limits');const {p,s}=await hierarchyForReview(),folder=(await owner.call('library/folder-actions','POST',{action:'create',name:'Originales grandes'})).body;
      const created=await owner.call('storage/uploads','POST',{clientKey:randomUUID(),name:'original.png',size:uploadChunkBytes*2,folderId:folder.id,purpose:'Fotografía principal'});assert.equal(created.status,201);const first=Buffer.alloc(uploadChunkBytes);png.copy(first);await putLarge(created.body.id,0,first);await putLarge(created.body.id,1,Buffer.alloc(uploadChunkBytes));const saved=await completeLarge(created.body.id,png);assert.equal(saved.status,201);assert.equal(saved.body.generationReady,true);assert(saved.body.previewPath);
      const image=await fetch(root+'/api/library/documents/'+saved.body.id+'?preview=1',{headers:{Cookie:owner.cookie}});assert.equal(image.status,200);assert.equal((await sharp(Buffer.from(await image.arrayBuffer())).metadata()).format,'webp');
      await owner.call(`storage-bindings/subproduct/${s.id}`,'PUT',{folderIds:[folder.id]});const {previewSubproduct}=await import('../lib/generation'),{resolveStoredReferences}=await import('../lib/resource-storage');const selected=(await previewSubproduct(s.id)).storageReferences;assert.equal(selected.length,1);const refs=await resolveStoredReferences(selected.map(d=>({documentId:d.id,bindingId:d.bindingId,scope:d.scope,resourceId:d.resourceId})),[{scope:'subproduct',resourceId:s.id}]);assert.equal(refs[0].path,saved.body.previewPath);assert.equal(refs[0].mime,'image/webp');
      const copy=await owner.call('library/selection-actions','POST',{operation:'copy',selection:['d:'+saved.body.id],destination:'folder:'+folder.id});assert.equal(copy.status,200);const actor=await db.user.findFirstOrThrow({where:{role:'OWNER'}}),copies=await db.libraryDocument.findMany({where:{userId:actor.id,path:saved.body.path,deletedAt:null}});assert.equal(copies.length,2);assert(copies.every(d=>d.previewPath===saved.body.previewPath&&d.generationReady));
      await owner.call('library/documents/'+saved.body.id,'DELETE');await (await import('../lib/storage')).remove(saved.body.path);assert(await db.largeAsset.count({where:{id:created.body.id}}));const survivor=copies.find(d=>d.id!==saved.body.id)!;await owner.call('library/documents/'+survivor.id,'DELETE');await (await import('../lib/storage')).remove(saved.body.path);assert.equal(await db.largeAsset.count({where:{id:created.body.id}}),0);assert.equal(await db.storedAsset.count({where:{id:saved.body.previewPath.slice(3)}}),0);
    });
    await t.test('Adjuntos del sistema: tres niveles, carpetas mixtas, imagen/versiones, herencia, permisos y revocación',async()=>withOrderProvider(async()=>{
      const {p,c,s}=await hierarchyForReview(),actor=await db.user.findFirstOrThrow({where:{role:'OWNER'}}),{previewSubproduct,generateBatch}=await import('../lib/generation'),{boundSystemReferences,resolveSystemReferences}=await import('../lib/system-resources');
      const source=await db.variation.findFirstOrThrow({where:{deletedAt:null,expired:false,expiresAt:{gt:new Date()}}});
      const job=await db.generationJob.create({data:{actorId:actor.id,projectId:p.id,subproductId:s.id,idempotencyKey:randomUUID(),status:'COMPLETED',snapshot:{prompt:'Secreto origen'},reservedMicros:0n}});
      const image=await db.variation.create({data:{jobId:job.id,subproductId:s.id,path:source.path,model:'synthetic-resource',reviewStatus:'APPROVED',expiresAt:new Date(Date.now()+86400000)}}),version=await db.imageVersion.create({data:{variationId:image.id,path:source.path,actorId:actor.id,number:1}});
      const target=await hierarchyForReview(),folder=(await owner.call('library/folder-actions','POST',{action:'create',name:'Referencias personales'})).body;
      const doc=await db.libraryDocument.create({data:{userId:actor.id,folderId:folder.id,name:'Referencia elegida.png',mime:'image/png',path:source.path,size:100,purpose:'Fotografía principal'}});
      const entry=(selection:string,purpose='Referencia visual')=>({selection,purpose});
      for(const [scope,id] of [['project',target.p.id],['category',target.c.id],['subproduct',target.s.id]]){
        const result=await owner.call(`system-resources/${scope}/${id}`,'PUT',{selections:[entry('v:'+image.id)]});assert.equal(result.status,200,JSON.stringify(result.body));const list=await owner.call(`system-resources/${scope}/${id}`);assert.equal(list.body[0].name,s.name);assert(!JSON.stringify(list.body).includes('Secreto origen'));assert(!JSON.stringify(list.body).includes(source.path));
      }
      const beforeIds=await db.libraryResourceBinding.findMany({where:{resourceId:target.s.id},select:{id:true}});await owner.call(`system-resources/subproduct/${target.s.id}`,'PUT',{selections:[entry('v:'+image.id)]});assert.deepEqual(await db.libraryResourceBinding.findMany({where:{resourceId:target.s.id},select:{id:true}}),beforeIds);
      let refs=(await previewSubproduct(target.s.id)).systemReferences;assert.equal(refs.length,1);assert.equal(refs[0].versionId,version.id);
      await owner.call(`projects/${target.p.id}`,'PATCH',{name:target.p.name,prompt:target.p.prompt,instructionPolicy:{includeSelf:false}});await owner.call(`categories/${target.c.id}`,'PATCH',{name:target.c.name,prompt:target.c.prompt,settings:{},instructionPolicy:{includeSelf:false}});
      refs=(await previewSubproduct(target.s.id)).systemReferences;assert(refs.every(r=>r.scope==='subproduct'));
      const selected=[entry('n:project:'+p.id),entry('n:folder:'+folder.id),entry('d:'+doc.id,'Logo')];assert.equal((await owner.call(`system-resources/subproduct/${target.s.id}`,'PUT',{selections:selected})).status,200);
      refs=(await previewSubproduct(target.s.id)).systemReferences;assert(refs.some(r=>r.variationId===image.id));assert(refs.some(r=>r.documentId===doc.id));
      assert.equal((await user.call(`system-resources/subproduct/${target.s.id}`,'PUT',{selections:[entry('v:'+image.id)]})).status,404);assert.equal((await observer.call(`system-resources/subproduct/${target.s.id}`,'PUT',{selections:[]})).status,403);
      const prev=await db.libraryResourceBinding.count({where:{resourceId:target.s.id}});assert.equal((await owner.call(`system-resources/subproduct/${target.s.id}`,'PUT',{selections:[entry('v:no-existe')]})).status,409);assert.equal(await db.libraryResourceBinding.count({where:{resourceId:target.s.id}}),prev);
      const userTarget=(await user.call('projects','POST',{name:'Destino del usuario'})).body;assert(userTarget.id);
      assert.equal((await user.call(`system-resources/project/${userTarget.id}`,'PUT',{selections:[entry('v:'+image.id)]})).status,409);
      await db.projectMember.create({data:{projectId:p.id,userId:uid}});assert.equal((await user.call(`system-resources/project/${userTarget.id}`,'PUT',{selections:[entry('v:'+image.id)]})).status,200);
      const delegated=await boundSystemReferences([{scope:'project',resourceId:userTarget.id}],'Tema'),snapshot=delegated.map(r=>({bindingId:r.bindingId,scope:r.scope,resourceId:r.resourceId,variationId:r.variationId,versionId:r.versionId}));assert.equal(snapshot.length,1);assert.equal((await resolveSystemReferences(snapshot,[{scope:'project',resourceId:userTarget.id}]))[0].path,version.path);
      await db.projectMember.delete({where:{projectId_userId:{projectId:p.id,userId:uid}}});await assert.rejects(resolveSystemReferences(snapshot,[{scope:'project',resourceId:userTarget.id}]),/no está disponible/);
      // AI generation uses the chosen version with an explicit synthetic provider.
      await owner.call(`system-resources/subproduct/${target.s.id}`,'PUT',{selections:[entry('v:'+image.id)]});await owner.call(`subproducts/${target.s.id}`,'PATCH',{name:'DISEÑO CON RECURSO',prompt:'Título: DISEÑO CON RECURSO',settings:{count:1,textCount:0,imageTextCount:1,imageCount:0},instructionPolicy:{includeProject:false,includeProduct:false}});
      const provider=(await import('../lib/providers')).adapter('openai'),originalGenerate=provider.generate;let imageCalls=0;provider.generate=async()=>{imageCalls++;return {bytes:await (await import('../lib/storage')).load(source.path),usage:null};};
      await setEngines({aiEnabled:true,propioxEnabled:false,defaultEngine:'ai'});try{
       const ids=await generateBatch(actor.id,target.c.id,randomUUID(),[target.s.id],false,'ai');assert.equal(ids.length,1);const reserved=await db.generationJob.findUniqueOrThrow({where:{id:ids[0].id}});assert.equal((reserved.snapshot as any).systemReferences[0].versionId,version.id);await runOne({id:ids[0].id});const done=await db.generationJob.findUniqueOrThrow({where:{id:ids[0].id}});assert.equal(done.status,'COMPLETED',done.error??'');assert.equal(imageCalls,1);
      }finally{provider.generate=originalGenerate;await setEngines({aiEnabled:true,propioxEnabled:false,defaultEngine:'ai'});}
    }));
    await t.test('Solo IA: retirar motores locales no borra credenciales ni resultados ni autoriza llamadas',async()=>withOrderProvider(async(_c,calls)=>{
      const original=await db.generationEngineConfiguration.findUnique({where:{id:'global'}}),credentials=await db.providerConfiguration.findUniqueOrThrow({where:{id:'global'}}),{s}=await hierarchyForReview();
      await db.generationEngineConfiguration.upsert({where:{id:'global'},create:{aiEnabled:false,propioxEnabled:true,defaultEngine:'propiox'},update:{aiEnabled:false,propioxEnabled:true,defaultEngine:'propiox'}});
      try{const jobs=await db.generationJob.count(),ledger=await db.usageLedger.count(),variations=await db.variation.count();
        for(const engine of ['propiox','hybrid']){const r=await owner.call(`subproducts/${s.id}/generate`,'POST',{engine,requestId:randomUUID(),confirmCharge:true,quickGeneration:true});assert.equal(r.status,409);assert.match(r.body.error,/se retiraron/);}
        const current=(await owner.call('engines/config')).body;assert.equal((await owner.call('engines/config','PUT',{...engineValues(current),defaultEngine:'propiox',propioxEnabled:true})).status,409);
        assert.equal(await db.generationJob.count(),jobs);assert.equal(await db.usageLedger.count(),ledger);assert.equal(await db.variation.count(),variations);assert.equal((await db.providerConfiguration.findUniqueOrThrow({where:{id:'global'}})).encryptedKey,credentials.encryptedKey);assert.equal(calls(),0);
        const actor=await db.user.findFirstOrThrow({where:{role:'OWNER'}});const [preserved]=await reserveJobs(actor.id,pid,[{subproductId:s.id,key:randomUUID(),snapshot:{engine:'ai',engineRevision:-1,prompt:'Texto de comprobación',mode:'Texto',format:'1:1',renderMode:'editable'}}],_c.revision);await runOne({id:preserved.id});const finished=await db.generationJob.findUniqueOrThrow({where:{id:preserved.id}});assert.equal(finished.status,'COMPLETED',finished.error??'');assert.equal(calls(),1);
      }finally{if(original){const {id,...data}=original;await db.generationEngineConfiguration.update({where:{id},data});}else await db.generationEngineConfiguration.delete({where:{id:'global'}});}
    }));
    await t.test('Adjuntos unificados: vínculos anteriores conservados y copia optimizada de Biblioteca con permisos',async()=>{
      const {p,s}=await hierarchyForReview(),actor=await db.user.findFirstOrThrow({where:{role:'OWNER'}}),folder=(await owner.call('library/folder-actions','POST',{action:'create',name:'Vínculos conservados'})).body;
      const photo=await uploadStored(folder.id,'Fotografía existente.png','Fotografía principal');assert.equal(photo.status,201);await owner.call(`storage-bindings/subproduct/${s.id}`,'PUT',{folderIds:[folder.id]});const before=await db.storageBinding.findFirstOrThrow({where:{resourceId:s.id}});
      let linked=(await owner.call(`system-resources/subproduct/${s.id}`)).body;assert.equal(linked.length,1);assert.equal(linked[0].selection,'n:folder:'+folder.id);
      assert.equal((await owner.call(`system-resources/subproduct/${s.id}`,'PUT',{selections:linked.map(({selection,purpose}:any)=>({selection,purpose}))})).status,200);assert.equal((await db.storageBinding.findFirstOrThrow({where:{resourceId:s.id}})).id,before.id);
      const foreignFolder=(await user.call('library/folder-actions','POST',{action:'create',name:'Recursos colaborador'})).body;const other=await db.storageBinding.create({data:{scope:'subproduct',resourceId:s.id,userId:uid,folderId:foreignFolder.id}});
      assert.equal((await owner.call(`system-resources/subproduct/${s.id}`,'PUT',{selections:[]})).status,200);assert.equal(await db.storageBinding.count({where:{id:before.id}}),0);assert.equal(await db.storageBinding.count({where:{id:other.id}}),1);
      const input={scope:'project',resourceId:p.id,documentId:photo.body.id,purpose:'Referencia visual'};assert.equal((await user.call('attachments/from-library','POST',input)).status,404);assert.equal((await observer.call('attachments/from-library','POST',input)).status,403);
      const copied=await owner.call('attachments/from-library','POST',input);assert.equal(copied.status,201,JSON.stringify(copied.body));assert.notEqual((await db.attachment.findUniqueOrThrow({where:{id:copied.body.id}})).path,photo.body.path);assert(await db.libraryDocument.count({where:{id:photo.body.id,deletedAt:null}}));assert.equal((await fetch(root+'/api/attachments/'+copied.body.id,{headers:{Cookie:owner.cookie}})).status,200);
      const unusable=await db.libraryDocument.create({data:{userId:actor.id,name:'Original sin copia.pdf',mime:'application/pdf',path:'large:'+randomUUID(),size:10000000,generationReady:false}});assert.equal((await owner.call('attachments/from-library','POST',{...input,documentId:unusable.id})).status,409);
    });
    await t.test('Adjuntar desde: nombres, enlaces privados, uso por carpeta y retirada persistente', async () => {
      const {p,s}=await hierarchyForReview(), folder=(await owner.call('library/folder-actions','POST',{action:'create',name:'Carpeta de capturas'})).body;
      const image=await uploadStored(folder.id,'Captura privada.png','Fotografía principal');assert.equal(image.status,201);
      await owner.call(`storage-bindings/subproduct/${s.id}`,'PUT',{folderIds:[folder.id]});
      const selection='n:folder:'+folder.id;
      const result=await owner.call(`system-resources/subproduct/${s.id}`,'PUT',{selections:[{selection,purpose:'Logo institucional'},{selection:'d:'+image.body.id,purpose:'Material de contexto'}]});
      assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(await db.storageBinding.count({where:{resourceId:s.id}}),0);
      const rows=(await owner.call(`system-resources/subproduct/${s.id}`)).body;
      assert.equal(rows[0].name,'Carpeta de capturas');assert(rows[0].labelPath.includes('Carpeta de capturas'));assert(rows[0].href.includes('view=library'));
      assert.equal(rows[1].name,'Captura privada.png');assert.equal(rows[1].href,`/api/library/documents/${image.body.id}?preview=1`);assert(!JSON.stringify(rows).includes(image.body.path));
      const {boundSystemReferences}=await import('../lib/system-resources');const refs=await boundSystemReferences([{scope:'subproduct',resourceId:s.id}],'Captura');assert(refs.length);
      await owner.call(`system-resources/subproduct/${s.id}`,'PUT',{selections:[{selection,purpose:'Logo institucional'}]});
      assert((await boundSystemReferences([{scope:'subproduct',resourceId:s.id}],'Captura')).every(r=>r.purpose==='Logo institucional'));
      await owner.call(`system-resources/subproduct/${s.id}`,'PUT',{selections:[]});assert.equal((await owner.call(`system-resources/subproduct/${s.id}`)).body.length,0);assert(await db.libraryDocument.count({where:{id:image.body.id,deletedAt:null}}));assert(await db.libraryFolder.count({where:{id:folder.id}}));
    });
    await t.test('Meta Ads: conexiones API/MCP cifradas, roles, cuentas sin duplicados y sincronización incremental',async()=>{
      const {discover,syncStep}=await import('../lib/meta-ads/service');const {localDay,shiftDay}=await import('../lib/meta-ads/analytics');const ownerActor=await db.user.findFirstOrThrow({where:{role:'OWNER'}});const key='meta-synthetic-test-token-123456789';
      assert.equal((await user.call('meta-ads/connections','POST',{name:'No permitido',transport:'API',token:key})).status,403);assert.equal((await observer.call('meta-ads/connections')).status,403);
      const connection=(await owner.call('meta-ads/connections','POST',{name:'Meta prueba API',transport:'API',token:key,apiVersion:'v23.0'})).body;assert(connection.id);const saved=await db.metaConnection.findUniqueOrThrow({where:{id:connection.id}});assert(saved.encryptedToken&&!saved.encryptedToken.includes(key));assert(!JSON.stringify((await owner.call('meta-ads/connections')).body).includes(key));
      const mcp=(await owner.call('meta-ads/connections','POST',{name:'Meta prueba MCP',transport:'MCP',token:'mcp-synthetic-test-token-123456789'})).body;
      const original=globalThis.fetch,accountId=String(Date.now()),secondId=accountId+'9',campaignId=accountId+'1',adsetId=accountId+'2',adId=accountId+'3';const today=localDay('America/Lima'),earlier=shiftDay(today,-3);let metricSpend=3,concurrent=0;const calls:string[]=[];
      globalThis.fetch=async(input,init)=>{const u=new URL(String(input));if(u.hostname==='localhost'||u.hostname==='127.0.0.1')return original(input,init);assert(['graph.facebook.com','mcp.facebook.com'].includes(u.hostname));calls.push(u.href);if(u.hostname==='mcp.facebook.com'){const body=JSON.parse(String(init?.body));const result=body.method==='initialize'?{protocolVersion:'2025-03-26'}:body.method==='tools/list'?{tools:[{name:'get_ad_accounts',inputSchema:{properties:{}}}]}:body.method==='tools/call'?{structuredContent:{data:[{id:accountId,name:'Cuenta PEN',currency:'PEN',timezone_name:'America/Lima',business:{id:'991',name:'Empresa prueba'}}]}}:{};return body.method==='notifications/initialized'?new Response(null,{status:202}):Response.json({id:body.id,jsonrpc:'2.0',result});}
      assert.equal(init?.method??'GET','GET');assert(!u.searchParams.has('access_token'));if(u.pathname.endsWith('/me/adaccounts'))return Response.json({data:[{id:accountId,name:'Cuenta PEN',currency:'PEN',timezone_name:'America/Lima',business:{id:'991',name:'Empresa prueba'}},{id:secondId,name:'Cuenta USD',currency:'USD',timezone_name:'America/Bogota'}]});
      if([campaignId,adsetId,adId].includes(u.pathname.split('/').at(-1)!)){const rows=[{id:campaignId,account_id:accountId,name:'Campaña mensajes',objective:'OUTCOME_ENGAGEMENT',status:'ACTIVE',effective_status:'ACTIVE',created_time:earlier+'T10:00:00-05:00'},{id:adsetId,account_id:accountId,campaign_id:campaignId,name:'Conjunto WhatsApp',optimization_goal:'CONVERSATIONS',status:'ACTIVE',effective_status:'ACTIVE'},{id:adId,account_id:accountId,campaign_id:campaignId,adset_id:adsetId,name:'Anuncio forense',status:'ACTIVE',effective_status:'ACTIVE',created_time:earlier+'T10:00:00-05:00'}];return Response.json(rows.find(row=>row.id===u.pathname.split('/').at(-1)));}
      if(u.pathname.endsWith('/campaigns'))return Response.json({data:[{id:campaignId,name:'Campaña mensajes',objective:'OUTCOME_ENGAGEMENT',status:'ACTIVE',effective_status:'ACTIVE',created_time:earlier+'T10:00:00-05:00'}]});if(u.pathname.endsWith('/adsets'))return Response.json({data:[{id:adsetId,campaign_id:campaignId,name:'Conjunto WhatsApp',optimization_goal:'CONVERSATIONS',status:'ACTIVE',effective_status:'ACTIVE'}]});if(u.pathname.endsWith('/ads'))return Response.json({data:[{id:adId,campaign_id:campaignId,adset_id:adsetId,name:'Anuncio forense',status:'ACTIVE',effective_status:'ACTIVE',created_time:earlier+'T10:00:00-05:00'}]});assert(u.pathname.endsWith('/insights'));assert.equal(u.searchParams.get('time_increment'),'1');assert.equal(u.searchParams.get('action_report_time'),'impression');const level=u.searchParams.get('level')!;return Response.json({data:[{account_id:accountId,campaign_id:campaignId,adset_id:adsetId,ad_id:adId,[level+'_name']:'Nombre importado',date_start:earlier,date_stop:earlier,spend:'20',impressions:'100',clicks:'5',actions:[{action_type:'onsite_conversion.messaging_conversation_started_7d',value:'20'}]},{account_id:accountId,campaign_id:campaignId,adset_id:adsetId,ad_id:adId,date_start:today,date_stop:today,spend:String(metricSpend),impressions:'50',clicks:'5',actions:[{action_type:'onsite_conversion.messaging_conversation_started_7d',value:'10'}]}]});};
      try{
        assert.equal((await discover(ownerActor,connection.id)).accounts,2);assert.equal((await discover(ownerActor,mcp.id)).accounts,1);assert.equal(await db.metaAdAccount.count(),2);assert.equal(await db.metaAccountSource.count({where:{accountId}}),2);assert.equal((await db.metaAdAccount.findUniqueOrThrow({where:{id:accountId}})).connectionId,connection.id);
        await db.metaAdAccount.update({where:{id:accountId},data:{enabled:true,metric:'MESSAGES',targetCost:2,minResults:10,nextSyncAt:new Date()}});for(let i=0;i<6;i++)assert(await syncStep(accountId));assert.equal(await db.metaAdDaily.count({where:{accountId}}),6);const a=await db.metaAdAccount.findUniqueOrThrow({where:{id:accountId}});assert(a.syncedAt);assert.equal(a.historyFrom,earlier);assert.equal((a.syncState as any).phase,undefined);
        metricSpend=6;await db.metaAdAccount.update({where:{id:accountId},data:{nextSyncAt:new Date()}});for(let i=0;i<6;i++)assert(await syncStep(accountId));assert.equal(await db.metaAdDaily.count({where:{accountId}}),6);assert.equal(Number((await db.metaAdDaily.findFirstOrThrow({where:{objectId:adId,day:today}})).spend),6);
        const p=await owner.call(`meta-ads/dashboard?level=ad&accounts=${accountId}`);assert.equal(p.status,200,JSON.stringify(p.body));assert.equal(p.body.items.length,1);const card=p.body.items[0];assert.equal(card.periods['7'].cost,26/30);assert.equal(card.periods.today.cost,0.6);assert.equal(card.campaignName,'Campaña mensajes');assert.equal(card.adsetName,'Conjunto WhatsApp');assert.equal(card.ageDays,4);assert.equal(card.metricName,'Conversaciones con mensajes iniciadas');assert.equal(card.historyPartial,true);assert(!JSON.stringify(p.body).includes('encryptedToken'));
        // Hot filters reuse facts, but custom dates and new synchronization remain exact.
        const cached=await db.metaInsightCache.findUniqueOrThrow({where:{objectId:adId}});
        assert.equal((await owner.call(`meta-ads/dashboard?level=ad&accounts=${accountId}&q=forense&sort=cost`)).body.items[0].periods.today.cost,0.6);
        assert.equal((await db.metaInsightCache.findUniqueOrThrow({where:{objectId:adId}})).updatedAt.toISOString(),cached.updatedAt.toISOString());
        const custom=(await owner.call(`meta-ads/dashboard?accounts=${accountId}&since=${earlier}&until=${earlier}`)).body.items[0];assert.equal(custom.periods.custom.cost,1);assert.equal(custom.periods.today.cost,0.6);
        metricSpend=9;await db.metaAdAccount.update({where:{id:accountId},data:{nextSyncAt:new Date()}});for(let i=0;i<6;i++)assert(await syncStep(accountId));
        assert.equal((await owner.call(`meta-ads/dashboard?accounts=${accountId}`)).body.items[0].periods.today.cost,0.9);
        assert.notEqual((await db.metaInsightCache.findUniqueOrThrow({where:{objectId:adId}})).version,cached.version);
        const {insightSummaries}=await import('../lib/meta-ads/insight-cache');
        const tomorrow=shiftDay(today,1);await insightSummaries([{id:adId,accountId}],[{id:accountId,today:tomorrow,version:'synthetic-next-day'}]);assert.equal((await db.metaInsightCache.findUniqueOrThrow({where:{objectId:adId}})).day,tomorrow);
        assert.equal((await owner.call(`meta-ads/dashboard?accounts=${accountId}`)).body.items[0].periods.today.cost,0.9);
        assert.equal((await user.call(`meta-ads/dashboard?accounts=${accountId}`)).status,404);assert.equal((await observer.call('meta-ads/accounts')).body.length,0);
        assert.equal((await owner.call(`meta-ads/accounts/${accountId}/grants`,'PUT',{grants:[{userId:uid,canSync:false},{userId:oid,canSync:false}]})).status,200);assert.equal((await user.call('meta-ads/accounts')).body.length,1);assert.equal((await observer.call(`meta-ads/dashboard?accounts=${accountId}`)).body.items.length,1);assert.equal((await user.call(`meta-ads/accounts/${accountId}/sync`,'POST',{})).status,403);assert.equal((await observer.call(`meta-ads/accounts/${accountId}`,'PATCH',{enabled:false})).status,403);assert.equal((await observer.call(`meta-ads/accounts/${accountId}/grants`)).status,403);
        assert.equal((await user.call(`meta-ads/objects/${adId}/daily`)).body.length,2);assert.equal((await owner.call(`meta-ads/accounts/${accountId}/grants`,'PUT',{grants:[]})).status,200);assert.equal((await user.call(`meta-ads/objects/${adId}/daily`)).status,404);assert.equal((await user.call(`meta-ads/dashboard?accounts=${accountId}`)).status,404,'Cached insights never bypass revoked grants');
        // Removing a connection never deletes the synchronized advertising history.
        assert.equal((await owner.call('meta-ads/connections/'+mcp.id,'DELETE')).status,200);assert.equal(await db.metaAdDaily.count({where:{accountId}}),6);
      }finally{globalThis.fetch=original;await db.metaAdAccount.updateMany({where:{id:{in:[accountId,secondId]}},data:{enabled:false,nextSyncAt:null,schedulerToken:null}});}
    });
    await t.test('Meta: importación rápida por actividad evita catálogo completo, retoma lote y conserva histórico',async()=>{
      const {syncStep,queueSync}=await import('../lib/meta-ads/service'),{localDay,shiftDay}=await import('../lib/meta-ads/analytics');const actor=await db.user.findFirstOrThrow({where:{role:'OWNER'}}),today=localDay('America/Lima'),id='88001',campaign='8800101',adset='8800102',ads=Array.from({length:51},(_,i)=>'88002'+String(i).padStart(3,'0'));
      const c=await db.metaConnection.create({data:{ownerId:actor.id,name:'Rápida sintética',transport:'API',apiVersion:'v26.0',encryptedToken:(await import('../lib/crypto')).encryptKey('synthetic-recent-token','meta:recent-test'),verifiedAt:new Date(),id:'recent-test'}});
      await db.metaAdAccount.create({data:{id,connectionId:c.id,name:'Últimos 30 días',currency:'PEN',timezone:'America/Lima',enabled:true,metric:'MESSAGES',nextSyncAt:new Date()}});
      await db.metaAdObject.create({data:{id:'8800199',accountId:id,level:'ad',name:'Histórico conservado',status:'PAUSED',effectiveStatus:'PAUSED'}});await db.metaAdDaily.create({data:{accountId:id,objectId:'8800199',day:shiftDay(today,-200),scope:'7d_click,1d_view|impression',spend:50,impressions:50,clicks:0,actions:{}}});
      const original=globalThis.fetch;const calls:URL[]=[];let failLast=true;
      globalThis.fetch=async(input,init)=>{const u=new URL(String(input));if(u.hostname!=='graph.facebook.com')return original(input,init);calls.push(u);assert.equal(init?.method??'GET','GET');assert(!u.searchParams.has('date_preset'));assert(!u.searchParams.has('access_token'));
        if(u.pathname.endsWith('/insights')){assert.deepEqual(JSON.parse(u.searchParams.get('time_range')!),{since:shiftDay(today,-29),until:today});const level=u.searchParams.get('level')!,ids=level==='campaign'?[campaign]:level==='adset'?[adset]:ads;return Response.json({data:ids.map(oid=>({account_id:id,campaign_id:campaign,campaign_name:'Campaña reciente',adset_id:adset,adset_name:'Conjunto reciente',ad_id:oid,ad_name:'Anuncio reciente',date_start:today,date_stop:today,spend:'2',impressions:'20',clicks:'1',actions:[{action_type:'onsite_conversion.messaging_conversation_started_7d',value:'2'}],[level+'_id']:oid}))});}
        assert(!u.searchParams.has('ids'));const oid=u.pathname.split('/').at(-1)!;assert([campaign,adset,...ads].includes(oid));if(oid===ads[50]&&failLast)return Response.json({error:{code:4,message:'Synthetic quota'}},{status:429});return Response.json({id:oid,account_id:id,name:'Detalle '+oid,campaign_id:campaign,...(oid!==campaign?{adset_id:adset}:{}),status:'ACTIVE',effective_status:'ACTIVE',created_time:'2020-01-01T00:00:00Z'});
      };
      try{
        for(let i=0;i<6;i++)assert(await syncStep(id));assert.equal(await syncStep(id),false);let a=await db.metaAdAccount.findUniqueOrThrow({where:{id}});assert.equal(a.syncedAt,null);assert.equal((a.syncState as any).phase,5);assert.equal((a.syncState as any).after,ads[49]);assert.equal((a.syncState as any).plan,'activity');assert(a.syncError?.includes('código 4'));assert.equal(calls.length,56);
        failLast=false;await db.metaApiQuota.updateMany({data:{blockedUntil:new Date(0),nextReadAt:new Date(0)}});assert.equal((await queueSync(actor,id)).resumed,true);assert(await syncStep(id));a=await db.metaAdAccount.findUniqueOrThrow({where:{id}});assert(a.syncedAt);assert.equal((a.syncState as any).lastRun.recentDays,30);assert.equal((a.syncState as any).lastRun.pages,7);assert.equal(await db.metaAdDaily.count({where:{objectId:'8800199'}}),1);assert.equal((await db.metaAdObject.findUniqueOrThrow({where:{id:'8800199'}})).effectiveStatus,'PAUSED');
        const panel=await owner.call('meta-ads/dashboard?accounts='+id+'&level=ad');assert.equal(panel.status,200,JSON.stringify(panel.body));assert.equal(panel.body.total,51);assert(!panel.body.items.some((o:any)=>o.id==='8800199'));assert.equal(panel.body.items[0].periods['30'].cost,1);assert.equal(panel.body.items[0].historyPartial,true);
        const status=await owner.call('meta-ads/sync-status?accounts='+id);assert(status.body[0].progress.scope.includes('solo objetos con actividad'));assert(!JSON.stringify(status.body).includes(ads[49]));
        const before=await db.metaAdDaily.count({where:{accountId:id}});await assert.rejects(()=>queueSync(actor,id,false,10),/30, 90 o 180/);await queueSync(actor,id,false,90);a=await db.metaAdAccount.findUniqueOrThrow({where:{id}});assert.equal((a.syncState as any).since,shiftDay(today,-89));assert.equal((a.syncState as any).after,undefined);assert.equal(await db.metaAdDaily.count({where:{accountId:id}}),before);assert(a.syncedAt);
        await queueSync(actor,id,true);a=await db.metaAdAccount.findUniqueOrThrow({where:{id}});assert.deepEqual(a.syncState,{mode:'history'});assert.equal(await db.metaAdDaily.count({where:{accountId:id}}),before);
      }finally{globalThis.fetch=original;await db.metaAdAccount.update({where:{id},data:{enabled:false,nextSyncAt:null,schedulerToken:null}});}
    });
    await t.test('Meta cuota HTTP400/17: espera compartida, continuación sin consultas y cursor preservado',async()=>{
      const {syncStep,queueSync,controlSync,reader}=await import('../lib/meta-ads/service'),{syncProgress}=await import('../lib/meta-ads/sync-progress'),{metaQuotaScope,quotaHooks}=await import('../lib/meta-ads/quota'),{MetaGraphError}=await import('../lib/meta-ads/graph-error'),{encryptKey}=await import('../lib/crypto');
      const actor=await db.user.findFirstOrThrow({where:{role:'OWNER'}}),id='91501',cid='quota-synthetic-connection',state={plan:'focus',recentDays:7,phase:4,pages:4,processed:155,after:'synthetic-saved-cursor',started:new Date().toISOString(),until:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima'}).format(new Date())};
      const c=await db.metaConnection.create({data:{id:cid,ownerId:actor.id,name:'Cuota sintética',transport:'API',apiVersion:'v26.0',appId:'91500',metaUserId:'91599',encryptedToken:encryptKey('synthetic-quota-token-A','meta:'+cid),verifiedAt:new Date()}});
      await db.metaAdAccount.create({data:{id,connectionId:cid,name:'Cuota de usuario',currency:'PEN',timezone:'America/Lima',enabled:true,nextSyncAt:new Date(),syncState:state}});
      const cid2=cid+'-second';await db.metaConnection.create({data:{id:cid2,ownerId:actor.id,name:'Mismo usuario, otro token',transport:'API',appId:c.appId,metaUserId:c.metaUserId,apiVersion:'v26.0',encryptedToken:encryptKey('synthetic-quota-token-B','meta:'+cid2),verifiedAt:new Date()}});
      await db.metaAdAccount.create({data:{id:'91502',connectionId:cid2,name:'Segunda cuenta',currency:'PEN',timezone:'America/Lima',enabled:true,nextSyncAt:new Date(),syncState:state}});
      const scope=metaQuotaScope(c,'synthetic-quota-token-A');const original=globalThis.fetch;let calls=0,limited=true;
      globalThis.fetch=async(input,init)=>{const u=new URL(String(input));if(u.hostname!=='graph.facebook.com')return original(input,init);calls++;assert.equal(init?.method??'GET','GET');assert.equal(u.searchParams.get('after'),state.after);return limited?Response.json({error:{code:17,error_subcode:2446079,message:'User request limit reached'}},{status:400,headers:{'Retry-After':'3600'}}):Response.json({data:[]});};
      try{
        assert.equal(await syncStep(id),false);let a=await db.metaAdAccount.findUniqueOrThrow({where:{id}});assert.equal(calls,1);assert.equal((a.syncState as any).after,state.after);assert.equal((a.syncState as any).phase,4);assert.equal(syncProgress(a).status,'waiting');assert(a.nextSyncAt!.valueOf()>Date.now()+3500000);
        assert((await queueSync(actor,id,false,7,true)).waiting);assert.equal(await syncStep(id),false);assert.equal(calls,1);
        assert.equal(await syncStep('91502'),false);assert.equal(calls,1);assert.equal(syncProgress(await db.metaAdAccount.findUniqueOrThrow({where:{id:'91502'}})).status,'waiting');
        // Verification and a new reader cannot bypass the shared user cooldown.
        const r=(await reader(cid2,true)).reader;await assert.rejects(()=>r.get('adsets',{accountId:'91502'}),/limitó/);assert.equal(calls,1);
        await controlSync(actor,id,'pause');assert((await queueSync(actor,id,false,7,true)).waiting);await controlSync(actor,'91502','cancel');assert((await queueSync(actor,'91502',false,7,true)).waiting);assert.equal(await syncStep('91502'),false);assert.equal(calls,1);
        const old=await db.metaApiQuota.findUniqueOrThrow({where:{scope}});assert.equal(old.failures,1);assert(!JSON.stringify(old).includes('synthetic-quota-token'));
        // Advance only this synthetic stored budget, without waiting an hour or changing production clocks.
        await db.metaApiQuota.update({where:{scope},data:{blockedUntil:new Date(0),nextReadAt:new Date(0)}});await db.metaAdAccount.update({where:{id},data:{nextSyncAt:new Date()}});limited=false;assert(await syncStep(id));a=await db.metaAdAccount.findUniqueOrThrow({where:{id}});assert.equal(calls,2);assert.equal((a.syncState as any).phase,5);assert.equal(a.syncError,null);assert.notEqual(syncProgress(a).status,'waiting');
        const error=new MetaGraphError(400,{error:{code:17,message:'Synthetic quota'}},'synthetic',{version:'v26.0',endpoint:'test',fields:'id'});await db.metaApiQuota.update({where:{scope},data:{lastLimitedAt:new Date(Date.now()-60000)}});await quotaHooks(scope,true).limited(error,0);assert(error.retryAt!.valueOf()>Date.now()+3500000);assert.equal((await db.metaApiQuota.findUniqueOrThrow({where:{scope}})).failures,2);
      }finally{globalThis.fetch=original;await controlSync(actor,id,'cancel');await controlSync(actor,'91502','cancel');await db.metaApiQuota.delete({where:{scope}});}
    });
    await t.test('Meta activos: validar cuenta antes de omitir un estado pausado',async()=>{
      const {syncStep,queueSync,controlSync}=await import('../lib/meta-ads/service'),{encryptKey}=await import('../lib/crypto'),{localDay}=await import('../lib/meta-ads/analytics');const actor=await db.user.findFirstOrThrow({where:{role:'OWNER'}}),id='91601',cid='active-filter-synthetic';
      await db.metaConnection.create({data:{id:cid,ownerId:actor.id,name:'Filtro activo',transport:'API',apiVersion:'v26.0',encryptedToken:encryptKey('synthetic-active-filter','meta:'+cid),verifiedAt:new Date()}});await db.metaAdAccount.create({data:{id,connectionId:cid,name:'Filtro activo',currency:'PEN',timezone:'America/Lima',enabled:true,nextSyncAt:new Date(),syncState:{plan:'focus',phase:4,recentDays:7,started:new Date().toISOString(),until:localDay('America/Lima'),pages:4,after:'saved-active-cursor'}}});
      const original=globalThis.fetch;let foreign=true;globalThis.fetch=async(input,init)=>{const u=new URL(String(input));if(u.hostname!=='graph.facebook.com')return original(input,init);assert.equal(u.searchParams.get('after'),'saved-active-cursor');return Response.json({data:[{id:'916099',account_id:foreign?'999999':id,status:'PAUSED',effective_status:'PAUSED',name:'Pausado'}]});};
      try{assert.equal(await syncStep(id),false);let a=await db.metaAdAccount.findUniqueOrThrow({where:{id}});assert(a.syncError?.includes('otra cuenta'));assert.equal((a.syncState as any).phase,4);assert.equal((a.syncState as any).after,'saved-active-cursor');assert.equal(await db.metaAdObject.count({where:{accountId:id}}),0);foreign=false;assert((await queueSync(actor,id,false,7,true)).resumed);assert(await syncStep(id));a=await db.metaAdAccount.findUniqueOrThrow({where:{id}});assert.equal((a.syncState as any).phase,5);assert.equal(a.syncError,null);assert.equal(await db.metaAdObject.count({where:{accountId:id}}),0);}finally{globalThis.fetch=original;await controlSync(actor,id,'cancel');}
    });
    await t.test('Meta histórico agrupado:100 seleccionados en2 lecturas, caché, rechazo ajeno/duplicado y progreso real',async()=>{
      const {syncStep,queueSync,controlSync}=await import('../lib/meta-ads/service'),{localDay,shiftDay}=await import('../lib/meta-ads/analytics'),{encryptKey}=await import('../lib/crypto'),{syncProgress}=await import('../lib/meta-ads/sync-progress');const actor=await db.user.findFirstOrThrow({where:{role:'OWNER'}}),cid='grouped-synthetic-history',id='91701',started=new Date(Date.now()-1000),today=localDay('America/Lima'),scope='7d_click,1d_view|impression',ids=Array.from({length:100},(_,i)=>'91701'+String(i).padStart(3,'0'));
      await db.metaConnection.create({data:{id:cid,ownerId:actor.id,name:'Histórico agrupado',transport:'API',apiVersion:'v26.0',encryptedToken:encryptKey('synthetic-grouped-history','meta:'+cid),verifiedAt:new Date()}});await db.metaAdAccount.create({data:{id,connectionId:cid,name:'Agrupado',currency:'PEN',timezone:'America/Lima',enabled:true,syncedAt:new Date(),selectionSince:started,nextSyncAt:new Date(),syncState:{plan:'focus',phase:10,recentDays:7,started:started.toISOString(),until:today,recentReady:true}}});await db.metaAdObject.createMany({data:ids.map(oid=>({id:oid,accountId:id,level:'ad',name:'Anuncio '+oid,selectedAt:started,effectiveStatus:'PAUSED'}))});await db.metaAdObject.create({data:{id:'91701999',accountId:id,level:'ad',name:'Fuera de selección'}});await db.metaAdTotal.createMany({data:ids.slice(0,10).map(objectId=>({objectId,accountId:id,since:shiftDay(today,-180),until:today,scope,spend:10,impressions:10,clicks:1,actions:{}}))});
      const original=globalThis.fetch;let mode='foreign',calls=0;const groups:string[][]=[];globalThis.fetch=async(input,init)=>{const u=new URL(String(input));if(u.hostname!=='graph.facebook.com')return original(input,init);calls++;assert.equal(u.pathname,'/v26.0/act_'+id+'/insights');assert.equal(init?.method??'GET','GET');assert.equal(u.searchParams.get('date_preset'),'maximum');assert(!u.searchParams.has('ids'));const [f]=JSON.parse(u.searchParams.get('filtering')!);assert.equal(f.field,'ad.id');assert.equal(f.operator,'IN');assert(f.value.length<=50);assert(f.value.every((oid:string)=>ids.includes(oid)));groups.push(f.value);const data=f.value.map((ad_id:string)=>({account_id:id,ad_id,date_start:shiftDay(today,-180),date_stop:today,spend:'20',impressions:'100',clicks:'10',actions:[]}));if(mode==='foreign')data[0].account_id='999';if(mode==='duplicate')data[1]=data[0];return Response.json({data});};
      try{
        assert.equal(await syncStep(id),false);assert.equal(await db.metaAdTotal.count({where:{accountId:id}}),10);assert.equal(((await db.metaAdAccount.findUniqueOrThrow({where:{id}})).syncState as any).phase,10);await queueSync(actor,id,false,7,true);mode='duplicate';assert.equal(await syncStep(id),false);assert.equal(await db.metaAdTotal.count({where:{accountId:id}}),10);await queueSync(actor,id,false,7,true);mode='ok';const before=calls;assert(await syncStep(id));let a=await db.metaAdAccount.findUniqueOrThrow({where:{id}});assert.equal(syncProgress(a).historyProcessed,50);assert.equal(syncProgress(a).historyTotal,100);assert.equal(syncProgress(a).recentReady,true);assert.equal(await db.metaAdTotal.count({where:{accountId:id}}),50);assert(await syncStep(id));a=await db.metaAdAccount.findUniqueOrThrow({where:{id}});assert.equal(syncProgress(a).status,'complete');assert.equal(syncProgress(a).historyProcessed,100);assert.equal(syncProgress(a).historyTotal,100);assert.equal(calls-before,2);assert.equal(groups.at(-2)!.length,40);assert.equal(groups.at(-1)!.length,50);assert.equal(await db.metaAdTotal.count({where:{accountId:id}}),100);assert.equal(await db.metaAdTotal.count({where:{objectId:'91701999'}}),0);
      }finally{globalThis.fetch=original;await controlSync(actor,id,'cancel');}
    });
    await t.test('Meta: inventario completo activo y pausado, agregados de conversaciones y control explícito OWNER',async()=>{
      const {queueSync,syncStep}=await import('../lib/meta-ads/service'),{setMetaStatus}=await import('../lib/meta-ads/manage'),{dashboard}=await import('../lib/meta-ads/dashboard'),{localDay,shiftDay}=await import('../lib/meta-ads/analytics'),{encryptKey}=await import('../lib/crypto');
      const actor=await db.user.findFirstOrThrow({where:{role:'OWNER'}}),id='97001',cid='all-status-synthetic',today=localDay('America/Lima');
      await db.metaConnection.create({data:{id:cid,ownerId:actor.id,name:'Todos los estados',transport:'API',apiVersion:'v26.0',encryptedToken:encryptKey('synthetic-all-status-token','meta:'+cid),verifiedAt:new Date()}});
      await db.metaAdAccount.create({data:{id,connectionId:cid,name:'Todos',currency:'PEN',timezone:'America/Lima',metric:'AUTO'}});
      const rows=[{id:'970011',level:'campaign',campaign_id:'970011',status:'ACTIVE',name:'Campaña conversaciones'},{id:'970012',level:'adset',campaign_id:'970011',adset_id:'970012',status:'ACTIVE',name:'Conjunto conversaciones'},{id:'970013',level:'ad',campaign_id:'970011',adset_id:'970012',status:'ACTIVE',name:'Anuncio activo'},{id:'970021',level:'campaign',campaign_id:'970021',status:'PAUSED',name:'Campaña antigua desactivada'},{id:'970022',level:'adset',campaign_id:'970021',adset_id:'970022',status:'PAUSED',name:'Conjunto antiguo desactivado'},{id:'970023',level:'ad',campaign_id:'970021',adset_id:'970022',status:'PAUSED',name:'Anuncio antiguo desactivado'}];
      const original=globalThis.fetch;let posts=0,deny=false,foreign=false,changeRevision=false,refreshed=false;const calls:URL[]=[];
      globalThis.fetch=async(input,init)=>{const u=new URL(String(input));if(u.hostname!=='graph.facebook.com')return original(input,init);calls.push(u);assert(!u.searchParams.has('ids'));const leaf=u.pathname.split('/').at(-1)!,oid=u.pathname.split('/')[2],row=rows.find(r=>r.id===oid);
        if(init?.method==='POST'){posts++;assert(row);assert.equal(new URLSearchParams(String(init.body)).get('status'),'PAUSED');if(deny)return Response.json({error:{code:200,message:'Requires ads_management'}},{status:403});row.status='PAUSED';return Response.json({success:true});}
        const metadata=(r:any)=>({...r,account_id:foreign?'99999':id,effective_status:r.status,objective:'OUTCOME_LEADS',created_time:'2020-01-01T12:00:00Z',...(refreshed&&r.id==='970013'?{creative:{thumbnail_url:'https://synthetic.fbcdn.net/new-flyer.jpg'}}:{})});
        if(leaf==='insights'){if(!u.searchParams.has('filtering'))return Response.json({data:[]});const [f]=JSON.parse(u.searchParams.get('filtering')!);const selected=rows.filter(r=>f.value.includes(r.id));assert.equal(selected.length,f.value.length);return Response.json({data:selected.filter(r=>r.status==='ACTIVE').map(r=>({account_id:id,[r.level+'_id']:r.id,campaign_id:r.campaign_id,adset_id:r.adset_id,date_start:u.searchParams.has('date_preset')?shiftDay(today,-300):today,date_stop:today,spend:refreshed?'150.52':'75.26',impressions:'5574',clicks:'200',actions:[{action_type:'onsite_conversion.messaging_conversation_started_7d',value:'180'},{action_type:'lead',value:'2'}]}))});}
        if(['campaigns','adsets','ads'].includes(leaf)){assert(!u.searchParams.has('effective_status'));assert(u.searchParams.get('fields')!.includes('account_id'));const level=leaf==='campaigns'?'campaign':leaf==='adsets'?'adset':'ad';return Response.json({data:rows.filter(r=>r.level===level&&r.status===(u.searchParams.has('after')?'ACTIVE':'PAUSED')).map(metadata),...(!u.searchParams.has('after')?{paging:{next:'ignored',cursors:{after:'next'}}}:{})});}
        assert(row);if(changeRevision){await db.metaConnection.update({where:{id:cid},data:{revision:{increment:1}}});changeRevision=false;}return Response.json(metadata(row));
      };
      try{
        await db.metaAdAccount.update({where:{id},data:{syncState:{plan:'focus',inventory:'recent',phase:4,started:new Date().toISOString(),recentDays:7,until:today},syncToken:'retired-scope-lease',syncLeaseAt:new Date()}});await queueSync(actor,id,false,7,true,'all');let done=false;for(let i=0;i<25;i++){assert(await syncStep(id));const a=await db.metaAdAccount.findUniqueOrThrow({where:{id}});if((a.syncState as any).phase===undefined){done=true;break;}}assert(done);
        const a=await db.metaAdAccount.findUniqueOrThrow({where:{id}});assert.equal(a.syncError,null);assert.equal((a.syncState as any).lastRun.inventory,'all');assert.equal(await db.metaAdObject.count({where:{accountId:id}}),6);assert.equal(await db.metaAdObject.count({where:{accountId:id,status:'PAUSED'}}),3);
        for(const level of ['campaign','adset','ad']){const data=await dashboard(actor,new URLSearchParams({accounts:id,level,metric:'MESSAGES'}));assert.equal(data.total,2);const active=data.items.find(o=>o.status==='ACTIVE')!;assert.equal(active.periods['7'].results,180);assert(Math.abs(active.periods['7'].cost!-75.26/180)<0.00001);assert.equal(active.metric,'MESSAGES');}
        assert.equal((await dashboard(actor,new URLSearchParams({accounts:id,level:'adset',campaign:'970011',metric:'MESSAGES'}))).total,1);
        assert.equal((await dashboard(actor,new URLSearchParams({accounts:id,level:'ad',campaign:'970021',adset:'970022',metric:'MESSAGES'}))).items[0].id,'970023');
        assert.equal((await dashboard(actor,new URLSearchParams({accounts:id,level:'adset',campaigns:'970011,970021',metric:'MESSAGES'}))).total,2);
        assert.equal((await dashboard(actor,new URLSearchParams({accounts:id,level:'ad',adsets:'970012,970022',metric:'MESSAGES'}))).total,2);
        assert.equal((await dashboard(actor,new URLSearchParams({accounts:id,level:'ad',campaigns:'970011',adsets:'970022',metric:'MESSAGES'}))).total,0);
        assert.equal((await dashboard(actor,new URLSearchParams({accounts:id,level:'ad',adsets:'970012,999999999',metric:'MESSAGES'}))).total,1);
        await assert.rejects(()=>dashboard(actor,new URLSearchParams({accounts:id,level:'ad',campaigns:'bad'})),/Selección/);
        await assert.rejects(()=>dashboard({id:oid,role:'OBSERVER'},new URLSearchParams({accounts:id,level:'ad',campaigns:'970011,970021'})),/no autorizadas/);
        const alias=await db.metaAlias.create({data:{name:'Alias temporal de actualización'}});await db.metaAdObject.update({where:{id:'970013'},data:{aliasId:alias.id}});
        refreshed=true;rows.find(r=>r.id==='970013')!.name='Anuncio con flyer nuevo';await queueSync(actor,id,false,7,true,'all',true);let refreshedDone=false;
        for(let i=0;i<25;i++){assert(await syncStep(id));const a=await db.metaAdAccount.findUniqueOrThrow({where:{id}});if((a.syncState as any).phase===undefined){refreshedDone=true;break;}}assert(refreshedDone);
        const renewed=await db.metaAdObject.findUniqueOrThrow({where:{id:'970013'}});assert.equal(renewed.name,'Anuncio con flyer nuevo');assert.equal(renewed.thumbnailUrl,'https://synthetic.fbcdn.net/new-flyer.jpg');assert.equal(renewed.aliasId,alias.id);assert.equal(await db.metaAdObject.count({where:{accountId:id}}),6);
        const newData=await dashboard(actor,new URLSearchParams({accounts:id,level:'ad',metric:'MESSAGES'}));assert(Math.abs(newData.items.find(o=>o.id==='970013')!.periods['7'].cost!-150.52/180)<0.00001);assert.equal(posts,0);await db.metaAlias.delete({where:{id:alias.id}});
        const input={status:'PAUSED',expectedStatus:'ACTIVE',confirmed:true};assert.equal((await user.call('meta-ads/objects/970011/status','POST',input)).status,403);assert.equal((await admin.call('meta-ads/objects/970011/status','POST',input)).status,403);assert.equal((await owner.call('meta-ads/objects/970011/status','POST',{...input,confirmed:false})).status,400);assert.equal(posts,0);
        await assert.rejects(()=>setMetaStatus({id:uid,role:'USER'},'970011','PAUSED','ACTIVE'));assert.equal(posts,0);
        deny=true;await assert.rejects(()=>setMetaStatus(actor,'970011','PAUSED','ACTIVE'),/ads_management/);assert.equal((await db.metaAdObject.findUniqueOrThrow({where:{id:'970011'}})).status,'ACTIVE');deny=false;
        foreign=true;await assert.rejects(()=>setMetaStatus(actor,'970011','PAUSED','ACTIVE'),/otra cuenta/);foreign=false;assert.equal(posts,1);
        await setMetaStatus(actor,'970011','PAUSED','ACTIVE');assert.equal(posts,2);assert.equal((await db.metaAdObject.findUniqueOrThrow({where:{id:'970011'}})).status,'PAUSED');assert.equal((await db.metaAdObject.findUniqueOrThrow({where:{id:'970012'}})).effectiveStatus,'CAMPAIGN_PAUSED');
        changeRevision=true;await assert.rejects(()=>setMetaStatus(actor,'970012','PAUSED','ACTIVE'),/conexión|permisos/);assert.equal(posts,2);
        assert(await db.auditEvent.findFirst({where:{action:'META_ESTADO_CAMBIADO',resourceId:'970011'}}));
      }finally{globalThis.fetch=original;await db.metaAdAccount.updateMany({where:{id},data:{enabled:false,nextSyncAt:null,schedulerToken:null,schedulerRunId:null}});}
    });
    await t.test('Meta foco semanal: selección activa/entrega, comparativos30, histórico acumulado y pausa/cancelación con lease',async()=>{
      const {queueSync,syncStep,controlSync}=await import('../lib/meta-ads/service'),{localDay,shiftDay}=await import('../lib/meta-ads/analytics'),{encryptKey}=await import('../lib/crypto');const actor=await db.user.findFirstOrThrow({where:{role:'OWNER'}}),today=localDay('America/Lima'),id='91001',cid='focus-synthetic-connection';
      const c=await db.metaConnection.create({data:{id:cid,ownerId:actor.id,name:'Foco semanal',transport:'API',apiVersion:'v26.0',encryptedToken:encryptKey('synthetic-focused-token','meta:'+cid),verifiedAt:new Date()}});
      await db.metaAdAccount.create({data:{id,connectionId:c.id,name:'Análisis semanal',currency:'PEN',timezone:'America/Lima',metric:'AUTO'}});
      const rows=[{id:'910011',level:'campaign',name:'Campaña antigua con entrega',campaign_id:'910011',objective:'OUTCOME_ENGAGEMENT'},{id:'910012',level:'adset',name:'Conjunto antiguo',campaign_id:'910011',adset_id:'910012',optimization_goal:'CONVERSATIONS'},{id:'910013',level:'ad',name:'Anuncio antiguo',campaign_id:'910011',adset_id:'910012'},{id:'910021',level:'campaign',name:'Campaña activa sin entrega',campaign_id:'910021'},{id:'910022',level:'adset',name:'Conjunto activo sin entrega',campaign_id:'910021',adset_id:'910022'},{id:'910023',level:'ad',name:'Anuncio activo sin entrega',campaign_id:'910021',adset_id:'910022'}];
      await db.metaAdObject.create({data:{id:'910099',accountId:id,level:'ad',name:'Fuera de selección',effectiveStatus:'PAUSED'}});await db.metaAdDaily.create({data:{accountId:id,objectId:'910099',day:shiftDay(today,-300),scope:'7d_click,1d_view|impression',spend:99,impressions:100,clicks:1,actions:{}}});
      const original=globalThis.fetch;let historyFail=true,hold=false,held:(()=>void)|undefined,release:(()=>void)|undefined;const calls:URL[]=[];
      globalThis.fetch=async(input,init)=>{const u=new URL(String(input));if(u.hostname!=='graph.facebook.com')return original(input,init);calls.push(u);assert.equal(init?.method??'GET','GET');assert(!u.searchParams.has('ids'));const leaf=u.pathname.split('/').at(-1)!,parts=u.pathname.split('/');const metric=(row:any,d:string,stop=d,spend='3',results='6')=>({account_id:id,[row.level+'_id']:row.id,campaign_id:row.campaign_id,adset_id:row.adset_id,[row.level+'_name']:row.name,date_start:d,date_stop:stop,spend,impressions:'30',clicks:'3',actions:[{action_type:'onsite_conversion.messaging_conversation_started_7d',value:results}]});
        if(u.pathname.includes('/act_'+id+'/insights')&&u.searchParams.has('filtering')){const [f]=JSON.parse(u.searchParams.get('filtering')!);const level=u.searchParams.get('level');assert.equal(f.field,level+'.id');assert.equal(f.operator,'IN');assert(f.value.every((id:string)=>rows.some(r=>r.id===id&&r.level===level)));const selected=rows.filter(r=>f.value.includes(r.id));if(u.searchParams.has('date_preset')){assert(f.value.length<=50);assert.equal(u.searchParams.get('time_increment'),'all_days');if(historyFail)return Response.json({error:{code:4,message:'Synthetic history quota'}},{status:429});return Response.json({data:selected.filter(row=>!row.id.startsWith('91002')).map(row=>metric(row,shiftDay(today,-180),today,'200','100'))});}assert(f.value.length<=3);assert.equal(u.searchParams.get('time_increment'),'1');assert.deepEqual(JSON.parse(u.searchParams.get('time_range')!),{since:shiftDay(today,-29),until:today});return Response.json({data:selected.filter(row=>!row.id.startsWith('91002')).map(row=>metric(row,today))});}
        if(u.pathname.includes('/act_'+id+'/insights')){assert.equal(u.searchParams.get('time_increment'),'all_days');assert.deepEqual(JSON.parse(u.searchParams.get('time_range')!),{since:shiftDay(today,-6),until:today});if(hold){held?.();await new Promise<void>(r=>release=r);}const row=rows.find(r=>r.level===u.searchParams.get('level'))!;return Response.json({data:[metric(row,shiftDay(today,-6),today)]});}
        if(['campaigns','adsets','ads'].includes(leaf)){assert.deepEqual(JSON.parse(u.searchParams.get('effective_status')!),['ACTIVE']);const level=leaf==='campaigns'?'campaign':leaf==='adsets'?'adset':'ad';const paused={id:'910088',account_id:id,name:'Pausado fuera de selección',status:'PAUSED',effective_status:'PAUSED',created_time:'2020-01-01T12:00:00Z'};if(leaf==='adsets'&&!u.searchParams.has('after'))return Response.json({data:[paused],paging:{next:'ignored',cursors:{after:'synthetic-active-page'}}});return Response.json({data:[...rows.filter(r=>r.level===level).map(r=>({...r,account_id:id,status:r.id.startsWith('91002')?'ACTIVE':'PAUSED',effective_status:r.id.startsWith('91002')?'ACTIVE':'PAUSED',created_time:'2020-01-01T12:00:00Z'})),paused]});}
        const row=rows.find(r=>r.id===parts[2]);assert(row,'Only selected object endpoints');
        if(leaf==='insights'){
          if(u.searchParams.has('date_preset')){assert.equal(u.searchParams.get('time_increment'),'all_days');if(historyFail)return Response.json({error:{code:4,message:'Synthetic history quota'}},{status:429});return Response.json({data:row.id.startsWith('91002')?[]:[metric(row,shiftDay(today,-180),today,'200','100')]});}
          assert.equal(u.searchParams.get('time_increment'),'1');assert.deepEqual(JSON.parse(u.searchParams.get('time_range')!),{since:shiftDay(today,-29),until:today});return Response.json({data:row.id.startsWith('91002')?[]:[metric(row,today)]});
        }
        return Response.json({...row,account_id:id,status:'PAUSED',effective_status:'PAUSED',created_time:'2020-01-01T12:00:00Z'});
      };
      try{
        assert.equal((await queueSync(actor,id,false,7,true)).resumed,false);assert((await db.metaAdAccount.findUniqueOrThrow({where:{id}})).enabled);const priorCalls=calls.length;assert.equal(await syncStep(id,'retired-synthetic-schedule'),false);assert.equal(calls.length,priorCalls);
        let current;for(let i=0;i<20;i++){current=await db.metaAdAccount.findUniqueOrThrow({where:{id}});if((current.syncState as any).recentReady)break;assert(await syncStep(id));}assert((current!.syncState as any).recentReady);assert.equal((current!.syncState as any).phase,10);assert(current!.syncedAt);assert(current!.selectionSince);
        const ready=await owner.call('meta-ads/dashboard?accounts='+id+'&level=ad&metric=MESSAGES');assert.equal(ready.status,200,JSON.stringify(ready.body));assert.equal(ready.body.total,2);const ad=ready.body.items.find((o:any)=>o.id==='910013');assert.equal(ad.periods['30'].cost,0.5);assert.equal(ad.periods['15'].cost,0.5);assert.equal(ad.periods.lifetime.state,'UNAVAILABLE');assert.equal(ad.historyPending,true);assert.equal(ready.body.items.find((o:any)=>o.id==='910023').effectiveStatus,'ACTIVE');
        await db.metaAdObject.update({where:{id:'910013'},data:{status:'ACTIVE'}});const pausedView=await owner.call('meta-ads/dashboard?accounts='+id+'&level=ad&metric=MESSAGES&state=paused');assert.equal(pausedView.status,200);assert.equal(pausedView.body.total,1);assert.equal(pausedView.body.items[0].id,'910013');assert.equal(pausedView.body.items[0].effectiveStatus,'PAUSED');await db.metaAdObject.update({where:{id:'910013'},data:{status:'PAUSED'}});
        assert.equal(await syncStep(id),false);current=await db.metaAdAccount.findUniqueOrThrow({where:{id}});const beforePause=current.syncState;assert(current.syncError?.includes('código 4'));await assert.rejects(()=>controlSync({id:uid,role:'USER'},id,'pause'),/permiso|disponible/);await controlSync(actor,id,'pause');current=await db.metaAdAccount.findUniqueOrThrow({where:{id}});assert.equal(current.enabled,false);assert.equal((current.syncState as any).phase,(beforePause as any).phase);assert.equal((current.syncState as any).stop,'paused');assert.equal(await syncStep(id),false);
        await db.metaApiQuota.updateMany({data:{blockedUntil:new Date(0),nextReadAt:new Date(0)}});assert.equal((await queueSync(actor,id,false,7,true)).resumed,true);historyFail=false;for(let i=0;i<5;i++){assert(await syncStep(id));current=await db.metaAdAccount.findUniqueOrThrow({where:{id}});if((current.syncState as any).phase===undefined)break;}
        assert.equal(await db.metaAdObject.count({where:{id:'910088'}}),0);assert.equal((await db.metaAdObject.findUniqueOrThrow({where:{id:'910013'}})).effectiveStatus,'PAUSED');assert(calls.some(u=>u.pathname.endsWith('/adsets')&&u.searchParams.get('after')==='synthetic-active-page'));
        assert.equal(await db.metaAdTotal.count({where:{accountId:id}}),6);const complete=(await owner.call('meta-ads/dashboard?accounts='+id+'&level=ad&metric=MESSAGES')).body.items.find((o:any)=>o.id==='910013');assert.equal(complete.periods.lifetime.cost,2);assert.equal(complete.periods.lifetime.spend,200);assert.equal(complete.periods['30'].cost,0.5);assert.equal(complete.historyPartial,true);assert.equal(complete.historyPending,false);assert.equal(await db.metaAdDaily.count({where:{objectId:'910099'}}),1);assert(!calls.some(u=>u.pathname.includes('910099')));
        const savedState=(await db.metaAdAccount.findUniqueOrThrow({where:{id}})).syncState as any;await db.metaAdAccount.update({where:{id},data:{syncState:{...savedState,lastRun:{...savedState.lastRun,until:shiftDay(today,-1)}}}});const stale=(await owner.call('meta-ads/dashboard?accounts='+id+'&level=ad&metric=MESSAGES')).body.items.find((o:any)=>o.id==='910013');assert.equal(stale.periods.today.state,'UNAVAILABLE');assert.equal(stale.rating,'STALE');await db.metaAdAccount.update({where:{id},data:{syncState:savedState}});
        // An in-flight response cannot commit after pause invalidates its lease.
        await queueSync(actor,id,false,7,true);hold=true;let signal!:()=>void;const waiting=new Promise<void>(r=>signal=r);held=signal;const pending=syncStep(id);await waiting;await controlSync(actor,id,'pause');release!();assert.equal(await pending,false);current=await db.metaAdAccount.findUniqueOrThrow({where:{id}});assert.equal((current.syncState as any).stop,'paused');assert.equal(current.syncError,null);assert.equal(current.syncToken,null);hold=false;
        await controlSync(actor,id,'cancel');current=await db.metaAdAccount.findUniqueOrThrow({where:{id}});assert.equal((current.syncState as any).stop,'cancelled');assert.equal((current.syncState as any).phase,undefined);assert.equal(await db.metaAdTotal.count({where:{accountId:id}}),6);assert.equal((await queueSync(actor,id,false,7,true)).resumed,false);current=await db.metaAdAccount.findUniqueOrThrow({where:{id}});assert.equal((current.syncState as any).phase,0);assert(!JSON.stringify(current.syncState).includes('ids='));
      }finally{globalThis.fetch=original;await controlSync(actor,id,'cancel');}
    });
    await t.test('Meta Ads: reconciliación de ceros, incertidumbre de datos y revocación de conexiones',async()=>{
      const {syncStep}=await import('../lib/meta-ads/service');const account=await db.metaAdAccount.findFirstOrThrow({where:{name:'Cuenta PEN'},include:{connection:true}}),now=new Date();await db.metaAdAccount.update({where:{id:account.id},data:{enabled:true,nextSyncAt:now,syncState:{phase:5,mode:'recent',since:'2020-01-01',until:'2099-01-01',started:now.toISOString()}}});
      const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({data:[]});try{assert(await syncStep(account.id));assert.equal(await db.metaAdDaily.count({where:{accountId:account.id,object:{level:'ad'}}}),0);}finally{globalThis.fetch=original;await db.metaAdAccount.update({where:{id:account.id},data:{enabled:false,nextSyncAt:null}});}
      assert.equal((await owner.call(`meta-ads/accounts/${account.id}/grants`,'PUT',{grants:[{userId:uid,canSync:true}]})).status,400);
      assert.equal((await owner.call('meta-ads/connections/'+account.connectionId,'DELETE')).status,200);assert.equal((await user.call('meta-ads/accounts')).body.length,0);const preserved=await db.metaAdDaily.count({where:{accountId:account.id}});assert(preserved>0);assert.equal((await db.metaConnection.findUniqueOrThrow({where:{id:account.connectionId}})).encryptedToken,null);
    });
    await t.test('Marketing API: mínimo id/name, descifrado Bearer, campos opcionales y diagnóstico seguro sin reemplazar conexión',async()=>{
      const {discover}=await import('../lib/meta-ads/service');const actor=await db.user.findFirstOrThrow({where:{role:'OWNER'}}),token='EAA-synthetic-graph-secret-1234567890123456789',original=globalThis.fetch;let denied=false;const calls:string[]=[];
      const created=await owner.call('meta-ads/connections','POST',{name:'PULPO META ADS · prueba sintética',transport:'API',apiVersion:'v23.0',token});assert.equal(created.status,201);const id=created.body.id,before=await db.metaConnection.findUniqueOrThrow({where:{id}});
      assert.equal((await owner.call('meta-ads/connections/'+id,'PATCH',{apiVersion:'v26.0'})).status,200);const changed=await db.metaConnection.findUniqueOrThrow({where:{id}});assert.equal(changed.encryptedToken,before.encryptedToken);assert.equal(changed.tokenMask,before.tokenMask);assert.equal(changed.apiVersion,'v26.0');
      globalThis.fetch=async(input,init)=>{const u=new URL(String(input));if(['localhost','127.0.0.1'].includes(u.hostname))return original(input,init);assert.equal(u.hostname,'graph.facebook.com');assert.equal(u.pathname,'/v26.0/me/adaccounts');assert.equal(init?.method??'GET','GET');assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer '+token);assert(!u.searchParams.has('access_token'));const f=u.searchParams.get('fields')!;calls.push(f);if(denied)return Response.json({error:{code:190,error_subcode:463,message:'Expired token '+token}},{status:400});if(f.includes('business'))return Response.json({error:{code:200,error_subcode:33,message:'business field requires extra permission '+token}},{status:400});return Response.json({data:[{id:'82001',name:'Cuenta Graph sintética',...(f.includes('currency')?{currency:'PEN',timezone_name:'America/Lima'}:{}),...(f.includes('account_status')?{account_status:1}:{})}]});};
      try{const result=await discover(actor,id);assert.equal(result.accounts,1);assert.equal(result.minimalVerified,true);assert.equal(result.apiVersion,'v26.0');assert.deepEqual(calls,['id,name','id,name,currency,timezone_name','id,name,account_status','id,name,business{id,name}']);assert.equal(result.warnings[0].code,200);assert.equal(result.warnings[0].subcode,33);assert(!JSON.stringify(result).includes(token));const saved=await db.metaConnection.findUniqueOrThrow({where:{id}});assert(saved.verifiedAt);assert.equal(saved.encryptedToken,before.encryptedToken);assert(saved.lastError?.includes('código 200/33'));assert(!saved.lastError?.includes(token));const account=await db.metaAdAccount.findUniqueOrThrow({where:{id:'82001'}});assert.equal(account.currency,'PEN');assert.equal(account.timezone,'America/Lima');assert.equal(account.businessId,null);
      denied=true;calls.length=0;await assert.rejects(()=>discover(actor,id),/código 190 \/ subcódigo 463/);assert.deepEqual(calls,['id,name']);const failed=await db.metaConnection.findUniqueOrThrow({where:{id}});assert.equal(failed.verifiedAt,null);assert.equal(failed.encryptedToken,before.encryptedToken);assert(failed.lastError?.includes('v26.0'));assert(!failed.lastError?.includes(token));assert.equal(await db.metaAdAccount.count({where:{id:'82001'}}),1);
      const audit=await db.auditEvent.findFirstOrThrow({where:{resourceId:id,action:'META_CONEXION_ERROR'}});assert.equal((audit.detail as any).code,190);assert.equal((audit.detail as any).subcode,463);assert(!JSON.stringify(audit.detail).includes(token));
      }finally{globalThis.fetch=original;}
    });
    await t.test('Meta: conexión ligera no recorre cuentas ni altera inventario, cursado o credencial; revisión y cuota protegidas',async()=>{
      const {refreshConnection,queueSync}=await import('../lib/meta-ads/service');
      const actor=await db.user.findFirstOrThrow({where:{role:'OWNER'}});
      const c=(await owner.call('meta-ads/connections','POST',{name:'Comprobación ligera sintética',transport:'API',token:'synthetic-refresh-connection-123456789'})).body;
      const state={plan:'focus',inventory:'all',phase:10,after:'saved-cursor',started:new Date().toISOString(),recentDays:7,until:'2026-10-21',historyProcessed:50};
      await db.metaAdAccount.create({data:{id:'96091',connectionId:c.id,name:'Ligera',currency:'PEN',timezone:'America/Lima',enabled:true,syncState:state,syncToken:'old-lease',syncLeaseAt:new Date()}});
      await db.metaAccountSource.create({data:{accountId:'96091',connectionId:c.id,revision:0}});
      const before=await db.metaConnection.findUniqueOrThrow({where:{id:c.id}}),original=globalThis.fetch;let calls=0,mode='ok';
      globalThis.fetch=async(input,init)=>{calls++;const u=new URL(String(input));assert.equal(u.pathname,'/v26.0/me/adaccounts');assert.equal(u.searchParams.get('fields'),'id,name');assert(!u.searchParams.has('after'));assert.equal(init?.method??'GET','GET');
        if(mode==='race')await db.metaConnection.update({where:{id:c.id},data:{revision:{increment:1}}});
        if(mode==='quota')return Response.json({error:{code:17,message:'Synthetic quota'}},{status:400});
        return Response.json({data:[{id:'act_96091',name:'Ligera'},{id:'act_96092',name:'No importar'}],paging:{cursors:{after:'ignored'},next:'https://graph.facebook.com/v26.0/me/adaccounts?after=ignored'}});};
      try{
        await refreshConnection(actor,c.id);assert.equal(calls,1);let saved=await db.metaConnection.findUniqueOrThrow({where:{id:c.id}});assert(saved.verifiedAt);assert.equal(saved.encryptedToken,before.encryptedToken);assert.equal(saved.revision,before.revision);
        assert.equal(await db.metaAdAccount.count({where:{id:'96092'}}),0);assert.deepEqual((await db.metaAdAccount.findUniqueOrThrow({where:{id:'96091'}})).syncState,state);
        assert.equal((await db.metaAccountSource.findUniqueOrThrow({where:{accountId_connectionId:{accountId:'96091',connectionId:c.id}}})).revision,c.revision);
        mode='race';await assert.rejects(()=>refreshConnection(actor,c.id),/cambió/);
        mode='quota';await assert.rejects(()=>refreshConnection(actor,c.id),/Synthetic quota/);saved=await db.metaConnection.findUniqueOrThrow({where:{id:c.id}});assert(saved.verifiedAt);assert(saved.encryptedToken);
        await assert.rejects(()=>refreshConnection({id:uid,role:'USER'},c.id));
        // Explicit refresh restarts recent/catalog phases, fences old leases and preserves data/quota.
        const result=await queueSync(actor,'96091',false,7,true,'all',true);assert(result.queued);assert(result.waiting);
        const a=await db.metaAdAccount.findUniqueOrThrow({where:{id:'96091'}});assert.equal((a.syncState as any).phase,0);assert.equal(a.syncToken,null);assert(a.nextSyncAt!>new Date());
      }finally{globalThis.fetch=original;}
      assert.equal((await user.call('meta-ads/connections/'+c.id+'/refresh','POST',{})).status,403);
    });
    await t.test('Meta: catálogo de alias vacío, asignación local, filtro autorizado y permisos',async()=>{
      const c=(await owner.call('meta-ads/connections','POST',{name:'Alias sintético',transport:'API',token:'synthetic-alias-123456789'})).body;
      for(const id of ['96081','96082'])await db.metaAdAccount.create({data:{id,connectionId:c.id,name:'Alias '+id,currency:'PEN',timezone:'America/Lima'}});
      for(const [id,accountId] of [['960811','96081'],['960812','96081'],['960821','96082']])await db.metaAdObject.create({data:{id,accountId,level:'campaign',name:'Campaña alias'}});
      assert.deepEqual((await owner.call('meta-ads/aliases')).body,[]);
      const r=await owner.call('meta-ads/aliases','POST',{name:'Diplomado sintético'});assert.equal(r.status,201);const alias=r.body;
      assert.equal((await user.call('meta-ads/aliases','POST',{name:'No permitido'})).status,403);
      assert.equal((await owner.call('meta-ads/aliases','POST',{name:'DIPLOMADO SINTÉTICO'})).status,409);
      assert.equal((await owner.call('meta-ads/objects/960811/alias','PATCH',{aliasId:alias.id})).status,200);
      assert.equal((await owner.call('meta-ads/objects/960821/alias','PATCH',{aliasId:alias.id})).status,200);
      assert.equal((await admin.call('meta-ads/objects/960812/alias','PATCH',{aliasId:alias.id})).status,403);
      assert.equal((await owner.call('meta-ads/objects/960812/alias','PATCH',{aliasId:'not-existing'})).status,404);
      const list=await owner.call('meta-ads/dashboard?accounts=96081&level=campaign&alias='+alias.id);assert.equal(list.status,200);assert.deepEqual(list.body.items.map((o:any)=>o.id),['960811']);assert.equal(list.body.items[0].alias.name,'Diplomado sintético');
      assert.deepEqual((await owner.call('meta-ads/dashboard?accounts=96081&level=campaign&alias=__none')).body.items.map((o:any)=>o.id),['960812']);
      assert(!(await user.call('meta-ads/aliases')).body.some((a:any)=>a.id===alias.id));
      assert.equal((await user.call('meta-ads/dashboard?accounts=96081&level=campaign&alias='+alias.id)).status,404);
      const bulkPath='meta-ads/objects/alias',chosen=['960811','960812'];
      assert.equal((await admin.call(bulkPath,'PATCH',{objectIds:chosen,aliasId:alias.id})).status,403);
      assert.equal((await owner.call(bulkPath,'PATCH',{objectIds:[],aliasId:alias.id})).status,400);
      assert.equal((await owner.call(bulkPath,'PATCH',{objectIds:['960811','999999999'],aliasId:alias.id})).status,404);
      assert.equal((await db.metaAdObject.findUniqueOrThrow({where:{id:'960812'}})).aliasId,null);
      assert.equal((await owner.call(bulkPath,'PATCH',{objectIds:chosen,aliasId:'not-existing'})).status,404);
      const bulk=await owner.call(bulkPath,'PATCH',{objectIds:[...chosen,'960811'],aliasId:alias.id});assert.equal(bulk.status,200,JSON.stringify(bulk.body));assert.equal(bulk.body.count,2);assert.equal(await db.metaAdObject.count({where:{id:{in:chosen},aliasId:alias.id}}),2);
      const clear=await owner.call(bulkPath,'PATCH',{objectIds:chosen,aliasId:null});assert.equal(clear.status,200);assert.equal(await db.metaAdObject.count({where:{id:{in:chosen},aliasId:null}}),2);
      assert.equal((await owner.call('meta-ads/objects/960811/alias','PATCH',{aliasId:alias.id})).status,200);
      assert.equal((await owner.call('meta-ads/aliases/'+alias.id,'PATCH',{name:'Alias renombrado'})).status,200);
      assert.equal((await owner.call('meta-ads/objects/960811/alias','PATCH',{aliasId:null})).status,200);
      assert.equal((await db.metaAdObject.findUniqueOrThrow({where:{id:'960811'}})).aliasId,null);
      await db.metaAlias.delete({where:{id:alias.id}});
    });
    await t.test('Productos: tablas privadas del OWNER, Diplomados por defecto y alias conservados por tabla',async()=>{
      const tables='meta-ads/alias-tables';
      assert.equal((await admin.call(tables)).status,403);assert.equal((await observer.call(tables)).status,403);assert.equal((await anonymous.call(tables)).status,401);
      const initial=await owner.call(tables);assert.equal(initial.status,200);assert(initial.body.some((x:any)=>x.id==='diplomados'&&x.name==='Diplomados'));
      assert.equal((await user.call(tables,'POST',{name:'No permitido'})).status,403);
      assert.equal((await owner.call(tables,'POST',{name:'   '})).status,400);assert.equal((await owner.call(tables,'POST',{name:'Cursos',extra:true})).status,400);
      const r=await owner.call(tables,'POST',{name:'Cursos '+tag});assert.equal(r.status,201);const table=r.body;
      let alias:any,legacy:any,connection:any;
      try {
        assert.equal((await owner.call(tables,'POST',{name:('Cursos '+tag).toUpperCase()})).status,409);
        assert.equal((await owner.call('meta-ads/aliases','POST',{name:'No crear '+tag,tableId:'missing'})).status,404);
        const made=await owner.call('meta-ads/aliases','POST',{name:'Producto '+tag,tableId:table.id});assert.equal(made.status,201);alias=made.body;assert.equal(alias.tableId,table.id);
        legacy=(await owner.call('meta-ads/aliases','POST',{name:'Diplomado previo '+tag})).body;assert.equal(legacy.tableId,'diplomados');
        const list=(await owner.call(tables)).body;assert(list.find((x:any)=>x.id===table.id).aliases.some((x:any)=>x.id===alias.id));assert(!list.find((x:any)=>x.id==='diplomados').aliases.some((x:any)=>x.id===alias.id));
        assert((await owner.call('meta-ads/aliases')).body.some((x:any)=>x.id===alias.id));
        connection=(await owner.call('meta-ads/connections','POST',{name:'Tabla de productos sintética',transport:'API',token:'synthetic-table-connection-123456789'})).body;
        await db.metaAdAccount.create({data:{id:'961701',connectionId:connection.id,name:'Productos',currency:'PEN',timezone:'America/Lima'}});
        await db.metaAdObject.create({data:{id:'9617011',accountId:'961701',level:'campaign',name:'Campaña de tabla'}});
        assert.equal((await owner.call('meta-ads/objects/9617011/alias','PATCH',{aliasId:alias.id})).status,200);
        assert.equal((await owner.call('meta-ads/aliases/'+alias.id,'PATCH',{name:'Producto renombrado '+tag})).status,200);assert.equal((await db.metaAdObject.findUniqueOrThrow({where:{id:'9617011'}})).aliasId,alias.id);assert.equal((await db.metaAlias.findUniqueOrThrow({where:{id:alias.id}})).tableId,table.id);
        assert.equal((await owner.call('meta-ads/aliases/'+alias.id,'PATCH',{name:'Mover',tableId:'diplomados'})).status,400);
        await assert.rejects(()=>db.metaAliasTable.delete({where:{id:table.id}}));
        assert.equal(await db.auditEvent.count({where:{resourceId:table.id,action:'PRODUCTOS_TABLA_CREADA'}}),1);
      } finally {
        if(connection){await db.metaAdAccount.deleteMany({where:{connectionId:connection.id}});await db.metaConnection.delete({where:{id:connection.id}});}
        await db.metaAlias.deleteMany({where:{id:{in:[alias?.id,legacy?.id].filter(Boolean)}}});await db.metaAliasTable.delete({where:{id:table.id}});
      }
    });
    await t.test('Meta alias+país: misma identidad en varias cuentas, filtro antes de resumen y lote atómico autorizado',async()=>{
      const c=(await owner.call('meta-ads/connections','POST',{name:'País de alias sintético',transport:'API',token:'synthetic-country-123456789'})).body;
      const alias=(await owner.call('meta-ads/aliases','POST',{name:'Diplomado internacional '+tag})).body;
      try {
        for(const id of ['962401','962402'])await db.metaAdAccount.create({data:{id,connectionId:c.id,name:'País '+id,currency:'PEN',timezone:'America/Lima'}});
        for(const [id,accountId,level]of [['9624011','962401','campaign'],['9624012','962401','campaign'],['9624021','962402','campaign'],['9624022','962402','adset'],['9624023','962402','ad']])await db.metaAdObject.create({data:{id,accountId,level,name:'Fila de país',status:'ACTIVE',effectiveStatus:'ACTIVE'}});
        assert.equal((await owner.call('meta-ads/objects/9624011/alias','PATCH',{aliasId:alias.id,country:'PE'})).status,200);
        assert.equal((await owner.call('meta-ads/objects/9624012/alias','PATCH',{aliasId:alias.id,country:'CO'})).status,200);
        assert.equal((await owner.call('meta-ads/objects/9624021/alias','PATCH',{aliasId:alias.id,country:'PE'})).status,200);
        const root='meta-ads/dashboard?accounts=962401,962402&level=campaign&summary=1&alias='+alias.id;
        const pe=await owner.call(root+'&country=PE');assert.equal(pe.status,200);assert.deepEqual(pe.body.items.map((x:any)=>x.id).sort(),['9624011','9624021']);assert(pe.body.items.every((x:any)=>x.aliasCountry==='PE'));assert.equal(pe.body.summary.objects,2);assert.equal(pe.body.summary.campaigns.active,2);
        assert.deepEqual((await owner.call(root+'&country=CO')).body.items.map((x:any)=>x.id),['9624012']);assert.equal((await owner.call(root+'&country=__none')).body.total,0);assert.equal((await owner.call(root+'&country=ZZ')).status,400);assert.equal((await user.call(root+'&country=PE')).status,404);
        assert.equal((await admin.call('meta-ads/objects/9624011/alias','PATCH',{aliasId:alias.id,country:'CO'})).status,403);
        for(const country of ['ZZ','pe','Perú'])assert.equal((await owner.call('meta-ads/objects/9624011/alias','PATCH',{aliasId:alias.id,country})).status,400);
        assert.equal((await owner.call('meta-ads/objects/9624011/alias','PATCH',{aliasId:null,country:'PE'})).status,400);
        const before=await db.metaAdObject.findMany({where:{id:{in:['9624011','9624012']}}});
        assert.equal((await owner.call('meta-ads/objects/alias','PATCH',{objectIds:['9624011','999999999'],aliasId:alias.id,country:'MX'})).status,404);assert.deepEqual(await db.metaAdObject.findMany({where:{id:{in:['9624011','9624012']}}}),before);
        const bulk=await owner.call('meta-ads/objects/alias','PATCH',{objectIds:['9624011','9624012'],aliasId:alias.id,country:'MX'});assert.equal(bulk.status,200);assert.equal(await db.metaAdObject.count({where:{id:{in:['9624011','9624012']},aliasCountry:'MX',aliasId:alias.id}}),2);
        // Old clients without country preserve existing labels; legacy records never get an inferred country.
        assert.equal((await owner.call('meta-ads/objects/9624011/alias','PATCH',{aliasId:alias.id})).status,200);assert.equal((await db.metaAdObject.findUniqueOrThrow({where:{id:'9624011'}})).aliasCountry,'MX');
        for(const id of ['9624022','9624023']){assert.equal((await owner.call('meta-ads/objects/'+id+'/alias','PATCH',{aliasId:alias.id,country:'EC'})).status,200);const level=id==='9624022'?'adset':'ad';assert.deepEqual((await owner.call('meta-ads/dashboard?accounts=962402&level='+level+'&alias='+alias.id+'&country=EC')).body.items.map((x:any)=>x.id),[id]);}
        assert.equal((await owner.call('meta-ads/objects/9624011/alias','PATCH',{aliasId:null})).status,200);const cleared=await db.metaAdObject.findUniqueOrThrow({where:{id:'9624011'}});assert.equal(cleared.aliasId,null);assert.equal(cleared.aliasCountry,null);
      } finally {await db.metaAdAccount.deleteMany({where:{connectionId:c.id}});await db.metaConnection.delete({where:{id:c.id}});await db.metaAlias.delete({where:{id:alias.id}});}
    });
    await t.test('Efectividad: intersección exacta alias/país, campañas de varias cuentas sin doble conteo y manuales independientes',async()=>{
      const actor=await db.user.findFirstOrThrow({where:{role:'OWNER'}});
      const conn=await db.metaConnection.create({data:{ownerId:actor.id,name:'Efectividad sintética',transport:'API'}});
      const table=await db.metaAliasTable.create({data:{name:'Efectividad '+tag}});
      const alias=await db.metaAlias.create({data:{name:'Monitoreo '+tag,tableId:table.id}}),other=await db.metaAlias.create({data:{name:'Otro '+tag,tableId:table.id}});
      const day='2026-10-20',scope='7d_click,1d_view|impression';
      const root='meta-ads/effectiveness?'+new URLSearchParams({tableId:table.id,since:day,until:'2026-10-23'});
      try{
       for(const [id,currency] of [['962501','PEN'],['962502','PEN'],['962503','USD']])await db.metaAdAccount.create({data:{id,connectionId:conn.id,name:id,currency,timezone:'America/Lima'}});
       for(const [id,accountId,aliasId,country,level,spend,base] of [['9625011','962501',alias.id,'PE','campaign',10,4],['9625021','962502',alias.id,'PE','campaign',20,6],['9625012','962501',alias.id,'AR','campaign',99,9],['9625013','962501',other.id,'PE','campaign',200,20],['9625014','962501',alias.id,'PE','adset',900,90],['9625015','962501',alias.id,'PE','ad',800,80],['9625016','962501',alias.id,null,'campaign',700,70],['9625031','962503',alias.id,'US','campaign',5,2]] as const){await db.metaAdObject.create({data:{id,accountId,aliasId,aliasCountry:country,level,name:id,status:'PAUSED'}});await db.metaAdDaily.create({data:{objectId:id,accountId,day,scope,spend,actions:{'onsite_conversion.messaging_conversation_started_7d':base}}});}
       await db.metaAdDaily.create({data:{objectId:'9625011',accountId:'962501',day,scope:'other',spend:999,actions:{'onsite_conversion.messaging_conversation_started_7d':999}}});
       assert.equal((await owner.call('meta-ads/effectiveness/import','POST',{tableId:table.id,rows:[{name:alias.name,country:'PE',currency:'PEN'},{name:alias.name,country:'AR',currency:'PEN'},{name:alias.name,country:'US',currency:'USD'},{name:other.name,country:'PE',currency:'PEN'}]})).status,200);
       let r=await owner.call(root);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.rows.length,4);
       const pair=(data:any,country='PE',currency='PEN')=>data.rows.find((x:any)=>x.aliasId===alias.id&&x.country===country&&x.currency===currency);
       assert.equal(pair(r.body).days[day].spend,30);assert.equal(pair(r.body).days[day].base,10);assert.equal(pair(r.body).campaigns,2);assert.equal(pair(r.body,'AR').days[day].spend,99);assert.equal(pair(r.body,'US','USD').days[day].spend,5);assert.equal(pair(r.body).days['2026-10-21'],undefined);
       assert.equal((await admin.call(root)).status,403);assert.equal((await user.call(root)).status,403);
       const manual={aliasId:alias.id,country:'PE',currency:'PEN',day,sales:3,fixedCost:12.5,revision:0};
       assert.equal((await owner.call('meta-ads/effectiveness','PATCH',manual)).status,200);assert.equal((await owner.call('meta-ads/effectiveness','PATCH',manual)).status,409);
       r=await owner.call(root);assert.equal(pair(r.body).days[day].sales,3);assert.equal(pair(r.body).days[day].fixedCost,12.5);assert.equal(pair(r.body).days[day].spend,30);assert.equal(pair(r.body,'AR').days[day].sales,null);
       for(const patch of [{country:'ZZ'},{sales:-1},{spend:3},{day:'2026-02-30'},{day:undefined},{base:6}])assert.equal((await owner.call('meta-ads/effectiveness','PATCH',{...manual,...patch})).status,400);
       assert.equal((await owner.call(root.replace('2026-10-23','2026-12-23'))).status,400);
       assert.equal((await owner.call('meta-ads/alias-tables/'+table.id,'PATCH',{name:'Renombrada '+tag})).status,200);
       assert.equal((await db.metaAlias.findUniqueOrThrow({where:{id:alias.id}})).tableId,table.id);
       await db.metaAdDaily.update({where:{objectId_day_scope:{objectId:'9625021',day,scope}},data:{spend:25,actions:{'onsite_conversion.messaging_conversation_started_7d':7}}});
       r=await owner.call(root);assert.equal(pair(r.body).days[day].spend,35);assert.equal(pair(r.body).days[day].base,11);assert.equal(pair(r.body).days[day].sales,3);
      }finally{await db.metaEffectivenessRow.deleteMany({where:{alias:{tableId:table.id}}});await db.metaAdAccount.deleteMany({where:{connectionId:conn.id}});await db.metaConnection.delete({where:{id:conn.id}});await db.metaAlias.deleteMany({where:{tableId:table.id}});await db.metaAliasTable.delete({where:{id:table.id}});}
    });
    await t.test('Efectividad hoja: importar diplomados atómicamente, países editables sin cambiar Meta y conservar celdas con revisión',async()=>{
      const actor=await db.user.findFirstOrThrow({where:{role:'OWNER'}});
      const conn=await db.metaConnection.create({data:{ownerId:actor.id,name:'Hoja sintética',transport:'API'}});
      const table=await db.metaAliasTable.create({data:{name:'Hoja '+tag}}),foreign=await db.metaAliasTable.create({data:{name:'Otra hoja '+tag}});
      const other=await db.metaAlias.create({data:{name:'Nombre ocupado '+tag,tableId:foreign.id}});
      const name='Diplomado hoja '+tag,day='2026-10-20',currency='PEN',scope='7d_click,1d_view|impression';
      const root='meta-ads/effectiveness?'+new URLSearchParams({tableId:table.id,since:day,until:'2026-10-23'}),upload=(rows:any[])=>owner.call('meta-ads/effectiveness/import','POST',{tableId:table.id,rows});
      try{
       assert.equal((await upload([{name,country:'PE',currency},{name,country:'AR',currency},{name:'Pendiente '+tag,country:'',currency}])).status,200);
       const aliases=await db.metaAlias.findMany({where:{tableId:table.id}});assert.equal(aliases.length,2);const aliasId=aliases.find(a=>a.name===name)!.id;
       assert.equal((await upload([{name:name.toLowerCase(),country:'PE',currency}])).status,200);assert.equal(await db.metaAlias.count({where:{tableId:table.id}}),2);
       assert.equal((await upload([{name:other.name,country:'PE',currency}])).status,200);const separate=await db.metaAlias.findFirstOrThrow({where:{tableId:table.id,name:other.name}});assert.notEqual(separate.id,other.id);assert.equal((await db.metaAlias.findUniqueOrThrow({where:{id:other.id}})).tableId,foreign.id);
       assert.equal((await upload([{name:'No crear '+tag,country:'PE',currency},{name:'Inválido '+tag,country:'ZZ',currency}])).status,400);assert.equal(await db.metaAlias.count({where:{name:'No crear '+tag}}),0);
       const many=await upload(Array.from({length:500},(_,i)=>({name:'Carga '+tag+' '+i,country:'',currency})));assert.equal(many.status,200,JSON.stringify(many.body));assert.equal(many.body.created,500);assert.equal((await upload(Array.from({length:501},(_,i)=>({name:'Exceso '+tag+' '+i,country:'',currency})))).status,400);
       assert.equal((await upload([{name:'Inválido',country:'ZZ',currency}])).status,400);assert.equal((await admin.call('meta-ads/effectiveness/import','POST',{tableId:table.id,rows:[{name:'No',country:'PE',currency}]})).status,403);
       await db.metaAdAccount.create({data:{id:'962601',connectionId:conn.id,name:'Hoja',currency,timezone:'America/Lima'}});
       for(const [id,country,spend]of [['9626011','PE',10],['9626012','CO',7],['9626013','AR',99]] as const){await db.metaAdObject.create({data:{id,accountId:'962601',level:'campaign',name:id,aliasId,aliasCountry:country,status:'ACTIVE'}});await db.metaAdDaily.create({data:{objectId:id,accountId:'962601',day,scope,spend,actions:{'onsite_conversion.messaging_conversation_started_7d':spend}}});}
       let r=await owner.call(root);assert.equal(r.status,200);assert(r.body.rows.some((x:any)=>x.country===''));const pair=(data:any,country:string)=>data.rows.find((x:any)=>x.aliasId===aliasId&&x.country===country&&x.currency===currency);
       const pe=pair(r.body,'PE');assert.equal((await owner.call('meta-ads/effectiveness','PATCH',{aliasId,country:'PE',currency,day,sales:3,fixedCost:12.5,revision:0,rowRevision:pe.rowRevision})).status,200);
       const change={aliasId,fromCountry:'PE',fromCurrency:currency,country:'CO',currency,revision:pe.rowRevision};assert.equal((await owner.call('meta-ads/effectiveness/identity','PATCH',change)).status,200);
       r=await owner.call(root);assert(!pair(r.body,'PE'));assert.equal(pair(r.body,'CO').days[day].spend,7);assert.equal(pair(r.body,'CO').days[day].sales,3);assert.equal(pair(r.body,'CO').days[day].fixedCost,12.5);assert.equal((await db.metaAdObject.findUniqueOrThrow({where:{id:'9626011'}})).aliasCountry,'PE');assert.equal(pair(r.body,'AR').days[day].spend,99);
       assert.equal((await owner.call('meta-ads/effectiveness/identity','PATCH',change)).status,409);assert.equal((await owner.call('meta-ads/effectiveness','PATCH',{aliasId,country:'PE',currency,day,sales:8,revision:1,rowRevision:pe.rowRevision})).status,409);
       const co=pair(r.body,'CO');assert.equal((await owner.call('meta-ads/effectiveness/identity','PATCH',{...change,fromCountry:'CO',country:'AR',revision:co.rowRevision})).status,409);
       assert.equal((await owner.call('meta-ads/effectiveness/identity','PATCH',{...change,fromCountry:'CO',country:'',revision:co.rowRevision})).status,200);
       r=await owner.call(root);assert.equal(pair(r.body,'').days[day].sales,3);assert.equal(pair(r.body,'').days[day].spend,null);
       assert.equal((await upload([{name,country:'PE',currency}])).status,200);r=await owner.call(root);assert.equal(pair(r.body,'PE').days[day].spend,10);assert.equal(pair(r.body,'PE').days[day].sales,null);
      }finally{await db.metaEffectivenessRow.deleteMany({where:{alias:{tableId:{in:[table.id,foreign.id]}}}});await db.metaAdAccount.deleteMany({where:{connectionId:conn.id}});await db.metaConnection.delete({where:{id:conn.id}});await db.metaAlias.deleteMany({where:{tableId:{in:[table.id,foreign.id]}}});await db.metaAliasTable.deleteMany({where:{id:{in:[table.id,foreign.id]}}});}
    });
    await t.test('Efectividad FX: columna A por tabla, cabeceras globales, monedas vacías y conversión diaria sin alterar originales',async()=>{
      const actor=await db.user.findFirstOrThrow({where:{role:'OWNER'}}),table=await db.metaAliasTable.create({data:{name:'Tienda FX '+tag}}),empty=await db.metaAliasTable.create({data:{name:'Vacía FX '+tag}});
      const alias=await db.metaAlias.create({data:{name:'Producto FX '+tag,tableId:table.id}}),conn=await db.metaConnection.create({data:{ownerId:actor.id,name:'FX sintética',transport:'API'}});
      const d1='2026-10-20',d2='2026-10-21',d3='2026-10-22',scope='7d_click,1d_view|impression',query='meta-ads/effectiveness?'+new URLSearchParams({tableId:table.id,since:d1,until:d3});
      const columns=(b:any)=>owner.call('meta-ads/effectiveness/columns','PATCH',{tableId:table.id,...b});
      try{
       for(const [id,currency]of [['962701','PEN'],['962702','USD']])await db.metaAdAccount.create({data:{id,connectionId:conn.id,name:id,currency,timezone:'America/Lima'}});
       for(const [id,accountId]of [['9627011','962701'],['9627021','962702']]){await db.metaAdObject.create({data:{id,accountId,name:'FX',level:'campaign',aliasId:alias.id,aliasCountry:'PE'}});for(const day of [d1,d2,d3])await db.metaAdDaily.create({data:{accountId,objectId:id,day,scope,spend:accountId==='962701'?100:10,actions:{'onsite_conversion.messaging_conversation_started_7d':4}}});}
       for(const [day,rates]of [[d1,{EUR:1,PEN:4,USD:2}],[d2,{EUR:1,PEN:5,USD:1}]] as const)await db.metaFxDay.upsert({where:{day},create:{day,rates,source:'Prueba sintética',sourceUrl:'https://example.test/fx/'+day},update:{rates,source:'Prueba sintética',sourceUrl:'https://example.test/fx/'+day,lastError:null}});
       let r=await owner.call(query);assert.equal(r.status,200);assert.equal(r.body.rows.length,1);assert.equal(r.body.rows[0].currency,'');assert.equal(r.body.rows[0].days[d1].spend,null);assert.equal(r.body.rows[0].days[d1].base,8);assert.equal(r.body.table.aliasColumnName,'Alias');
       assert.equal((await columns({aliasColumnName:'Producto',currency:'PEN'})).status,200);r=await owner.call(query);let row=r.body.rows[0];assert.equal(row.days[d1].spend,120);assert.equal(row.days[d2].spend,150);
       assert.equal((await owner.call('meta-ads/effectiveness','PATCH',{aliasId:alias.id,country:'PE',currency:'PEN',day:d1,sales:3,fixedCost:8,revision:0,rowRevision:row.rowRevision})).status,200);
       const original=await db.metaEffectivenessDay.findFirstOrThrow({where:{row:{aliasId:alias.id,legacy:false},day:d1}});assert.equal(original.fixedCostCurrency,'PEN');
       assert.equal((await columns({currency:'USD'})).status,200);r=await owner.call(query);row=r.body.rows[0];assert.equal(row.currency,'USD');assert.equal(row.days[d1].spend,60);assert.equal(row.days[d2].spend,30);assert.equal(row.days[d1].fixedCost,4);assert.equal(row.days[d1].sales,3);assert.equal(row.days[d1].base,8);assert.equal(row.days[d1].fx[0].date,d1);assert.equal(row.days[d1].sourceSpend.find((x:any)=>x.currency==='PEN').amount,100);
       assert.equal(row.days[d3].spend,null);assert(row.days[d3].fxMissing);assert.deepEqual(r.body.missingFxDays,[d3]);
       assert.equal((await columns({currency:'EUR'})).status,200);r=await owner.call(query);assert.equal(r.body.rows[0].days[d1].spend,30);assert.equal(r.body.rows[0].days[d1].fixedCost,2);
       const unchanged=await db.metaEffectivenessDay.findUniqueOrThrow({where:{rowId_day:{rowId:original.rowId,day:d1}}});assert.equal(Number(unchanged.fixedCost),8);assert.equal(unchanged.fixedCostCurrency,'PEN');
       assert.equal((await columns({country:'',currency:''})).status,200);r=await owner.call(query);row=r.body.rows[0];assert.equal(row.country,'');assert.equal(row.currency,'');assert.equal(row.days[d1].sales,3);assert.equal(row.days[d1].fixedCost,null);assert.equal((await db.metaAdObject.findUniqueOrThrow({where:{id:'9627011'}})).aliasCountry,'PE');
       assert.equal((await columns({country:'PE',currency:'PEN'})).status,200);r=await owner.call(query);assert.equal(r.body.table.aliasColumnName,'Producto');assert.equal(r.body.rows[0].days[d1].fixedCost,8);
       assert.equal((await owner.call('meta-ads/effectiveness/import','POST',{tableId:table.id,rows:[{name:alias.name,country:'CO',currency:''}]})).status,200);assert.equal((await columns({country:'AR'})).status,409);assert((await owner.call(query)).body.rows.some((x:any)=>x.country==='PE'));
       assert.equal((await admin.call('meta-ads/effectiveness/columns','PATCH',{tableId:table.id,currency:'USD'})).status,403);assert.equal((await columns({currency:'XYZ'})).status,400);
       assert((await owner.call('meta-ads/alias-table-options')).body.some((x:any)=>x.id===empty.id));assert(!(await admin.call('meta-ads/alias-table-options')).body.some((x:any)=>x.id===empty.id));const option=(await owner.call('meta-ads/aliases')).body.find((x:any)=>x.id===alias.id);assert.equal(option.tableId,table.id);assert.equal(option.table.name,table.name);
       await db.metaFxDay.upsert({where:{day:d3},create:{day:d3,rates:{},source:'Prueba sin tasa',sourceUrl:'https://example.test/fx',lastError:'No disponible'},update:{rates:{},lastError:'No disponible',fetchedAt:new Date()}});assert.equal((await owner.call('meta-ads/effectiveness/fx','POST',{days:[d1,d3]})).status,200);assert.equal((await admin.call('meta-ads/effectiveness/fx','POST',{days:[d1]})).status,403);
      }finally{await db.metaEffectivenessRow.deleteMany({where:{aliasId:alias.id}});await db.metaAdAccount.deleteMany({where:{connectionId:conn.id}});await db.metaConnection.delete({where:{id:conn.id}});await db.metaAlias.delete({where:{id:alias.id}});await db.metaAliasTable.deleteMany({where:{id:{in:[table.id,empty.id]}}});await db.metaFxDay.deleteMany({where:{day:{in:[d1,d2,d3]}}});}
    });
    await t.test('Meta: varias cuentas, fallo interno diagnosticado y retirada de conexión duplicada sin borrar histórico',async()=>{
      const {discover}=await import('../lib/meta-ads/service');const actor=await db.user.findFirstOrThrow({where:{role:'OWNER'}}),original=globalThis.fetch,originalTransaction=db.$transaction.bind(db),originalWarn=console.warn;
      const logs:string[]=[];console.warn=(value)=>logs.push(String(value));
      const old=(await owner.call('meta-ads/connections','POST',{name:'Anterior de prueba',transport:'API',apiVersion:'v23.0',token:'synthetic-duplicate-old-123456789'})).body;
      const current=(await owner.call('meta-ads/connections','POST',{name:'Actual de prueba',transport:'API',apiVersion:'v26.0',token:'synthetic-duplicate-new-123456789'})).body;
      const rows=Array.from({length:25},(_,i)=>({id:'act_'+(83000+i),name:'Cuenta '+i,currency:'PEN',timezone_name:'America/Lima',account_status:1}));
      globalThis.fetch=async(input,init)=>{const u=new URL(String(input));if(u.hostname!=='graph.facebook.com')return original(input,init);return Response.json({data:rows});};
      try{
        // A real database operation taking longer than Prisma's default timeout must succeed.
        let delayed=false;
        db.$transaction=(async(fn:any,options:any)=>originalTransaction(async(tx:any)=>{if(!delayed&&options?.timeout===30000){delayed=true;await tx.$executeRawUnsafe('SELECT pg_sleep(5.2)');}return fn(tx);},options)) as typeof db.$transaction;
        assert.equal((await discover(actor,current.id)).accounts,25);db.$transaction=originalTransaction;
        assert.equal((await discover(actor,old.id)).accounts,25);assert.equal(await db.metaAdAccount.count({where:{id:{in:rows.map(r=>r.id.slice(4))}}}),25,'Connections share accounts without duplicating history');
        const before=await db.metaConnection.findUniqueOrThrow({where:{id:current.id}});
        assert.equal((await owner.call('meta-ads/connections/'+old.id,'DELETE')).status,200);
        const retired=await db.metaConnection.findUniqueOrThrow({where:{id:old.id}});assert(retired.disconnectedAt);assert.equal(retired.encryptedToken,null);assert.equal(await db.metaAdAccount.count({where:{connectionId:current.id}}),25);assert.equal((await db.metaConnection.findUniqueOrThrow({where:{id:current.id}})).encryptedToken,before.encryptedToken);
        assert.equal((await discover(actor,current.id)).accounts,25);
        db.$transaction=(async(fn:any,options:any)=>{if(options?.timeout===30000)throw Object.assign(new Error('database arguments synthetic-duplicate-new-123456789'),{code:'P2028'});return originalTransaction(fn,options);}) as typeof db.$transaction;
        await assert.rejects(()=>discover(actor,current.id),/consulta mínima id,name fue correcta.*guardado de cuentas.*P2028.*Referencia:/);
        db.$transaction=originalTransaction;
        const failed=await db.metaConnection.findUniqueOrThrow({where:{id:current.id}});assert(failed.lastError?.includes('P2028'));assert(!failed.lastError?.includes('synthetic-duplicate-new'));assert.equal(failed.encryptedToken,before.encryptedToken);assert.equal(failed.verifiedAt,null);
        const audit=await db.auditEvent.findFirstOrThrow({where:{resourceId:current.id,action:'META_CONEXION_ERROR'}});assert.equal((audit.detail as any).phase,'guardado de cuentas');assert.equal((audit.detail as any).minimalVerified,true);assert.equal((audit.detail as any).internalCode,'P2028');assert(!JSON.stringify(audit.detail).includes('database arguments'));assert(!logs.join().includes('synthetic-duplicate-new'));
      }finally{db.$transaction=originalTransaction;globalThis.fetch=original;console.warn=originalWarn;}
    });
    await t.test('Meta: actividad de cuentas autorizadas, ventana local30d sin sumar niveles y estados desconocidos',async()=>{
      const {localDay,shiftDay}=await import('../lib/meta-ads/analytics');const actor=await db.user.findFirstOrThrow({where:{role:'OWNER'}}),today=localDay('America/Lima');const connection=await db.metaConnection.create({data:{ownerId:actor.id,name:'Actividad sintética',transport:'API',verifiedAt:new Date()}});
      for(const id of ['85001','85002','85003','85004','85005'])await db.metaAdAccount.create({data:{id,connectionId:connection.id,name:'Cuenta actividad '+id,currency:'PEN',timezone:'America/Lima',syncedAt:id==='85003'?null:id==='85004'?new Date(shiftDay(today,-1)+'T12:00:00-05:00'):new Date(),syncState:id==='85005'?{phase:2}:{}}});
      for(const [id,level] of [['850011','campaign'],['850012','adset'],['850013','ad']])await db.metaAdObject.create({data:{id,accountId:'85001',level,name:'Objeto '+level,effectiveStatus:'ACTIVE'}});
      for(const [oid,day,spend,scope] of [['850011',today,7,'7d_click,1d_view|impression'],['850011',shiftDay(today,-29),11,'7d_click,1d_view|impression'],['850011',shiftDay(today,-30),20,'7d_click,1d_view|impression'],['850012',today,999,'7d_click,1d_view|impression'],['850013',today,999,'7d_click,1d_view|impression'],['850011',today,999,'other-attribution']])await db.metaAdDaily.create({data:{accountId:'85001',objectId:String(oid),day:String(day),spend:Number(spend),scope:String(scope),actions:{}}});
      const response=await owner.call('meta-ads/accounts');assert.equal(response.status,200,JSON.stringify(response.body));assert.deepEqual(response.body.find((a:any)=>a.id==='85001').coverage,{since:shiftDay(today,-30),until:today});assert.equal(response.body.find((a:any)=>a.id==='85002').coverage,null);assert(Number.isFinite(Date.parse(response.body.find((a:any)=>a.id==='85001').lastDataAt)));assert.equal(response.body.find((a:any)=>a.id==='85003').lastDataAt,null);const found=new Map(response.body.map((a:any)=>[a.id,a.activity]));assert.deepEqual(found.get('85001'),{state:'READY',spend30:18,activeCampaigns:1});assert.deepEqual(found.get('85002'),{state:'READY',spend30:0,activeCampaigns:0});assert.deepEqual(found.get('85003'),{state:'UNSYNCED',spend30:null,activeCampaigns:null});assert.deepEqual(found.get('85004'),{state:'STALE',spend30:null,activeCampaigns:null});assert.deepEqual(found.get('85005'),{state:'SYNCING',spend30:null,activeCampaigns:null});
      await db.metaAccountGrant.create({data:{accountId:'85001',userId:uid}});const visible=(await user.call('meta-ads/accounts')).body;assert(visible.some((a:any)=>a.id==='85001'&&a.activity.spend30===18));assert(!visible.some((a:any)=>a.id==='85002'));await db.metaAccountGrant.deleteMany({where:{accountId:'85001',userId:uid}});assert(!(await user.call('meta-ads/accounts')).body.some((a:any)=>a.id==='85001'));
    });
    await t.test('Marketing OAuth propio: código confidencial, sesión/estado/revisión, cifrado y cuentas reales antes de éxito',async()=>{
      const {NextRequest}=await import('next/server'),{tokenHash}=await import('../lib/auth'),{decryptKey}=await import('../lib/crypto'),{createHmac}=await import('node:crypto');
      const {beginMarketingOAuth,finishMarketingOAuth,configureMarketingApp}=await import('../lib/meta-ads/marketing-oauth');
      const session=await db.session.findUniqueOrThrow({where:{id:tokenHash(owner.cookie.slice('session='.length))}}),actor={id:session.userId,role:'OWNER'};
      await db.rateLimit.deleteMany({where:{key:{in:['meta:discover:'+actor.id,'meta:marketing-oauth:'+actor.id,'meta:app:'+actor.id]}}});
      const appId='99009',secret='synthetic-app-secret-123456',short='synthetic-short-oauth-token-123456789',long='synthetic-long-oauth-token-123456789',accountId='990091';
      const c=(await owner.call('meta-ads/connections','POST',{name:'OAuth propio sintético',transport:'API',apiVersion:'v26.0',token:'synthetic-prior-manual-123456789'})).body;
      await db.metaConnection.update({where:{id:c.id},data:{verifiedAt:new Date()}});await db.metaAdAccount.create({data:{id:accountId,connectionId:c.id,name:'Conservar OAuth',currency:'PEN',timezone:'America/Lima',enabled:true,syncState:{phase:1,pages:63,after:'private-oauth-cursor'},syncError:'Error anterior',schedulerToken:'old-worker',nextSyncAt:new Date()}});
      const before=await db.metaConnection.findUniqueOrThrow({where:{id:c.id}}),objects=await db.metaAdObject.count();
      for(const client of [user,admin,observer,anonymous]){assert([401,403].includes((await client.call('meta-ads/marketing-oauth-config')).status));assert([401,403].includes((await client.call('meta-ads/connections/'+c.id+'/app','PATCH',{appId,appSecret:secret})).status));}
      assert.equal((await owner.call('meta-ads/connections/'+c.id+'/app','PATCH',{appId,appSecret:secret})).status,200);
      let configured=await db.metaConnection.findUniqueOrThrow({where:{id:c.id}});assert.equal(configured.encryptedToken,before.encryptedToken);assert.equal(decryptKey(configured.encryptedAppSecret!,'meta-app:'+c.id),secret);assert(!configured.encryptedAppSecret!.includes(secret));assert.equal(configured.verifiedAt,null);assert.equal((await db.metaAdAccount.findUniqueOrThrow({where:{id:accountId}})).syncError,null);
      const config=await owner.call('meta-ads/marketing-oauth-config');assert.equal(config.body.callbackUrl,root+'/api/meta/marketing/oauth/callback');const exposed=await owner.call('meta-ads/connections');assert(!JSON.stringify(exposed.body).includes(secret));assert(!JSON.stringify(exposed.body).includes(configured.encryptedAppSecret!));
      const begin=async(rawCookie=owner.cookie,manage=false)=>{const r=await beginMarketingOAuth(new NextRequest(root+'/api/meta-ads/connections/'+c.id+'/oauth',{headers:{Cookie:rawCookie,Origin:root}}),actor,c.id,manage);const auth=new URL((await r.json()).url);assert.equal(auth.hostname,'www.facebook.com');assert.equal(auth.pathname,'/v26.0/dialog/oauth');assert.equal(auth.searchParams.get('client_id'),appId);assert.equal(auth.searchParams.get('redirect_uri'),config.body.callbackUrl);assert.equal(auth.searchParams.get('response_type'),'code');assert(!auth.href.includes(secret));assert.equal(!!auth.searchParams.get('scope')?.includes('ads_management'),manage);return {auth,url:config.body.callbackUrl+'?'+new URLSearchParams({state:auth.searchParams.get('state')!,code:'synthetic-code'}),cookie:'meta_marketing_oauth='+r.cookies.get('meta_marketing_oauth')!.value};};
      const finish=(b:{url:string;cookie:string},url=b.url,cookie=b.cookie)=>finishMarketingOAuth(new NextRequest(url,{headers:{Cookie:cookie}}));
      const original=globalThis.fetch;let mode='ok',onExchange:(()=>Promise<void>)|undefined,requests=0;
      globalThis.fetch=async(input,init)=>{const u=new URL(String(input));if(u.hostname!=='graph.facebook.com')return original(input,init);requests++;
        if(u.pathname.endsWith('/oauth/access_token')){assert.equal(init?.method,'POST');assert(!u.search);const body=new URLSearchParams(String(init?.body));assert.equal(body.get('client_secret'),secret);assert.equal(body.get('client_id'),appId);
          if(mode==='reflected')return Response.json({error:{code:100,message:secret+' synthetic-code '+long}},{status:400});
          if(body.get('grant_type')==='fb_exchange_token'){assert.equal(body.get('fb_exchange_token'),short);return Response.json({access_token:long,token_type:'bearer',expires_in:mode==='expiry'?0:5184000});}
          assert.equal(body.get('redirect_uri'),config.body.callbackUrl);assert.equal(body.get('code'),'synthetic-code');if(onExchange)await onExchange();return Response.json({access_token:short,token_type:'bearer',expires_in:3600});
        }
        if(mode==='manual'){assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-replacement-system-token');assert(!u.searchParams.has('appsecret_proof'));return Response.json({data:[{id:'act_'+accountId,name:'Cuenta manual'}]});}
        assert(!init?.method||init.method==='GET');assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer '+long);assert(!u.href.includes(long));assert.equal(u.searchParams.get('appsecret_proof'),createHmac('sha256',secret).update(long).digest('hex'));
        if(u.pathname.endsWith('/me'))return Response.json({id:'990090'});
        if(u.pathname.endsWith('/me/permissions'))return Response.json({data:[{permission:mode==='missing'?'public_profile':'ads_read',status:'granted'}]});
        assert(u.pathname.endsWith('/me/adaccounts'));return Response.json({data:[{id:'act_'+accountId,name:'Cuenta OAuth',currency:'PEN',timezone_name:'America/Lima'}]});};
      try{
        const good=await begin();assert.equal(good.auth.searchParams.get('scope'),'ads_read');const result=await finish(good);assert.equal(result.status,303);assert.equal(result.headers.get('location'),root+'/?view=metaads&metaTab=connections');assert.equal(result.headers.get('referrer-policy'),'no-referrer');assert.equal(result.headers.get('cache-control'),'no-store');
        const saved=await db.metaConnection.findUniqueOrThrow({where:{id:c.id}});assert(saved.verifiedAt);assert.equal(saved.authMethod,'OAUTH');assert.equal(saved.metaUserId,'990090');assert(saved.tokenExpiresAt!>new Date(Date.now()+59*86400000));assert.equal(decryptKey(saved.encryptedToken!,'meta:'+c.id),long);assert.equal(saved.encryptedAppSecret,configured.encryptedAppSecret);assert.equal(await db.metaAdObject.count(),objects);const a=await db.metaAdAccount.findUniqueOrThrow({where:{id:accountId}});assert.equal((a.syncState as any).pages,63);assert.equal((a.syncState as any).after,'private-oauth-cursor');assert(requests>=7);assert.equal((await finish(good)).status,400);
        const cancel=await begin(),cancelled=await finish(cancel,cancel.url.replace('code=synthetic-code','error=access_denied&error_description=ignore'));assert.equal(cancelled.status,400);assert.equal((await db.metaConnection.findUniqueOrThrow({where:{id:c.id}})).encryptedToken,saved.encryptedToken);
        const wrong=await begin(),count=requests;assert.equal((await finish(wrong,wrong.url,'meta_marketing_oauth=wrong')).status,400);assert.equal(requests,count);
        const manageDenied=await begin(owner.cookie,true);assert.equal((await finish(manageDenied)).status,403);assert.equal((await db.metaConnection.findUniqueOrThrow({where:{id:c.id}})).encryptedToken,saved.encryptedToken);
        mode='missing';const missing=await begin();assert.equal((await finish(missing)).status,403);assert.equal((await db.metaConnection.findUniqueOrThrow({where:{id:c.id}})).encryptedToken,saved.encryptedToken);
        mode='expiry';const expiry=await begin();assert.equal((await finish(expiry)).status,502);mode='reflected';const reflected=await begin(),failed=await finish(reflected),html=await failed.text();assert.equal(failed.status,502);for(const value of [secret,long,'synthetic-code'])assert(!html.includes(value));
        mode='ok';const raw='synthetic-own-oauth-session-'+randomUUID();await db.session.create({data:{id:tokenHash(raw),userId:actor.id,expiresAt:new Date(Date.now()+60000)}});const revoked=await begin('session='+raw);onExchange=async()=>{await db.session.delete({where:{id:tokenHash(raw)}});};assert.equal((await finish(revoked)).status,401);onExchange=undefined;
        const changed=await begin();onExchange=async()=>{await db.metaConnection.update({where:{id:c.id},data:{revision:{increment:1}}});};assert.equal((await finish(changed)).status,409);onExchange=undefined;assert.equal((await db.metaConnection.findUniqueOrThrow({where:{id:c.id}})).encryptedToken,saved.encryptedToken);
        await configureMarketingApp(actor,c.id,{appId,appSecret:secret,loginConfigId:'99009123'});const business=await begin();assert.equal(business.auth.searchParams.get('config_id'),'99009123');assert.equal(business.auth.searchParams.get('scope'),null);await db.metaOAuthState.update({where:{id:tokenHash(business.auth.searchParams.get('state')!)},data:{expiresAt:new Date(Date.now()-1000)}});const expiredRequests=requests;assert.equal((await finish(business)).status,400);assert.equal(requests,expiredRequests);
        // Changing editor is inert; saving a manual token explicitly replaces OAuth, not both.
        const {saveToken,reader}=await import('../lib/meta-ads/service');const beforeManual=await db.metaConnection.findUniqueOrThrow({where:{id:c.id}});await saveToken(c.id,'synthetic-replacement-system-token');const manual=await db.metaConnection.findUniqueOrThrow({where:{id:c.id}});assert.equal(manual.authMethod,'MANUAL');assert.equal(manual.metaUserId,null);assert.equal(manual.tokenExpiresAt,null);assert.equal(manual.encryptedAppSecret,beforeManual.encryptedAppSecret);assert.equal(decryptKey(manual.encryptedToken!,'meta:'+c.id),'synthetic-replacement-system-token');await assert.rejects(()=>reader(c.id),/verific/);mode='manual';await(await reader(c.id,true)).reader.get('accounts');const kept=await db.metaAdAccount.findUniqueOrThrow({where:{id:accountId}});assert.equal((kept.syncState as any).after,'private-oauth-cursor');assert.equal((kept.syncState as any).pages,63);
      }finally{globalThis.fetch=original;await db.metaAdAccount.update({where:{id:accountId},data:{enabled:false,nextSyncAt:null,schedulerToken:null}});await db.metaOAuthState.deleteMany({where:{connectionId:c.id,purpose:'MARKETING_API'}});}
    });
    await t.test('Meta: token renovado invalida respuestas tardías y usa credencial nueva sin perder cursor',async()=>{
      const {saveToken,syncStep,queueSync,discover}=await import('../lib/meta-ads/service');const actor=await db.user.findFirstOrThrow({where:{role:'OWNER'}});
      const oldToken='synthetic-expired-123456789',newToken='synthetic-replacement-987654321';
      const conn=(await owner.call('meta-ads/connections','POST',{name:'Renovación sintética',transport:'API',apiVersion:'v26.0',token:oldToken})).body;await db.metaConnection.update({where:{id:conn.id},data:{verifiedAt:new Date()}});
      const id='86008',state={phase:1,pages:63,processed:0,after:'private-retained-cursor',started:new Date().toISOString()};
      await db.metaAdAccount.create({data:{id,connectionId:conn.id,name:'Token renovado',currency:'PEN',timezone:'America/Lima',enabled:true,syncState:state,syncError:'Error anterior 190/463',nextSyncAt:new Date(),schedulerToken:'previous-synthetic-scheduler',schedulerRunId:'previous-synthetic-run'}});
      await db.metaAdObject.create({data:{id:'86008001',accountId:id,level:'campaign',name:'Conservar'}});
      const original=globalThis.fetch;let renewed=false,newRequests=0;
      globalThis.fetch=async(input,init)=>{const u=new URL(String(input));if(u.hostname!=='graph.facebook.com')return original(input,init);const auth=new Headers(init?.headers).get('Authorization');
        if(auth==='Bearer '+oldToken){assert(!renewed);renewed=true;await saveToken(conn.id,newToken);return Response.json({error:{code:190,error_subcode:463,message:'Expired '+oldToken}},{status:401});}
        assert.equal(auth,'Bearer '+newToken);newRequests++;if(u.pathname.endsWith('/me/adaccounts'))return Response.json({data:[{id:'act_'+id,name:'Token renovado',currency:'PEN',timezone_name:'America/Lima'}]});
        assert(u.pathname.endsWith('/act_'+id+'/adsets'));assert.equal(u.searchParams.get('after'),state.after);return Response.json({data:[]});};
      try{
        assert.equal(await syncStep(id),false);let a=await db.metaAdAccount.findUniqueOrThrow({where:{id}}),c=await db.metaConnection.findUniqueOrThrow({where:{id:conn.id}});
        assert.equal(a.syncError,null,'Late expired-token response must not replace the new credential state');assert.equal(a.schedulerToken,null);assert.equal(a.syncToken,null);assert.equal(a.nextSyncAt,null);assert.equal(c.verifiedAt,null);assert.equal((a.syncState as any).after,state.after);assert.equal((a.syncState as any).pages,63);
        await assert.rejects(()=>queueSync(actor,id),/verifica/);assert.equal((await import('../lib/meta-ads/schedule').then(m=>m.startMetaSchedule(id))).scheduled,false);assert.equal(await db.metaAdObject.count({where:{accountId:id}}),1);
        await discover(actor,conn.id);assert.equal((await queueSync(actor,id)).resumed,true);assert(await syncStep(id));a=await db.metaAdAccount.findUniqueOrThrow({where:{id}});c=await db.metaConnection.findUniqueOrThrow({where:{id:conn.id}});assert.equal((a.syncState as any).pages,64);assert.equal((a.syncState as any).phase,2);assert.equal(a.syncError,null);assert(newRequests>1);
        const rows=(await owner.call('meta-ads/accounts')).body,visible=rows.find((r:any)=>r.id===id);assert.equal(visible.connection.name,'Renovación sintética');assert.equal(visible.connection.revision,c.revision);assert(visible.connection.verifiedAt);assert.equal(visible.progress.credentialRevision,c.revision);assert(visible.progress.attemptAt);assert(!JSON.stringify(visible).includes(newToken));assert(!JSON.stringify(visible).includes(oldToken));assert(!JSON.stringify(visible).includes(state.after));
      }finally{globalThis.fetch=original;await db.metaAdAccount.update({where:{id},data:{enabled:false,nextSyncAt:null,schedulerToken:null,schedulerRunId:null}});}
    });
    await t.test('Meta: continuar conserva cursor/histórico, recupera ejecutor detenido y respeta lease y permisos',async()=>{
      const {queueSync,syncStep}=await import('../lib/meta-ads/service');
      const actor=await db.user.findFirstOrThrow({where:{role:'OWNER'}});
      const conn=(await owner.call('meta-ads/connections','POST',{name:'Continuación sintética',transport:'API',token:'synthetic-resume-123456789'})).body;
      await db.metaConnection.update({where:{id:conn.id},data:{verifiedAt:new Date()}});
      const id='86007',started=new Date(Date.now()-600000).toISOString();
      const state={phase:1,after:'private-saved-cursor',pages:63,processed:12,started,updatedAt:started,mode:'history',until:'2026-10-21'};
      const syncedAt=new Date('2026-10-01T12:00:00Z');
      await db.metaAdAccount.create({data:{id,connectionId:conn.id,name:'Continuar prueba',currency:'PEN',timezone:'America/Lima',enabled:true,syncedAt,syncState:state,syncError:'Error anterior',schedulerToken:'old-synthetic-schedule',schedulerRunId:'old-synthetic-run',nextSyncAt:new Date(Date.now()+1800000)}});
      await db.metaAdObject.create({data:{id:'8600701',accountId:id,level:'campaign',name:'Conservada'}});
      await assert.rejects(()=>queueSync({id:uid,role:'USER'},id),/no disponible|permiso/);
      const queued=await queueSync(actor,id);assert.equal(queued.resumed,true);
      let current=await db.metaAdAccount.findUniqueOrThrow({where:{id}});
      assert.deepEqual(current.syncState,state);assert.equal(current.syncedAt?.toISOString(),syncedAt.toISOString());assert.equal(current.schedulerToken,null);assert.equal(current.schedulerRunId,null);assert.equal(current.syncError,null);
      const original=globalThis.fetch;
      globalThis.fetch=async(input,init)=>{const u=new URL(String(input));if(u.hostname!=='graph.facebook.com')return original(input,init);assert(u.pathname.endsWith('/act_86007/adsets'));assert.equal(u.searchParams.get('after'),'private-saved-cursor');return Response.json({data:[]});};
      try{assert(await syncStep(id));}finally{globalThis.fetch=original;}
      current=await db.metaAdAccount.findUniqueOrThrow({where:{id}});assert.equal((current.syncState as any).phase,2);assert.equal((current.syncState as any).pages,64);assert.equal(await db.metaAdObject.count({where:{accountId:id}}),1);
      await db.metaAdAccount.update({where:{id},data:{syncToken:'active-synthetic-lease',syncLeaseAt:new Date(),schedulerToken:'active-synthetic-schedule',schedulerRunId:'active-synthetic-run',syncError:'No borrar durante lease'}});
      await assert.rejects(()=>queueSync(actor,id),/ya está procesando/);
      current=await db.metaAdAccount.findUniqueOrThrow({where:{id}});assert.equal(current.schedulerToken,'active-synthetic-schedule');assert.equal(current.syncError,'No borrar durante lease');assert.equal((current.syncState as any).phase,2);
      await db.metaAdAccount.update({where:{id},data:{syncToken:null,syncLeaseAt:null,syncError:null,syncState:state}});
      assert.equal((await queueSync(actor,id)).resumed,true);current=await db.metaAdAccount.findUniqueOrThrow({where:{id}});assert.equal(current.schedulerToken,null);assert.deepEqual(current.syncState,state);
      await db.metaAdAccount.update({where:{id},data:{enabled:false,schedulerToken:null,schedulerRunId:null,nextSyncAt:null}});
    });
    await t.test('Meta: páginas masivas, progreso autorizado y conservación ante respuesta de otra cuenta',async()=>{
      const {syncStep}=await import('../lib/meta-ads/service'),{localDay}=await import('../lib/meta-ads/analytics');const actor=await db.user.findFirstOrThrow({where:{role:'OWNER'}}),conn=(await owner.call('meta-ads/connections','POST',{name:'Importación masiva sintética',transport:'API',token:'synthetic-bulk-sync-123456789'})).body;await db.metaConnection.update({where:{id:conn.id},data:{verifiedAt:new Date()}});const id='86005',today=localDay('America/Lima');await db.metaAdAccount.create({data:{id,connectionId:conn.id,name:'Masiva',currency:'PEN',timezone:'America/Lima',enabled:true,nextSyncAt:new Date(),syncState:{phase:5,mode:'recent',since:today,until:today}}});
      const original=globalThis.fetch;let page=0;const rows=Array.from({length:200},(_,i)=>({account_id:id,ad_id:id+String(i).padStart(4,'0'),ad_name:'Anuncio '+i,date_start:today,date_stop:today,spend:'1',impressions:'10',actions:[{action_type:'onsite_conversion.messaging_conversation_started_7d',value:'1'}]}));globalThis.fetch=async(input,init)=>{const u=new URL(String(input));if(u.hostname!=='graph.facebook.com')return original(input,init);assert(u.pathname.endsWith('/act_86005/insights'));return Response.json(page++===0?{data:rows,paging:{next:'ignored',cursors:{after:'private-next-page'}}}:{data:[]});};
      try{assert(await syncStep(id));let current=await db.metaAdAccount.findUniqueOrThrow({where:{id}});assert.equal(current.syncedAt,null);assert.equal((current.syncState as any).phase,5);const partial=await owner.call('meta-ads/sync-status?accounts='+id);assert.equal(partial.status,200);assert.equal(partial.body[0].progress.status,'running');assert.equal(partial.body[0].progress.processed,200);assert(!JSON.stringify(partial.body).includes('private-next-page'));assert(!JSON.stringify(partial.body).includes('syncToken'));assert.equal((await user.call('meta-ads/sync-status?accounts='+id)).status,404);
      assert(await syncStep(id));current=await db.metaAdAccount.findUniqueOrThrow({where:{id}});assert(current.syncedAt);assert.equal((current.syncState as any).lastRun.pages,2);assert.equal((await owner.call('meta-ads/sync-status?accounts='+id)).body[0].progress.phase,6);assert.equal(await db.metaAdDaily.count({where:{accountId:id}}),200);assert.equal(await db.metaAdObject.count({where:{accountId:id}}),200);
      await db.metaAdAccount.create({data:{id:'86006',connectionId:conn.id,name:'Ajena',currency:'USD',timezone:'America/Lima'}});await db.metaAdObject.create({data:{id:'860060001',accountId:'86006',level:'ad',name:'Privado'}});await db.metaAdAccount.update({where:{id},data:{nextSyncAt:new Date(),syncState:{phase:5,mode:'recent',since:today,until:today}}});globalThis.fetch=async(input,init)=>new URL(String(input)).hostname==='graph.facebook.com'?Response.json({data:[{...rows[0],ad_id:'860060001'}]}):original(input,init);assert.equal(await syncStep(id),false);assert.equal(await db.metaAdDaily.count({where:{accountId:id}}),200);assert((await db.metaAdAccount.findUniqueOrThrow({where:{id}})).syncedAt);assert.equal((await owner.call('meta-ads/sync-status?accounts='+id)).body[0].progress.status,'error');
      }finally{globalThis.fetch=original;await db.metaAdAccount.update({where:{id},data:{enabled:false,nextSyncAt:null}});}
    });
    await t.test('Meta MCP OAuth: autorización vinculada, verificación real del protocolo y cuentas antes de éxito',async()=>{
      const {NextRequest}=await import('next/server');const {beginOAuth,finishOAuth}=await import('../lib/meta-ads/oauth');const {tokenHash}=await import('../lib/auth');
      const actor=await db.user.findFirstOrThrow({where:{role:'OWNER'}}),original=globalThis.fetch;
      let challenge='',denyToken=false,registrationDenied=false,metadataIssuer='https://mcp.facebook.com/ads',cimd=false,onExchange:(()=>Promise<void>)|undefined;const methods:string[]=[];
      const connection=()=>db.metaConnection.create({data:{ownerId:actor.id,name:'OAuth sintético',transport:'MCP'}});
      globalThis.fetch=async(input,init)=>{
        const u=new URL(String(input));if(['localhost','127.0.0.1'].includes(u.hostname))return original(input,init);
        assert(['mcp.facebook.com','www.facebook.com','graph.facebook.com'].includes(u.hostname));
        if(u.pathname.includes('oauth-protected-resource'))return Response.json({resource:'https://mcp.facebook.com/ads',authorization_servers:['https://mcp.facebook.com/ads'],scopes_supported:['ads_read','ads_management','ads_mcp_management']});
        if(u.pathname.includes('oauth-authorization-server'))return Response.json({issuer:metadataIssuer,authorization_endpoint:'https://www.facebook.com/v26.0/dialog/oauth',token_endpoint:'https://graph.facebook.com/v26.0/oauth/access_token',registration_endpoint:'https://mcp.facebook.com/register',code_challenge_methods_supported:['S256'],client_id_metadata_document_supported:cimd});
        if(u.pathname==='/register'){if(registrationDenied)return Response.json({error:'invalid_client_metadata'},{status:400});const data=JSON.parse(String(init?.body));assert.deepEqual(data.redirect_uris,[root+'/api/meta/oauth/callback']);return Response.json({client_id:'test-client',token_endpoint_auth_method:'none',redirect_uris:data.redirect_uris});}
        if(u.pathname.endsWith('/oauth/access_token')){const data=new URLSearchParams(String(init?.body));const {createHash}=await import('node:crypto');assert.equal(createHash('sha256').update(data.get('code_verifier')!).digest('base64url'),challenge);if(onExchange)await onExchange();return Response.json({access_token:denyToken?'invalid-synthetic-token':'oauth-synthetic-secret-123456789',token_type:'Bearer',expires_in:3600});}
        assert.equal(u.pathname,'/ads');if(denyToken)return new Response(null,{status:401});const body=JSON.parse(String(init?.body));methods.push(body.method);
        if(body.method==='notifications/initialized')return new Response(null,{status:202});
        const result=body.method==='initialize'?{protocolVersion:'2025-03-26'}:body.method==='tools/list'?{tools:[{name:'get_ad_accounts',inputSchema:{properties:{}}},{name:'create_campaign',annotations:{destructiveHint:true},inputSchema:{properties:{}}}]}:body.method==='tools/call'?{structuredContent:{data:[{id:'81001',name:'Cuenta OAuth sintética',currency:'PEN',timezone_name:'America/Lima'}]}}:{};
        if(body.method==='tools/call')assert.equal(body.params.name,'get_ad_accounts');assert(['initialize','tools/list','tools/call'].includes(body.method));return Response.json({jsonrpc:'2.0',id:body.id,result});
      };
      const start=async(id:string,rawCookie=owner.cookie)=>{const result=await beginOAuth(new NextRequest(root+'/api/meta-ads/connections/'+id+'/oauth',{headers:{Cookie:rawCookie}}),actor,id);const url=new URL((await result.json()).url);challenge=url.searchParams.get('code_challenge')!;assert.equal(url.hostname,'www.facebook.com');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert(!url.searchParams.get('scope')!.split(' ').includes('ads_management'));return {url:root+'/api/meta/oauth/callback?'+new URLSearchParams({state:url.searchParams.get('state')!,code:'synthetic-code'}),cookie:'meta_oauth='+result.cookies.get('meta_oauth')!.value,authorization:url};};
      try{
        const conn=await connection(),auth=await start(conn.id);const denied=await finishOAuth(new NextRequest(auth.url,{headers:{Cookie:'meta_oauth=wrong'}}));assert.equal(denied.status,400);
        const result=await finishOAuth(new NextRequest(auth.url,{headers:{Cookie:auth.cookie}}));assert.equal(result.status,303);assert(result.headers.get('location')!.endsWith('/?view=metaads&metaTab=connections'));assert(!(await result.text()).includes('oauth-synthetic-secret'));assert(result.headers.get('set-cookie')!.includes('Path=/api/meta/oauth/callback'));
        const saved=await db.metaConnection.findUniqueOrThrow({where:{id:conn.id}});assert(saved.encryptedToken&&!saved.encryptedToken.includes('oauth-synthetic-secret'));assert(saved.verifiedAt);assert.equal((saved.tools as any[]).length,1);assert.equal(await db.metaAccountSource.count({where:{connectionId:conn.id}}),1);assert.deepEqual(methods,['initialize','notifications/initialized','tools/list','tools/call']);assert.equal((await finishOAuth(new NextRequest(auth.url,{headers:{Cookie:auth.cookie}}))).status,400);
        denyToken=true;await assert.rejects(()=>import('../lib/meta-ads/service').then(m=>m.discover(actor,conn.id)));assert.equal((await db.metaConnection.findUniqueOrThrow({where:{id:conn.id}})).verifiedAt,null,'Rejected/expired access must not retain a verified badge');denyToken=false;
        const doc=await anonymous.call('meta/oauth/client');assert.equal(doc.status,200);assert.equal(doc.body.client_id,root+'/api/meta/oauth/client');assert(!JSON.stringify(doc.body).includes('tokenMask'));
        const bad=await connection();denyToken=true;const badAuth=await start(bad.id);assert.equal((await finishOAuth(new NextRequest(badAuth.url,{headers:{Cookie:badAuth.cookie}}))).status,502);assert.equal((await db.metaConnection.findUniqueOrThrow({where:{id:bad.id}})).verifiedAt,null);assert.equal(await db.metaAccountSource.count({where:{connectionId:bad.id}}),0);denyToken=false;
        metadataIssuer='https://www.facebook.com';await assert.rejects(()=>start(bad.id),/emisor OAuth distinto/);metadataIssuer='https://mcp.facebook.com/ads';registrationDenied=true;await assert.rejects(()=>start(bad.id),/registro de este cliente/);registrationDenied=false;
        cimd=true;const publicAuth=await start(bad.id);assert.equal(publicAuth.authorization.searchParams.get('client_id'),root+'/api/meta/oauth/client');cimd=false;
        // A new secret/revision during token exchange must never be overwritten or verified.
        const changing=await connection(),changedAuth=await start(changing.id);onExchange=async()=>{await db.metaConnection.update({where:{id:changing.id},data:{revision:{increment:1}}});};assert.equal((await finishOAuth(new NextRequest(changedAuth.url,{headers:{Cookie:changedAuth.cookie}}))).status,409);assert.equal((await db.metaConnection.findUniqueOrThrow({where:{id:changing.id}})).encryptedToken,null);onExchange=undefined;
        // Revocation of the initiating session during exchange blocks storage, even if the code is valid.
        const raw='synthetic-oauth-session-'+randomUUID();await db.session.create({data:{id:tokenHash(raw),userId:actor.id,expiresAt:new Date(Date.now()+60000)}});const revoked=await connection(),revokedAuth=await start(revoked.id,'session='+raw);onExchange=async()=>{await db.session.delete({where:{id:tokenHash(raw)}});};assert.equal((await finishOAuth(new NextRequest(revokedAuth.url,{headers:{Cookie:revokedAuth.cookie}}))).status,401);assert.equal((await db.metaConnection.findUniqueOrThrow({where:{id:revoked.id}})).encryptedToken,null);
      }finally{globalThis.fetch=original;}
    });
    await t.test('Meta resumen: ámbito completo antes de paginar, seleccionados, periodo y promedio ponderado sin duplicar niveles', async()=>{
      const {dashboard}=await import('../lib/meta-ads/dashboard');
      const {localDay,shiftDay}=await import('../lib/meta-ads/analytics');
      const actor=await db.user.findFirstOrThrow({where:{role:'OWNER'}}),today=localDay('America/Lima'),scope='7d_click,1d_view|impression';
      const conn=await db.metaConnection.create({data:{ownerId:actor.id,name:'Resumen sintético',transport:'API',verifiedAt:new Date()}});
      const account='84001',usd='84002';
      for(const [id,currency] of [[account,'PEN'],[usd,'USD']]) await db.metaAdAccount.create({data:{id,connectionId:conn.id,name:'Resumen '+currency,currency,timezone:'America/Lima',syncedAt:new Date()}});
      try {
        for(let i=0;i<26;i++) {
          const id='84001'+String(i).padStart(3,'0');
          await db.metaAdObject.create({data:{id,accountId:account,level:'campaign',name:'Campaña '+i,status:i%2?'PAUSED':'ACTIVE',effectiveStatus:i%2?'PAUSED':'ACTIVE'}});
          await db.metaAdDaily.create({data:{accountId:account,objectId:id,day:today,scope,spend:i===0?20:i===1?10:2,actions:{'onsite_conversion.messaging_conversation_started_7d':i===0?10:1,'onsite_conversion.messaging_conversation_replied_7d':999}}});
        }
        await db.metaAdDaily.create({data:{accountId:account,objectId:'84001000',day:shiftDay(today,-1),scope,spend:8,actions:{'onsite_conversion.messaging_conversation_started_7d':4}}});
        await db.metaAdDaily.create({data:{accountId:account,objectId:'84001000',day:today,scope:'other',spend:999,actions:{'onsite_conversion.messaging_conversation_started_7d':999}}});
        for(const id of ['84001888','84001889']) {await db.metaAdObject.create({data:{id,accountId:account,level:'adset',campaignId:'84001000',name:'Hijo',status:'ACTIVE'}});await db.metaAdDaily.create({data:{accountId:account,objectId:id,day:today,scope,spend:500,actions:{'onsite_conversion.messaging_conversation_started_7d':100}}});}
        await db.metaAdObject.create({data:{id:'84002000',accountId:usd,level:'campaign',name:'USD',status:'ACTIVE'}});
        await db.metaAdDaily.create({data:{accountId:usd,objectId:'84002000',day:today,scope,spend:9,actions:{'onsite_conversion.messaging_conversation_started_7d':3}}});
        const read=(extra:Record<string,string>={})=>dashboard(actor,new URLSearchParams({accounts:account,level:'campaign',summary:'1',analysisPeriod:'today',limit:'10',...extra}));
        const all=await read();assert.equal(all.items.length,10);assert.equal(all.summary!.objects,26);assert.equal(all.summary!.currencies[0].spend,78);assert.equal(all.summary!.currencies[0].conversations,35);assert.equal(all.summary!.currencies[0].average,78/35);assert.deepEqual(all.summary!.campaigns,{active:13,inactive:13,unknown:0});assert.equal(all.summary!.partial,false);
        const selected=await read({summarySelection:'84001000,84001001',page:'2'});assert.equal(selected.summary!.objects,2);assert.equal(selected.summary!.currencies[0].spend,30);assert.equal(selected.summary!.currencies[0].conversations,11);assert.equal(selected.items.length,10);
        const week=await read({analysisPeriod:'7'});assert.equal(week.summary!.currencies[0].spend,86);assert.equal(week.summary!.currencies[0].conversations,39);
        const custom=await read({analysisPeriod:'custom',since:shiftDay(today,-1),until:shiftDay(today,-1)});assert.equal(custom.summary!.currencies[0].spend,8);assert.equal(custom.summary!.currencies[0].conversations,4);assert.equal(custom.summary!.partial,true);
        const children=await read({level:'adset'});assert.equal(children.summary!.currencies[0].spend,1000);assert.equal(children.summary!.campaigns.active,1);
        const mixed=await read({accounts:account+','+usd});assert.equal(mixed.summary!.currencies.length,2);assert.equal(mixed.summary!.currencies.find(g=>g.currency==='USD')!.average,3);
        await db.metaAdTotal.create({data:{accountId:account,objectId:'84001000',scope,since:shiftDay(today,-100),until:today,spend:1000,actions:{'onsite_conversion.messaging_conversation_started_7d':500}}});
        const lifetime=await read({analysisPeriod:'lifetime'});assert.equal(lifetime.summary!.currencies[0].spend,1000);assert.equal(lifetime.summary!.currencies[0].average,2);assert.equal(lifetime.summary!.partial,true);
        await assert.rejects(()=>read({summarySelection:'84002000'}),/no autorizada/);await assert.rejects(()=>read({analysisPeriod:'custom'}),/fechas/);
        assert.equal((await user.call('meta-ads/dashboard?accounts='+account+'&level=campaign&summary=1')).status,404);
        const api=await owner.call('meta-ads/dashboard?accounts='+account+'&level=campaign&summary=1&analysisPeriod=today');assert.equal(api.status,200);assert.equal(api.body.summary.currencies[0].spend,78);
      } finally {await db.metaAdAccount.deleteMany({where:{connectionId:conn.id}});await db.metaConnection.delete({where:{id:conn.id}});}
    });
    await t.test('Meta estados múltiples: intersección autorizada y rechazo de activados/desactivados incompatibles',async()=>{
      const {localDay}=await import('../lib/meta-ads/analytics');const actor=await db.user.findFirstOrThrow({where:{role:'OWNER'}}),today=localDay('America/Lima');
      const conn=await db.metaConnection.create({data:{ownerId:actor.id,name:'Filtros múltiples sintéticos',transport:'API'}}),account='8399910';
      try{
        await db.metaAdAccount.create({data:{id:account,connectionId:conn.id,name:'Estados',currency:'PEN',timezone:'America/Lima',syncedAt:new Date()}});
        for(const [level,prefix] of [['ad','83999101'],['adset','83999102'],['campaign','83999103']] as const){
          const data=[['ACTIVE','ACTIVE',1],['ACTIVE',level==='campaign'?'WITH_ISSUES':'CAMPAIGN_PAUSED',1],['PAUSED','PAUSED',1],['ACTIVE','ACTIVE',0],['ACTIVE','DISAPPROVED',1]] as const;
          for(const [i,[status,effective,delivery]] of data.entries()){const id=prefix+(i+1);await db.metaAdObject.create({data:{id,accountId:account,level,name:'Estado '+id,status,effectiveStatus:effective}});if(delivery)await db.metaAdDaily.create({data:{accountId:account,objectId:id,day:today,scope:'7d_click,1d_view|impression',spend:1,impressions:10,actions:{'onsite_conversion.messaging_conversation_started_7d':1}}});}
          const read=(state:string)=>owner.call('meta-ads/dashboard?'+new URLSearchParams({accounts:account,level,state,summary:'1',analysisPeriod:'today'}));
          for(const [state,suffixes] of [['all',[1,2,3,4,5]],['active',[1,2,4,5]],['active,delivery',[1,2,5]],['effective,delivery',[1]],['active,effective',[1,4]],['paused,delivery',level==='campaign'?[3]:[2,3]],['active,delivery,effective',[1]]] as const){const r=await read(state);assert.equal(r.status,200,JSON.stringify(r.body));assert.deepEqual(r.body.items.map((o:any)=>o.id).sort(),suffixes.map(n=>prefix+n).sort());assert(r.body.items.every((o:any)=>o.level===level));assert.equal(r.body.summary.objects,suffixes.length);}
          for(const state of ['active,paused','active,unknown','all,active'])assert.equal((await read(state)).status,400);
        }
        assert.equal((await user.call('meta-ads/dashboard?'+new URLSearchParams({accounts:account,level:'ad',state:'active,delivery'}))).status,404);
        assert.equal(await db.metaAdObject.count({where:{accountId:account,status:'ACTIVE'}}),12);
      }finally{await db.metaAdAccount.deleteMany({where:{connectionId:conn.id}});await db.metaConnection.delete({where:{id:conn.id}});}
    });
    await t.test('Efectividad: ajustes N.A./0 masivos, originales conservados, conflicto atómico y países separados',async()=>{
      const table=(await owner.call('meta-ads/alias-tables','POST',{name:'Controles '+tag})).body;
      const alias=(await owner.call('meta-ads/aliases','POST',{name:'Control valores '+tag,tableId:table.id})).body;
      const day='2026-10-20',until='2026-10-21',root='meta-ads/effectiveness?'+new URLSearchParams({tableId:table.id,since:day,until});
      const read=()=>owner.call(root),pair=(v:any,p='PE')=>v.body.rows.find((r:any)=>r.aliasId===alias.id&&r.country===p);
      const fill=(r:any,value:any,metrics=['sales','base','spend','fixedCost'],days?:string[])=>({tableId:table.id,since:day,until,metrics,value,targets:[{aliasId:r.aliasId,country:r.country,token:r.token}],...(days?{days}:{})});
      try{
        assert.equal((await owner.call('meta-ads/effectiveness/import','POST',{tableId:table.id,rows:[{name:alias.name,country:'PE',currency:'PEN'},{name:alias.name,country:'CL',currency:'PEN'}]})).status,200);
        let r=pair(await read());assert.equal((await owner.call('meta-ads/effectiveness','PATCH',{aliasId:alias.id,country:'PE',currency:'PEN',day,sales:7,fixedCost:12,revision:0,rowRevision:r.rowRevision})).status,200);
        r=pair(await read());const stale=fill(r,'NA');assert.equal((await admin.call('meta-ads/effectiveness/cells','PATCH',stale)).status,403);assert.equal((await anonymous.call('meta-ads/effectiveness/cells','PATCH',stale)).status,401);
        const saved=await owner.call('meta-ads/effectiveness/cells','PATCH',stale);assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal(saved.body.cells,8);
        r=pair(await read());assert.deepEqual(r.days[day].na,['sales','base','spend','fixedCost']);assert.equal(r.days[day].sales,null);assert.equal(r.days[until].base,null);assert.equal(pair(await read(),'CL').days[day],undefined);
        const stored=await db.metaEffectivenessDay.findFirstOrThrow({where:{row:{aliasId:alias.id,country:'PE',legacy:false},day}});assert.equal(stored.sales,7);assert.equal(Number(stored.fixedCost),12);
        assert.equal((await owner.call('meta-ads/effectiveness/cells','PATCH',stale)).status,409);
        const bad=fill(r,0);bad.targets.push({aliasId:'missing',country:'PE',token:'0'.repeat(32)});assert.equal((await owner.call('meta-ads/effectiveness/cells','PATCH',bad)).status,404);assert(pair(await read()).days[day].na.includes('sales'));
        assert.equal((await owner.call('meta-ads/effectiveness/cells','PATCH',fill(r,0,['sales'],[day]))).status,200);r=pair(await read());assert.equal(r.days[day].sales,0);assert(!r.days[day].na.includes('sales'));assert(r.days[day].na.includes('base'));assert(r.days[until].na.includes('sales'));
        for(const patch of [{value:-1},{value:1.5,metrics:['base']},{value:'N.A.'},{days:['2026-11-01']},{metrics:['sales','sales']}])assert.equal((await owner.call('meta-ads/effectiveness/cells','PATCH',{...fill(r,0),...patch})).status,400);
        assert.equal((await owner.call('meta-ads/effectiveness/cells','PATCH',fill(r,null))).status,200);r=pair(await read());assert.equal(r.days[day].sales,7);assert.equal(r.days[day].fixedCost,12);assert.equal(r.days[day].base,null);assert.deepEqual(r.days[day].na,[]);
        assert.equal((await owner.call('meta-ads/effectiveness/cells','PATCH',fill(r,5,['base'],[day]))).status,200);r=pair(await read());assert.equal(r.days[day].base,5);assert(r.days[day].manual.includes('base'));
        assert.equal((await owner.call('meta-ads/effectiveness/cells','PATCH',fill(r,'NA',['sales'],[day]))).status,200);r=pair(await read());assert.equal((await owner.call('meta-ads/effectiveness','PATCH',{aliasId:alias.id,country:'PE',currency:'PEN',day,sales:9,revision:r.days[day].revision,rowRevision:r.rowRevision})).status,200);r=pair(await read());assert.equal(r.days[day].sales,9);assert(!r.days[day].na.includes('sales'));assert.equal(r.days[day].base,5);
      }finally{await db.metaEffectivenessRow.deleteMany({where:{aliasId:alias.id}});await db.metaAlias.delete({where:{id:alias.id}});await db.metaAliasTable.delete({where:{id:table.id}});}
    });
    await t.test('Efectividad: activación por alias+país, historial inmutable con cifras y sin cambios Meta',async()=>{
      const table=(await owner.call('meta-ads/alias-tables','POST',{name:'Estado hoja '+tag})).body,alias=(await owner.call('meta-ads/aliases','POST',{name:'Estado por país '+tag,tableId:table.id})).body;
      const since='2026-10-20',until='2026-10-21',root='meta-ads/effectiveness?'+new URLSearchParams({tableId:table.id,since,until}),history='meta-ads/effectiveness/history?'+new URLSearchParams({aliasId:alias.id,country:'PE'});
      const read=()=>owner.call(root),pair=(v:any,p='PE')=>v.body.rows.find((r:any)=>r.aliasId===alias.id&&r.country===p);
      const state=(r:any,active:boolean)=>({tableId:table.id,aliasId:alias.id,country:r.country,active,revision:r.stateRevision,since,until,metrics:['sales','base']});
      try{
        await owner.call('meta-ads/effectiveness/import','POST',{tableId:table.id,rows:[{name:alias.name,country:'PE',currency:'PEN'},{name:alias.name,country:'CL',currency:'PEN'}]});let r=pair(await read());assert(r.active);assert.equal(r.lastStateChange,null);assert.equal((await owner.call(history)).body.events.length,0);
        await owner.call('meta-ads/effectiveness','PATCH',{aliasId:alias.id,country:'PE',currency:'PEN',day:since,sales:3,fixedCost:8,revision:0,rowRevision:r.rowRevision});
        const off=state(r,false);assert.equal((await admin.call('meta-ads/effectiveness/state','PATCH',off)).status,403);assert.equal((await admin.call(history)).status,403);assert.equal((await owner.call('meta-ads/effectiveness/state','PATCH',{...off,country:''})).status,400);
        assert.equal((await owner.call('meta-ads/effectiveness/state','PATCH',off)).status,200);assert.equal((await owner.call('meta-ads/effectiveness/state','PATCH',off)).status,409);r=pair(await read());assert.equal(r.active,false);assert(pair(await read(),'CL').active);assert(r.lastStateChange);
        let log=(await owner.call(history)).body;assert.equal(log.events.length,1);const snapshot=log.events[0].snapshot;assert.equal(snapshot.values.sales.total,3);assert.equal(snapshot.values.fixedCost.total,8);assert.equal(snapshot.parameterCount,2);assert.equal(snapshot.since,since);
        let day=r.days[since];await owner.call('meta-ads/effectiveness','PATCH',{aliasId:alias.id,country:'PE',currency:'PEN',day:since,sales:11,revision:day.revision,rowRevision:r.rowRevision});assert.equal((await owner.call(history)).body.events[0].snapshot.values.sales.total,3);
        r=pair(await read());const on=state(r,true),results=await Promise.all([owner.call('meta-ads/effectiveness/state','PATCH',on),owner.call('meta-ads/effectiveness/state','PATCH',on)]);assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);log=(await owner.call(history)).body;assert.equal(log.events.length,2);assert.equal(log.events[0].snapshot.values.sales.total,11);
        const s=await db.metaEffectivenessState.findUniqueOrThrow({where:{aliasId_country:{aliasId:alias.id,country:'PE'}}});const ownerId=(await owner.call("auth/me")).body.id;await db.metaEffectivenessEvent.createMany({data:Array.from({length:50},(_,i)=>({stateId:s.id,active:!!(i%2),actorId:ownerId,createdAt:new Date(Date.now()-100000-i*1000),snapshot}))});
        log=(await owner.call(history)).body;assert.equal(log.events.length,50);assert(log.next);const older=(await owner.call(history+'&cursor='+log.next)).body;assert.equal(older.events.length,2);assert.equal(older.next,null);
        assert.equal((await owner.call('meta-ads/alias-tables')).body.find((t:any)=>t.id===table.id).aliases.some((a:any)=>a.id===alias.id),true);
      }finally{await db.metaEffectivenessRow.deleteMany({where:{aliasId:alias.id}});await db.metaAlias.delete({where:{id:alias.id}});await db.metaAliasTable.delete({where:{id:table.id}});}
    });
    await t.test('Efectividad: P independiente, FX diario, totales por país/moneda/tabla y manuales aislados',async()=>{
      const table=(await owner.call('meta-ads/alias-tables','POST',{name:'Totales '+tag})).body;
      const other=(await owner.call('meta-ads/alias-tables','POST',{name:'Totales otra '+tag})).body;
      const a=(await owner.call('meta-ads/aliases','POST',{name:'Presupuesto uno '+tag,tableId:table.id})).body;
      const b=(await owner.call('meta-ads/aliases','POST',{name:'Presupuesto dos '+tag,tableId:table.id})).body;
      const day='2026-10-20',until='2026-10-21',params=new URLSearchParams({tableId:table.id,since:day,until}),root='meta-ads/effectiveness?'+params,totals='meta-ads/effectiveness/totals?'+params;
      const read=()=>owner.call(root),pair=(v:any,id=a.id,country='PE')=>v.body.rows.find((r:any)=>r.aliasId===id&&r.country===country);
      const fill=(r:any,value:any,metric='budget')=>owner.call('meta-ads/effectiveness/cells','PATCH',{tableId:table.id,since:day,until,days:[day],metrics:[metric],value,targets:[{aliasId:r.aliasId,country:r.country,token:r.token}]});
      const group=(v:any,country='PE',currency='PEN')=>v.body.groups.find((g:any)=>g.country===country&&g.currency===currency)?.days[day];
      try{
        assert.equal((await owner.call('meta-ads/effectiveness/import','POST',{tableId:table.id,rows:[{name:a.name,country:'PE',currency:'PEN'},{name:b.name,country:'PE',currency:'PEN'},{name:a.name,country:'CL',currency:'PEN'}]})).status,200);
        let r=pair(await read());assert.equal((await fill(r,100)).status,200);r=pair(await read());assert.equal(r.days[day].budget,100);assert.equal(r.days[day].spend,null);
        assert.equal((await fill(pair(await read(),b.id),20)).status,200);assert.equal((await fill(pair(await read(),a.id,'CL'),70)).status,200);
        r=pair(await read());assert.equal((await owner.call('meta-ads/effectiveness','PATCH',{aliasId:a.id,country:'PE',currency:'PEN',day,sales:3,fixedCost:9,revision:r.days[day].revision,rowRevision:r.rowRevision})).status,200);
        r=pair(await read());assert.equal((await fill(r,40,'spend')).status,200);assert.equal((await fill(pair(await read()),8,'base')).status,200);
        let result=await owner.call(totals);assert.equal(result.status,200);let c=group(result);assert.equal(c.sums.budget.value,120);assert.equal(c.sums.sales.value,3);assert.equal(c.sums.spend.value,40);assert.equal(c.sums.base.value,8);assert.equal(c.sums.fixedCost.value,9);assert.equal(group(result,'CL').sums.budget.value,70);
        const manual={tableId:table.id,country:'PE',currency:'PEN',day,metric:'baseManual',value:55,revision:0};
        assert.equal((await admin.call(totals)).status,403);assert.equal((await admin.call('meta-ads/effectiveness/totals','PATCH',manual)).status,403);
        assert.equal((await owner.call('meta-ads/effectiveness/totals','PATCH',manual)).status,200);assert.equal((await owner.call('meta-ads/effectiveness/totals','PATCH',manual)).status,409);
        const concurrent=await Promise.all([owner.call('meta-ads/effectiveness/totals','PATCH',{...manual,metric:'totalSpend',value:88,revision:1}),owner.call('meta-ads/effectiveness/totals','PATCH',{...manual,metric:'fixedCost',value:22,revision:1})]);assert.deepEqual(concurrent.map(x=>x.status).sort(),[200,409]);
        c=group(await owner.call(totals));assert.equal(c.manual.baseManual,55);assert.equal(c.revision,2);assert.equal(c.sums.fixedCost.value,9);
        assert.equal((await owner.call('meta-ads/effectiveness/totals','PATCH',{...manual,metric:'fixedCost',value:'NA',revision:2})).status,200);c=group(await owner.call(totals));assert.equal(c.manual.fixedCost,'NA');assert.equal(c.sums.fixedCost.value,9);assert.equal(c.sums.base.value,8);
        const otherRead=await owner.call('meta-ads/effectiveness/totals?'+new URLSearchParams({tableId:other.id,since:day,until}));assert.equal(otherRead.body.groups.length,0);
        for(const patch of [{value:-1},{value:1.5},{country:'XX'},{metric:'budget'},{revision:-1}])assert.equal((await owner.call('meta-ads/effectiveness/totals','PATCH',{...manual,...patch})).status,400);
        assert.equal((await owner.call('meta-ads/effectiveness/totals?'+new URLSearchParams({tableId:table.id,since:day,until:'2026-12-01'}))).status,400);
        assert.equal((await fill(pair(await read(),b.id),'NA')).status,200);c=group(await owner.call(totals));assert.equal(c.sums.budget.value,100);assert.equal(c.sums.budget.na,1);
        await db.metaFxDay.upsert({where:{day},create:{day,rates:{EUR:1,PEN:4,USD:2},source:'sintética',sourceUrl:'https://example.test'},update:{rates:{EUR:1,PEN:4,USD:2}}});
        r=pair(await read());assert.equal((await owner.call('meta-ads/effectiveness/identity','PATCH',{aliasId:a.id,fromCountry:'PE',fromCurrency:'PEN',country:'PE',currency:'USD',revision:r.rowRevision})).status,200);
        r=pair(await read());assert.equal(r.days[day].budget,50);assert.equal(r.days[day].spend,20);assert.equal(r.days[day].fixedCost,4.5);
        result=await owner.call(totals);assert.equal(group(result,'PE','USD').sums.budget.value,50);assert.equal(group(result,'PE','PEN').manual.baseManual,55);assert.equal(group(result,'CL').sums.budget.value,70);
        // Totals are scoped to their explicit unit; changing an alias presentation never relabels totals.
        assert.equal(group(result,'PE','USD').manual.baseManual,undefined);
      }finally{await db.metaEffectivenessTotalDay.deleteMany({where:{tableId:table.id}});await db.metaEffectivenessRow.deleteMany({where:{aliasId:{in:[a.id,b.id]}}});await db.metaAlias.deleteMany({where:{id:{in:[a.id,b.id]}}});await db.metaAliasTable.deleteMany({where:{id:{in:[table.id,other.id]}}});}
    });
    await t.test('Efectividad: sincronizador interno exacto, revisión previa, FX, vacíos y cero/N.A. sin borrar originales',async()=>{
      const source=(await owner.call('meta-ads/alias-tables','POST',{name:'Origen sync '+tag})).body,target=(await owner.call('meta-ads/alias-tables','POST',{name:'Destino sync '+tag})).body;
      const a=(await owner.call('meta-ads/aliases','POST',{name:'Alias exacto sync '+tag,tableId:source.id})).body,newAlias=(await owner.call('meta-ads/aliases','POST',{name:'Alias nuevo sync '+tag,tableId:source.id})).body,dest=(await owner.call('meta-ads/aliases','POST',{name:a.name,tableId:target.id})).body;
      assert(dest.id&&dest.id!==a.id);const day='2026-10-20',until='2026-10-21';
      const read=(id:string)=>owner.call('meta-ads/effectiveness?'+new URLSearchParams({tableId:id,since:day,until}));
      const row=(v:any,id:string,country='PE')=>v.body.rows.find((r:any)=>r.aliasId===id&&r.country===country);
      const set=(r:any,tableId:string,metric:string,value:any,days=[day])=>owner.call('meta-ads/effectiveness/cells','PATCH',{tableId,since:day,until,days,metrics:[metric],value,targets:[{aliasId:r.aliasId,country:r.country,token:r.token}]});
      const request={tableId:target.id,sourceTableId:source.id,since:day,until,columns:['sales','budget']};
      try{
        for(const [t,entries] of [[source,[{name:a.name,country:'PE',currency:'PEN'},{name:a.name,country:'CL',currency:'PEN'},{name:newAlias.name,country:'PE',currency:'PEN'}]],[target,[{name:dest.name,country:'PE',currency:'USD'}]]] as const)assert.equal((await owner.call('meta-ads/effectiveness/import','POST',{tableId:t.id,rows:entries})).status,200);
        await db.metaFxDay.upsert({where:{day},create:{day,rates:{EUR:1,PEN:4,USD:2},source:'sintética',sourceUrl:'https://example.test'},update:{rates:{EUR:1,PEN:4,USD:2}}});
        for(const [metric,value] of [['sales',2],['budget',20],['base','NA'],['spend',40],['fixedCost',5]] as const)assert.equal((await set(row(await read(source.id),a.id),source.id,metric,value)).status,200);
        assert.equal((await set(row(await read(source.id),a.id,'CL'),source.id,'sales',7)).status,200);assert.equal((await set(row(await read(source.id),newAlias.id),source.id,'budget',0)).status,200);
        let r=row(await read(target.id),dest.id);assert.equal((await owner.call('meta-ads/effectiveness','PATCH',{aliasId:dest.id,country:'PE',currency:'USD',day,sales:100,revision:0,rowRevision:r.rowRevision})).status,200);
        assert.equal((await set(row(await read(target.id),dest.id),target.id,'spend',999)).status,200);assert.equal((await set(row(await read(target.id),dest.id),target.id,'sales',88,[until])).status,200);
        assert.equal((await admin.call('meta-ads/effectiveness/sync/preview','POST',request)).status,403);
        assert.equal((await owner.call('meta-ads/effectiveness/sync/preview','POST',{...request,sourceTableId:target.id})).status,400);
        assert.equal((await owner.call('meta-ads/effectiveness/sync/preview','POST',{...request,columns:['sales','base'],mapping:{sales:'base'}})).status,400);
        let p=await owner.call('meta-ads/effectiveness/sync/preview','POST',request);assert.equal(p.status,200);assert.equal(p.body.summary.aliasesAdded,0);assert.equal(p.body.summary.unmatched,2);assert.equal(row(await read(target.id),dest.id).days[day].sales,100);
        const apply={...request,token:p.body.token};assert.equal((await owner.call('meta-ads/effectiveness/sync','POST',apply)).status,200);assert.equal((await owner.call('meta-ads/effectiveness/sync','POST',apply)).status,409);
        r=row(await read(target.id),dest.id);assert.equal(r.days[day].sales,2);assert.equal(r.days[day].budget,10);assert.equal(r.days[day].spend,999);assert.equal(r.days[until].sales,88);assert.equal(await db.metaEffectivenessDay.findFirst({where:{row:{aliasId:dest.id},day}}).then(d=>d!.sales),100);
        const all={...request,columns:['alias','sales','budget','base','spend','fixedCost']};p=await owner.call('meta-ads/effectiveness/sync/preview','POST',all);assert.equal(p.body.summary.aliasesAdded,1);
        assert.equal((await set(row(await read(source.id),a.id),source.id,'sales',3)).status,200);assert.equal((await owner.call('meta-ads/effectiveness/sync','POST',{...all,token:p.body.token})).status,409);assert.equal(await db.metaAlias.count({where:{tableId:target.id}}),1);
        p=await owner.call('meta-ads/effectiveness/sync/preview','POST',all);assert.equal((await owner.call('meta-ads/effectiveness/sync','POST',{...all,token:p.body.token})).status,200);
        r=row(await read(target.id),dest.id);assert.equal(r.days[day].sales,3);assert(r.days[day].na.includes('base'));assert.equal(r.days[day].spend,20);assert.equal(r.days[day].fixedCost,2.5);assert.equal(row(await read(target.id),dest.id,'CL').days[day].sales,7);
        const copied=await db.metaAlias.findFirstOrThrow({where:{tableId:target.id,name:newAlias.name}});assert.equal(row(await read(target.id),copied.id).days[day].budget,0);
        const cfg=await owner.call('meta-ads/effectiveness/sync?tableId='+target.id);assert.equal(cfg.body.sourceTableId,source.id);assert.deepEqual(cfg.body.columns,all.columns);assert(cfg.body.lastSyncAt);
        assert.equal(row(await read(source.id),a.id).days[day].spend,40);assert.equal(row(await read(source.id),a.id).days[day].sales,3);
        const original=await db.metaEffectivenessDay.findFirstOrThrow({where:{row:{aliasId:a.id,country:'PE'},day}});const annotations:any=original.annotations;annotations.spend.partial=true;await db.metaEffectivenessDay.update({where:{rowId_day:{rowId:original.rowId,day}},data:{annotations,revision:{increment:1}}});
        p=await owner.call('meta-ads/effectiveness/sync/preview','POST',all);assert.equal((await owner.call('meta-ads/effectiveness/sync','POST',{...all,token:p.body.token})).status,200);assert(row(await read(target.id),dest.id).days[day].partialMetrics.includes('spend'));const totals=await owner.call('meta-ads/effectiveness/totals?'+new URLSearchParams({tableId:target.id,since:day,until}));assert(totals.body.groups.find((g:any)=>g.country==='PE'&&g.currency==='USD').days[day].sums.spend.partial);

      }finally{await db.metaEffectivenessSync.deleteMany({where:{tableId:target.id}});await db.metaEffectivenessRow.deleteMany({where:{alias:{tableId:{in:[source.id,target.id]}}}});await db.metaAlias.deleteMany({where:{tableId:{in:[source.id,target.id]}}});await db.metaAliasTable.deleteMany({where:{id:{in:[source.id,target.id]}}});}
    });
    await t.test('Efectividad: activación manual masiva atómica por alias+país, conflictos y eventos sin publicidad',async()=>{
      const table=(await owner.call('meta-ads/alias-tables','POST',{name:'Estados lote '+tag})).body;
      const a=(await owner.call('meta-ads/aliases','POST',{name:'Lote uno '+tag,tableId:table.id})).body,b=(await owner.call('meta-ads/aliases','POST',{name:'Lote dos '+tag,tableId:table.id})).body;
      const since='2026-10-20',until='2026-10-21',root='meta-ads/effectiveness?'+new URLSearchParams({tableId:table.id,since,until});
      const read=()=>owner.call(root),row=(v:any,id=a.id,p='PE')=>v.body.rows.find((r:any)=>r.aliasId===id&&r.country===p);
      const request=(v:any,active:boolean)=>({tableId:table.id,since,until,metrics:['sales','budget'],active,targets:[a.id,b.id].map(id=>({aliasId:id,country:'PE',revision:row(v,id).stateRevision}))});
      const call=(data:any)=>owner.call('meta-ads/effectiveness/states','PATCH',data);
      try{
        await owner.call('meta-ads/effectiveness/import','POST',{tableId:table.id,rows:[{name:a.name,country:'PE',currency:'PEN'},{name:a.name,country:'CL',currency:'PEN'},{name:b.name,country:'PE',currency:'PEN'}]});
        let v=await read(),r=row(v);assert.equal((await owner.call('meta-ads/effectiveness','PATCH',{aliasId:a.id,country:'PE',currency:'PEN',day:since,sales:4,fixedCost:12,revision:0,rowRevision:r.rowRevision})).status,200);
        v=await read();let off=request(v,false);assert.equal((await admin.call('meta-ads/effectiveness/states','PATCH',off)).status,403);assert.equal((await call({...off,targets:[{...off.targets[0],country:''}]})).status,400);assert.equal((await call({...off,targets:[off.targets[0],off.targets[0]]})).status,400);
        let result=await call(off);assert.equal(result.status,200);assert.equal(result.body.changed,2);v=await read();assert(!row(v).active&&!row(v,b.id).active);assert(row(v,a.id,'CL').active);
        const history='meta-ads/effectiveness/history?'+new URLSearchParams({aliasId:a.id,country:'PE'});let h=(await owner.call(history)).body;assert.equal(h.events.length,1);assert.equal(h.events[0].snapshot.values.sales.total,4);assert.equal(h.events[0].snapshot.parameterCount,2);
        result=await call(request(v,false));assert.equal(result.body.changed,0);assert.equal(result.body.unchanged,2);assert.equal((await owner.call(history)).body.events.length,1);
        const on=request(v,true);assert.equal((await call({...on,targets:[on.targets[0],{...on.targets[1],revision:999}]})).status,409);assert(!row(await read()).active);assert.equal((await call({...on,targets:[on.targets[0],{aliasId:'missing',country:'PE',revision:0}]})).status,404);assert(!row(await read()).active);
        r=row(await read());await owner.call('meta-ads/effectiveness','PATCH',{aliasId:a.id,country:'PE',currency:'PEN',day:since,sales:9,revision:r.days[since].revision,rowRevision:r.rowRevision});assert.equal((await owner.call(history)).body.events[0].snapshot.values.sales.total,4);
        const results=await Promise.all([call(on),call(on)]);assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);v=await read();assert(row(v).active&&row(v,b.id).active&&row(v,a.id,'CL').active);h=(await owner.call(history)).body;assert.equal(h.events.length,2);assert.equal(h.events[0].snapshot.values.sales.total,9);assert.equal(row(v).days[since].fixedCost,12);
        assert.equal((await call({...request(v,false),metrics:['sales','sales']})).status,400);assert.equal((await call({...request(v,false),until:'2026-12-01'})).status,400);assert.equal((await owner.call('meta-ads/alias-tables')).body.find((t:any)=>t.id===table.id).aliases.length,2);
      }finally{await db.metaEffectivenessRow.deleteMany({where:{aliasId:{in:[a.id,b.id]}}});await db.metaAlias.deleteMany({where:{id:{in:[a.id,b.id]}}});await db.metaAliasTable.delete({where:{id:table.id}});}
    });
    await t.test("cierre de sesión invalida el token", async () => {
      assert.equal((await user.call("auth/logout", "POST")).status, 200);
      assert.equal((await user.call("projects")).status, 401);
    });
  } finally {
    await db.$disconnect();
  }
});
