import { randomUUID } from "node:crypto";
import { AppError, demand } from "../errors";
export const MCP_URL = "https://mcp.facebook.com/ads";
export type Operation =
  "accounts" | "campaigns" | "adsets" | "ads" | "insights";
export type MetaTool = {
  name: string;
  inputSchema: {
    properties?: Record<string, { type?: string; enum?: unknown[] }>;
    required?: string[];
  };
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
};
export type Page = { data: Record<string, unknown>[]; after?: string };
export type Query = {
  accountId?: string;
  after?: string;
  level?: string;
  since?: string;
  until?: string;
};
export async function boundedResponse(r: Response, max = 6_000_000) {
  const reader = r.body?.getReader();
  demand(reader, "Meta devolvió una respuesta vacía.", 502);
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      demand(
        size <= max,
        "La respuesta de Meta supera el límite. Reduce el tamaño de página.",
        502,
      );
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).toString("utf8");
}
export function safeMetaURL(raw: string) {
  const u = new URL(raw);
  demand(
    u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      ["mcp.facebook.com", "www.facebook.com", "graph.facebook.com"].includes(
        u.hostname,
      ) &&
      (!u.port || u.port === "443"),
    "Meta devolvió un destino de autorización no permitido.",
    502,
  );
  return u;
}
export async function external(raw: string, init: RequestInit = {}) {
  safeMetaURL(raw);
  try {
    return await fetch(raw, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    throw new AppError(
      "No se pudo conectar con Meta. Comprueba conectividad y vuelve a intentarlo.",
      503,
    );
  }
}
function fail(status: number) {
  throw new AppError(
    status === 401 || status === 403
      ? "Meta rechazó la autorización. Reconecta y comprueba ads_read y el acceso a la cuenta."
      : status === 429
        ? "Meta limitó las consultas. Espera antes de sincronizar de nuevo."
        : "Meta no aceptó la consulta. Revisa permisos, versión y compatibilidad de campos.",
    status === 429 ? 429 : 502,
  );
}
function page(raw: unknown): Page {
  const value = raw as {
    data?: unknown[];
    paging?: { cursors?: { after?: string }; next?: string };
  };
  demand(
    Array.isArray(value?.data) && value.data.length <= 500,
    "Meta devolvió un formato incompatible con la importación.",
    502,
  );
  const after = value.paging?.next ? value.paging?.cursors?.after : undefined;
  demand(!after || after.length <= 4000, "Cursor de Meta inválido.", 502);
  return {
    data: value.data.filter(
      (r): r is Record<string, unknown> =>
        !!r && typeof r === "object" && !Array.isArray(r),
    ),
    ...(after ? { after } : {}),
  };
}
export function readTool(t: MetaTool) {
  return (
    typeof t.name === "string" &&
    /^(get|list|fetch|read|search|query)[_A-Z-]/i.test(t.name) &&
    !/(create|update|delete|pause|resume|publish|mutate|execute|batch|budget)/i.test(
      t.name,
    ) &&
    t.annotations?.destructiveHint !== true
  );
}
const patterns: Record<Operation, RegExp> = {
  accounts: /(ad_?accounts|advertising_?accounts)/i,
  campaigns: /campaigns/i,
  adsets: /ad_?sets/i,
  ads: /(^|_)ads($|_)/i,
  insights: /insights/i,
};
export function selectTool(tools: MetaTool[], op: Operation) {
  const tool = tools.find((t) => readTool(t) && patterns[op].test(t.name));
  demand(
    tool,
    `El MCP no ofrece una herramienta de lectura compatible para ${op}. Usa Marketing API o revisa las herramientas disponibles.`,
    409,
  );
  return tool;
}
export function toolArguments(tool: MetaTool, op: Operation, q: Query) {
  const props = tool.inputSchema?.properties ?? {},
    args: Record<string, unknown> = {};
  const put = (names: string[], value: unknown) => {
    const key = names.find((n) => Object.hasOwn(props, n));
    if (key && value !== undefined) {
      let v = value;
      if (props[key].type === "string" && typeof v === "object")
        v = JSON.stringify(v);
      if (props[key].type === "array" && typeof v === "string")
        v = v.split(",");
      if (props[key].enum)
        demand(
          props[key].enum!.includes(v),
          `La herramienta ${tool.name} no admite el parámetro ${key} necesario.`,
          409,
        );
      args[key] = v;
      return key;
    }
    return undefined;
  };
  if (op !== "accounts")
    demand(
      put(["ad_account_id", "account_id"], q.accountId),
      "El MCP no permite restringir esta consulta a una cuenta publicitaria.",
      409,
    );
  put(["limit", "page_size"], 100);
  if (q.after)
    demand(
      put(["after", "cursor"], q.after),
      "El MCP no ofrece paginación compatible. Usa Marketing API.",
      409,
    );
  put(["fields"], fields(op));
  if (op === "insights") {
    demand(
      put(["level"], q.level),
      "El MCP no permite seleccionar el nivel de estadísticas.",
      409,
    );
    demand(
      put(["time_increment"], 1),
      "El MCP no permite obtener datos diarios compatibles.",
      409,
    );
    demand(
      put(["action_attribution_windows"], ["7d_click", "1d_view"]),
      "El MCP no permite fijar una atribución comparable.",
      409,
    );
    demand(
      put(["action_report_time"], "impression"),
      "El MCP no permite fijar la fecha de atribución.",
      409,
    );
    if (q.since)
      demand(
        put(["time_range"], { since: q.since, until: q.until }),
        "El MCP no acepta el rango de fechas necesario.",
        409,
      );
    else
      demand(
        put(["date_preset"], "maximum"),
        "El MCP no ofrece histórico compatible.",
        409,
      );
  }
  for (const key of tool.inputSchema.required ?? [])
    demand(
      args[key] !== undefined,
      `La herramienta ${tool.name} requiere ${key}, que este adaptador no admite. Usa Marketing API.`,
      409,
    );
  return args;
}
export function fields(op: Operation) {
  return op === "accounts"
    ? "id,name,currency,timezone_name,account_status,business{id,name}"
    : op === "campaigns"
      ? "id,name,objective,status,effective_status,created_time,start_time"
      : op === "adsets"
        ? "id,name,campaign_id,optimization_goal,status,effective_status,created_time,start_time"
        : op === "ads"
          ? "id,name,campaign_id,adset_id,status,effective_status,created_time,creative{thumbnail_url}"
          : "account_id,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,date_start,date_stop,spend,impressions,clicks,actions";
}
export class MetaReader {
  private cachedTools: MetaTool[] | null = null;
  private session = "";
  private protocol = "2025-03-26";
  constructor(
    private token: string,
    private transport: string,
    private version: string,
  ) {}
  async rpc(
    method: string,
    params: Record<string, unknown> = {},
    notification = false,
  ): Promise<unknown> {
    const id = randomUUID();
    const r = await external(MCP_URL, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.token,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(this.session
          ? {
              "Mcp-Session-Id": this.session,
              "MCP-Protocol-Version": this.protocol,
            }
          : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        ...(!notification ? { id } : {}),
        method,
        params,
      }),
    });
    if (!r.ok) fail(r.status);
    this.session = r.headers.get("mcp-session-id") ?? this.session;
    if (notification) {
      await r.body?.cancel();
      return null;
    }
    let envelope: Record<string, unknown> | undefined;
    if (r.headers.get("content-type")?.includes("text/event-stream")) {
      const reader = r.body?.getReader();
      demand(reader, "Respuesta MCP vacía.", 502);
      const decoder = new TextDecoder();
      let buffer = "",
        size = 0;
      try {
        while (!envelope) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          demand(size <= 6000000, "Respuesta MCP demasiado grande.", 502);
          buffer += decoder.decode(value, { stream: true });
          let match: RegExpExecArray | null;
          while ((match = /\r?\n\r?\n/.exec(buffer))) {
            const block = buffer.slice(0, match.index);
            buffer = buffer.slice(match.index + match[0].length);
            const raw = block
              .split(/\r?\n/)
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).trim())
              .join("\n");
            try {
              const event = JSON.parse(raw);
              if (event.id === id) {
                envelope = event;
                break;
              }
            } catch {}
          }
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
    } else {
      try {
        envelope = JSON.parse(await boundedResponse(r));
      } catch {
        throw new AppError("Respuesta MCP no compatible.", 502);
      }
    }
    demand(
      envelope && envelope.id === id && !envelope.error,
      "El MCP rechazó la operación de lectura. Revisa la autorización y las herramientas.",
      502,
    );
    return envelope.result;
  }
  async tools(): Promise<MetaTool[]> {
    if (this.cachedTools) return this.cachedTools;
    const result = (await this.rpc("initialize", {
      protocolVersion: this.protocol,
      capabilities: {},
      clientInfo: { name: "creadordeimagenes-meta-ads", version: "1.0" },
    })) as { protocolVersion?: string };
    demand(
      ["2024-11-05", "2025-03-26", "2025-06-18"].includes(
        result.protocolVersion ?? "",
      ),
      "Versión MCP no compatible.",
      409,
    );
    this.protocol = result.protocolVersion!;
    await this.rpc("notifications/initialized", {}, true);
    const resultTools: MetaTool[] = [];
    let cursor: string | undefined;
    do {
      const listed = (await this.rpc(
        "tools/list",
        cursor ? { cursor } : {},
      )) as { tools: MetaTool[]; nextCursor?: string };
      demand(
        Array.isArray(listed.tools) &&
          resultTools.length + listed.tools.length <= 150,
        "Catálogo MCP demasiado grande o no compatible.",
        502,
      );
      resultTools.push(...listed.tools);
      cursor = listed.nextCursor;
    } while (cursor);
    return (this.cachedTools = resultTools
      .filter(
        (t) =>
          readTool(t) &&
          t.name.length < 150 &&
          JSON.stringify(t).length < 20000,
      )
      .map((t) => ({
        name: t.name,
        inputSchema: t.inputSchema,
        annotations: t.annotations,
      })));
  }
  async get(op: Operation, q: Query = {}): Promise<Page> {
    if (this.transport === "API") {
      demand(
        /^v\d{2}\.0$/.test(this.version),
        "Configura la versión de Graph API de tu app.",
      );
      const path =
        op === "accounts" ? "me/adaccounts" : `act_${q.accountId}/${op}`;
      const u = new URL(`https://graph.facebook.com/${this.version}/${path}`);
      u.searchParams.set("fields", fields(op));
      u.searchParams.set("limit", "100");
      if (q.after) u.searchParams.set("after", q.after);
      if (op === "insights") {
        u.searchParams.set("level", q.level!);
        u.searchParams.set("time_increment", "1");
        u.searchParams.set(
          "action_attribution_windows",
          JSON.stringify(["7d_click", "1d_view"]),
        );
        u.searchParams.set("action_report_time", "impression");
        if (q.since)
          u.searchParams.set(
            "time_range",
            JSON.stringify({ since: q.since, until: q.until }),
          );
        else u.searchParams.set("date_preset", "maximum");
      }
      const r = await external(u.href, {
        headers: { Authorization: "Bearer " + this.token },
      });
      if (!r.ok) fail(r.status);
      try {
        return page(JSON.parse(await boundedResponse(r)));
      } catch (e) {
        if (e instanceof AppError) throw e;
        throw new AppError("Formato de Marketing API no válido.", 502);
      }
    }
    const tools = await this.tools(),
      tool = selectTool(tools, op);
    const result = (await this.rpc("tools/call", {
      name: tool.name,
      arguments: toolArguments(tool, op, q),
    })) as {
      isError?: boolean;
      structuredContent?: unknown;
      content?: { type: string; text?: string }[];
    };
    demand(
      !result.isError,
      "La herramienta MCP no pudo completar la lectura. Usa la configuración de conexión para revisarla.",
      502,
    );
    let raw = result.structuredContent;
    if (!raw) {
      const chunks = (result.content ?? [])
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "");
      try {
        raw = JSON.parse(chunks.join("\n"));
      } catch {
        throw new AppError(
          "El MCP no devolvió datos estructurados importables. Marketing API sigue disponible.",
          409,
        );
      }
    }
    return page(Array.isArray(raw) ? { data: raw } : raw);
  }
}
