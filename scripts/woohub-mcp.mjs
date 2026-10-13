#!/usr/bin/env node

/**
 * Servidor MCP oficial da WooHub.
 *
 * Transporte: JSON-RPC 2.0 por stdin/stdout. O processo não imprime logs em
 * stdout para não corromper o protocolo; diagnósticos vão para stderr.
 *
 * Variáveis: WOOHUB_API_URL (ex.: https://api.woohub.app), WOOHUB_API_KEY.
 */
const apiUrl = (process.env.WOOHUB_API_URL || "http://localhost:1609").replace(/\/$/, "");
const apiKey = process.env.WOOHUB_API_KEY || "";

const tools = [
  { name: "listar_instancias", description: "Lista as instâncias visíveis para a chave WooHub.", inputSchema: { type: "object", properties: {} } },
  { name: "consultar_instancia", description: "Consulta uma instância WooHub por ID.", inputSchema: { type: "object", required: ["instance_id"], properties: { instance_id: { type: "string" } } } },
  { name: "criar_instancia", description: "Cria uma instância parada.", inputSchema: { type: "object", required: ["name"], properties: { name: { type: "string" }, session_id: { type: "string" } } } },
  { name: "conectar_instancia", description: "Inicia a conexão e retorna o estado atual.", inputSchema: { type: "object", required: ["instance_id"], properties: { instance_id: { type: "string" } } } },
  { name: "desconectar_instancia", description: "Desconecta uma instância.", inputSchema: { type: "object", required: ["instance_id"], properties: { instance_id: { type: "string" } } } },
  { name: "obter_qr_code", description: "Obtém o QR Code atual de uma instância.", inputSchema: { type: "object", required: ["instance_id"], properties: { instance_id: { type: "string" } } } },
  { name: "enviar_texto", description: "Envia uma mensagem de texto.", inputSchema: { type: "object", required: ["instance_id", "to", "text"], properties: { instance_id: { type: "string" }, to: { type: "string" }, text: { type: "string" } } } },
  { name: "consultar_uso", description: "Consulta uso e limites da conta.", inputSchema: { type: "object", properties: {} } },
];

function response(id, result) { return JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n"; }
async function callApi(path, method = "GET", body) {
  if (!apiKey) throw new Error("Configure WOOHUB_API_KEY antes de iniciar o MCP da WooHub.");
  const res = await fetch(`${apiUrl}/api/v1${path}`, {
    method,
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-API-Key": apiKey },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await res.json().catch(() => ({ error: { message: "Resposta inválida da WooHub" } }));
  if (!res.ok) throw new Error(data?.error?.message || `WooHub respondeu HTTP ${res.status}`);
  return data;
}

async function invoke(name, args = {}) {
  switch (name) {
    case "listar_instancias": return callApi("/instances");
    case "consultar_instancia": return callApi(`/instances/${encodeURIComponent(args.instance_id)}`);
    case "criar_instancia": return callApi("/instances", "POST", { name: args.name, ...(args.session_id ? { session_id: args.session_id } : {}) });
    case "conectar_instancia": return callApi(`/instances/${encodeURIComponent(args.instance_id)}/connect`, "POST");
    case "desconectar_instancia": return callApi(`/instances/${encodeURIComponent(args.instance_id)}/disconnect`, "POST");
    case "obter_qr_code": return callApi(`/instances/${encodeURIComponent(args.instance_id)}/qr`);
    case "enviar_texto": return callApi(`/instances/${encodeURIComponent(args.instance_id)}/messages`, "POST", { to: args.to, type: "text", text: args.text });
    case "consultar_uso": return callApi("/usage");
    default: throw new Error(`Ferramenta MCP desconhecida: ${name}`);
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";
  for (const line of lines) {
    if (!line.trim()) continue;
    let request;
    try { request = JSON.parse(line); } catch { process.stderr.write("WooHub MCP: JSON inválido\n"); continue; }
    if (request.method === "notifications/initialized") continue;
    if (request.method === "initialize") {
      process.stdout.write(response(request.id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "woohub-mcp", version: "1.0.0" } }));
      continue;
    }
    if (request.method === "tools/list") { process.stdout.write(response(request.id, { tools })); continue; }
    if (request.method === "tools/call") {
      try {
        const result = await invoke(request.params?.name, request.params?.arguments || {});
        process.stdout.write(response(request.id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result }));
      } catch (err) {
        process.stdout.write(response(request.id, { content: [{ type: "text", text: err instanceof Error ? err.message : "Erro desconhecido" }], isError: true }));
      }
    }
  }
});
