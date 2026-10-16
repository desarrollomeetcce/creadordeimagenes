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
        await pauseBackground(me, batch.id);
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
    await t.test("cierre de sesión invalida el token", async () => {
      assert.equal((await user.call("auth/logout", "POST")).status, 200);
      assert.equal((await user.call("projects")).status, 401);
    });
  } finally {
    await db.$disconnect();
  }
});
