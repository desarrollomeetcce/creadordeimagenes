import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";
test("despliegue sin base devuelve instalación pendiente y no finge cuentas creadas", async () => {
  const port = await new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const number = socket.address().port;
      socket.close(() => resolve(number));
    });
  });
  const server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      env: {
        ...process.env,
        DATABASE_URL: "",
        DIRECT_DATABASE_URL: "",
        BOOTSTRAP_TOKEN: "",
        APP_ORIGIN: `http://127.0.0.1:${port}`,
      },
      stdio: "ignore",
    },
  );
  try {
    let response;
    for (let n = 0; n < 100; n++) {
      try {
        response = await fetch(`http://127.0.0.1:${port}/api/auth/status`);
        break;
      } catch {
        await delay(100);
      }
    }
    assert(response, "El servidor no arrancó");
    assert.equal(response.status, 503);
    const body = await response.json();
    assert(body.error.includes("base de datos"));
    assert(!("needsSetup" in body));
    assert(!JSON.stringify(body).includes("DATABASE_URL"));
  } finally {
    server.kill("SIGTERM");
  }
});
