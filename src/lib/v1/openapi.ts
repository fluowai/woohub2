import { API_KEY_SCOPES } from "@/lib/permissions";
import { WEBHOOK_EVENT_TYPES } from "@/lib/webhook";

/**
 * OpenAPI 3.1 da API pública Woohub (`/api/v1`), em português.
 *
 * Mantido à mão de propósito: o spec é a documentação versionada do contrato,
 * não um resumo gerado do código. Toda rota nova em `src/app/api/v1` precisa
 * aparecer aqui.
 */

const ERROR_SCHEMA = {
    type: "object",
    required: ["error", "request_id"],
    properties: {
        error: {
            type: "object",
            required: ["code", "message"],
            properties: {
                code: { type: "string", examples: ["quota_exceeded"] },
                message: { type: "string", examples: ["Limite de mensagens do plano atingido"] },
                details: { type: "object", additionalProperties: true },
            },
        },
        request_id: { type: "string", description: "Identificador do erro, use ao abrir um chamado." },
    },
} as const;

function errorResponse(description: string) {
    return {
        description,
        content: { "application/json": { schema: { $ref: "#/components/schemas/Erro" } } },
    };
}

const okResponse = (description: string, example?: unknown) => ({
    description,
    content: {
        "application/json": {
            schema: { $ref: "#/components/schemas/Ok" },
            ...(example !== undefined ? { example } : {}),
        },
    },
});

const ERROR_RESPONSES = {
    "400": errorResponse("Requisição inválida (validação ou parâmetro incorreto)."),
    "401": errorResponse("Credencial ausente, inválida, expirada ou revogada."),
    "402": errorResponse("Cota do plano atingida (companhia sem assinatura ativa também pode responder isto)."),
    "403": errorResponse("Escopo da chave insuficiente, instância de outra companhia ou assinatura inativa."),
    "404": errorResponse("Recurso inexistente."),
    "409": errorResponse("Conflito de estado (instância desconectada, QR indisponível, ação já em andamento)."),
    "422": errorResponse("Requisição entendida, mas o envio falhou (número inválido, rejeição do WhatsApp)."),
    "429": errorResponse("Rate limit atingido; respeite `Retry-After`."),
    "500": errorResponse("Erro interno. Repita com backoff exponencial e contate o suporte se persistir."),
};

function instanceParam(required = true) {
    return [
        {
            name: "instanceId",
            in: "path" as const,
            required,
            description: "Id interno (`id`) ou id da sessão (`session_id`) da instância.",
            schema: { type: "string" },
        },
    ];
}

function jsonBody(schema: unknown, example?: unknown) {
    return {
        required: true,
        content: {
            "application/json": {
                schema,
                ...(example !== undefined ? { example } : {}),
            },
        },
    };
}

/**
 * Exemplos executáveis por operação: cURL, JavaScript (fetch) e o equivalente
 * do nó HTTP Request do n8n. Nunca usam tokens reais — sempre `$WOHUB_KEY`
 * (variável de ambiente) ou a credencial do próprio n8n.
 */
function codeSamples(samples: { curl: string; javascript: string; n8n?: string }) {
    const list = [
        { lang: "bash", label: "cURL", source: samples.curl },
        { lang: "javascript", label: "JavaScript", source: samples.javascript },
    ];
    if (samples.n8n) list.push({ lang: "http", label: "n8n (HTTP Request)", source: samples.n8n });
    return { "x-codeSamples": list, "x-code-samples": list };
}

const instanceSummarySchema = {
    type: "object",
    properties: {
        id: { type: "string" },
        session_id: { type: "string" },
        name: { type: "string" },
        status: {
            type: "string",
            enum: ["STOPPED", "CONNECTING", "QR_REQUIRED", "CONNECTED", "DISCONNECTED", "LOGGED_OUT", "ERROR"],
        },
        connected: { type: "boolean" },
        created_at: { type: "string", format: "date-time" },
    },
} as const;

/** `Ok` com o `data` tipado — mantém o envelope único e documenta a carga. */
function okOf(description: string, dataSchema: unknown, example?: unknown) {
    return {
        description,
        content: {
            "application/json": {
                schema: {
                    allOf: [{ $ref: "#/components/schemas/Ok" }, { properties: { data: dataSchema } }],
                },
                ...(example !== undefined ? { example } : {}),
            },
        },
    };
}

export function getV1Spec() {
    return {
        openapi: "3.1.0",
        info: {
            title: "Woohub API",
            version: "1.0.0",
            description:
                "API pública da Woohub para WhatsApp: instâncias, mensagens, contatos e webhooks.\n\n" +
                "**Autenticação:** `Authorization: Bearer <chave>` ou `X-Api-Key: <chave>` " +
                "(a sessão do painel também é aceita). As chaves são criadas no painel e exibidas uma única vez.\n\n" +
                "**Escopos obrigatórios:** " +
                API_KEY_SCOPES.map((s) => `\`${s}\``).join(", ") +
                ".\n\n**Erros:** todos os erros usam o envelope " +
                "`{ error: { code, message }, request_id }` e códigos estáveis em `snake_case`.\n\n" +
                "**Idempotência:** em `POST /api/v1/instances/{instanceId}/messages` envie o cabeçalho " +
                "`Idempotency-Key` — repetir a mesma requisição com a mesma chave devolve a resposta " +
                "original em vez de enviar de novo (corpo diferente com a mesma chave → `409 idempotency_key_reuse`).\n\n" +
                "**Estados da mensagem:** `PENDING` (aceita) → `SENT` (enviada) → `DELIVERED` (entregue) → " +
                "`READ` (lida), ou `FAILED` (falhou). A aceitação nunca significa entrega; consulte " +
                "`GET /api/v1/instances/{instanceId}/messages/{messageId}` para acompanhar.\n\n" +
                "**Cotas:** o limite de requisições vale só para `/api/v1` (ver `GET /api/v1/usage`); " +
                "o limite de mensagens é conferido em cada envio.\n\n" +
                "**Integração no n8n:** use o nó *HTTP Request* com `Authorization: Bearer <chave>` guardado " +
                "na **credential** do n8n (não no fluxo), método `POST` para " +
                "`/api/v1/instances/{instanceId}/messages` e corpo JSON " +
                "`{\"to\":\"5511999999999\",\"text\":\"Olá\"}`. O exemplo completo está em cada operação " +
                "(aba \"n8n (HTTP Request)\").",
            license: { name: "MIT", identifier: "MIT" },
        },
        servers: [{ url: "/", description: "Servidor da instância Woohub" }],
        tags: [
            { name: "Info", description: "Metadados da API." },
            { name: "Instâncias", description: "Números conectados (conexão, QR, ciclo de vida)." },
            { name: "Mensagens", description: "Envio e histórico de mensagens." },
            { name: "Contatos", description: "Agenda de cada instância." },
            { name: "Webhooks", description: "Eventos entregues por HTTPS com assinatura HMAC." },
            { name: "Uso", description: "Plano, limites e consumo." },
        ],
        security: [{ apiKey: [] }, { sessionCookie: [] }],
        paths: {
            "/api/v1": {
                get: {
                    tags: ["Info"],
                    summary: "Metadados da API",
                    description: "Versão, escopos, limites de taxa e códigos de erro aceitos.",
                    responses: { "200": okResponse("Metadados da API.") },
                },
            },
            "/api/v1/openapi.json": {
                get: {
                    tags: ["Info"],
                    summary: "Especificação OpenAPI",
                    description: "Este documento, no formato OpenAPI 3.1.",
                    security: [],
                    responses: { "200": { description: "Especificação OpenAPI." } },
                },
            },
            "/api/v1/usage": {
                get: {
                    tags: ["Uso"],
                    summary: "Uso e limites da companhia",
                    description:
                        "Modo da companhia (`pilot` sem assinatura → sem cotas, `active` com limites, `suspended` bloqueada), plano, limites e consumo do período.",
                    ...codeSamples({
                        curl: 'curl -sS https://SEU_HOST/api/v1/usage \\\n  -H "Authorization: Bearer $WOHUB_KEY"',
                        javascript:
                            'const res = await fetch("https://SEU_HOST/api/v1/usage", {\n  headers: { Authorization: `Bearer ${process.env.WOHUB_KEY}` },\n});\nconst { data } = await res.json();\nconsole.log(data.mode, data.usage);',
                        n8n: 'Nó "HTTP Request"\nMethod: GET\nURL: https://SEU_HOST/api/v1/usage\nAuthentication: Generic Credential → Header Auth\n  Name: Authorization | Value: Bearer {{$env.WOHUB_KEY}}\nSend Headers: (não é preciso outro)',
                    }),
                    responses: {
                        "200": okResponse("Uso atual.", { mode: "active", plan: { code: "starter", name: "Starter" }, limits: { sendLimit: 1000 }, usage: { messagesSent: 12 } }),
                        ...ERROR_RESPONSES,
                    },
                },
            },
            "/api/v1/instances": {
                get: {
                    tags: ["Instâncias"],
                    summary: "Listar instâncias",
                    description: "Instâncias visíveis para a credencial (escopo da companhia).",
                    ...codeSamples({
                        curl: 'curl -sS https://SEU_HOST/api/v1/instances \\\n  -H "Authorization: Bearer $WOHUB_KEY"',
                        javascript:
                            'const res = await fetch("https://SEU_HOST/api/v1/instances", {\n  headers: { Authorization: `Bearer ${process.env.WOHUB_KEY}` },\n});\nconst { data } = await res.json();\nconsole.table(data.map((i) => ({ id: i.id, nome: i.name, status: i.status })));',
                        n8n: 'Nó "HTTP Request"\nMethod: GET\nURL: https://SEU_HOST/api/v1/instances\nAuthentication: Generic Credential → Header Auth\n  Name: Authorization | Value: Bearer {{$env.WOHUB_KEY}}',
                    }),
                    responses: {
                        "200": okOf(
                            "Lista de instâncias.",
                            { type: "array", items: instanceSummarySchema },
                            { data: [{ id: "clx...", session_id: "abc123", name: "Vendas", status: "CONNECTED", connected: true }], meta: { total: 1 } }
                        ),
                        ...ERROR_RESPONSES,
                    },
                },
                post: {
                    tags: ["Instâncias"],
                    summary: "Criar instância",
                    description: "Cria uma instância parada. Depois use `POST /api/v1/instances/{instanceId}/connect`.",
                    ...codeSamples({
                        curl: 'curl -sS -X POST https://SEU_HOST/api/v1/instances \\\n  -H "Authorization: Bearer $WOHUB_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"name":"Vendas"}\'',
                        javascript:
                            'const res = await fetch("https://SEU_HOST/api/v1/instances", {\n  method: "POST",\n  headers: {\n    Authorization: `Bearer ${process.env.WOHUB_KEY}`,\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify({ name: "Vendas" }),\n});\nconst { data } = await res.json();\nconsole.log(data.id, data.status);',
                        n8n: 'Nó "HTTP Request"\nMethod: POST\nURL: https://SEU_HOST/api/v1/instances\nAuthentication: Generic Credential → Header Auth (Authorization: Bearer ...)\nSend Body: JSON\n  {"name":"Vendas"}',
                    }),
                    requestBody: jsonBody(
                        {
                            type: "object",
                            required: ["name"],
                            properties: {
                                name: { type: "string", minLength: 1, maxLength: 60 },
                                session_id: { type: "string", description: "Id personalizado da sessão (opcional)." },
                            },
                        },
                        { name: "Vendas" }
                    ),
                    responses: {
                        "201": okResponse("Instância criada."),
                        ...ERROR_RESPONSES,
                    },
                },
            },
            "/api/v1/instances/{instanceId}": {
                get: {
                    tags: ["Instâncias"],
                    summary: "Detalhar instância",
                    parameters: instanceParam(),
                    responses: { "200": okResponse("Detalhe da instância (status ao vivo e contagens)."), ...ERROR_RESPONSES },
                },
                delete: {
                    tags: ["Instâncias"],
                    summary: "Remover instância",
                    description: "Somente o dono. Ação irreversível: apaga a sessão e as credenciais.",
                    parameters: instanceParam(),
                    responses: { "204": { description: "Removida." }, ...ERROR_RESPONSES },
                },
            },
            "/api/v1/instances/{instanceId}/qr": {
                get: {
                    tags: ["Instâncias"],
                    summary: "Obter QR de pareamento",
                    description: "Vale enquanto a instância estiver `QR_REQUIRED`/conectando e não estiver pareada.",
                    parameters: instanceParam(),
                    responses: {
                        "200": okResponse("QR disponível.", { qr: "2@...", image: "data:image/png;base64,..." }),
                        ...ERROR_RESPONSES,
                    },
                },
            },
            "/api/v1/instances/{instanceId}/actions": {
                post: {
                    tags: ["Instâncias"],
                    summary: "Executar ação na instância",
                    description: "`start`, `stop`, `restart`, `logout` ou `pair` (pareamento por código, sem QR).",
                    parameters: instanceParam(),
                    requestBody: jsonBody(
                        {
                            oneOf: [
                                { type: "object", required: ["action"], properties: { action: { enum: ["start", "stop", "restart", "logout"] } } },
                                { type: "object", required: ["action", "phone_number"], properties: { action: { const: "pair" }, phone_number: { type: "string", description: "Somente dígitos com DDI." } } },
                            ],
                        },
                        { action: "pair", phone_number: "5511999999999" }
                    ),
                    responses: { "200": okResponse("Ação aceita."), ...ERROR_RESPONSES },
                },
            },
            "/api/v1/instances/{instanceId}/connect": {
                post: {
                    tags: ["Instâncias"],
                    summary: "Conectar instância",
                    description:
                        "Aceita a ordem de conexão e responde `202`: o motor conecta em background. " +
                        "Depois consulte o status em `GET /api/v1/instances/{instanceId}` ou pegue o QR em `.../qr`.",
                    parameters: instanceParam(),
                    ...codeSamples({
                        curl: 'curl -sS -X POST https://SEU_HOST/api/v1/instances/INSTANCIA/connect \\\n  -H "Authorization: Bearer $WOHUB_KEY"',
                        javascript:
                            'const res = await fetch("https://SEU_HOST/api/v1/instances/INSTANCIA/connect", {\n  method: "POST",\n  headers: { Authorization: `Bearer ${process.env.WOHUB_KEY}` },\n});\nconsole.log(res.status); // 202 Accepted',
                        n8n: 'Nó "HTTP Request"\nMethod: POST\nURL: https://SEU_HOST/api/v1/instances/INSTANCIA/connect\nAuthentication: Generic Credential → Header Auth (Authorization: Bearer ...)',
                    }),
                    responses: {
                        "202": okResponse("Conexão iniciada (assíncrona).", { action: "connect", session_id: "abc123", status: "CONNECTING" }),
                        ...ERROR_RESPONSES,
                    },
                },
            },
            "/api/v1/instances/{instanceId}/disconnect": {
                post: {
                    tags: ["Instâncias"],
                    summary: "Desconectar instância",
                    description: "Para a conexão **sem** apagar as credenciais; a instância pode reconectar depois.",
                    parameters: instanceParam(),
                    ...codeSamples({
                        curl: 'curl -sS -X POST https://SEU_HOST/api/v1/instances/INSTANCIA/disconnect \\\n  -H "Authorization: Bearer $WOHUB_KEY"',
                        javascript:
                            'const res = await fetch("https://SEU_HOST/api/v1/instances/INSTANCIA/disconnect", {\n  method: "POST",\n  headers: { Authorization: `Bearer ${process.env.WOHUB_KEY}` },\n});\nconst { data } = await res.json();\nconsole.log(data.status); // STOPPED',
                        n8n: 'Nó "HTTP Request"\nMethod: POST\nURL: https://SEU_HOST/api/v1/instances/INSTANCIA/disconnect\nAuthentication: Generic Credential → Header Auth (Authorization: Bearer ...)',
                    }),
                    responses: { "200": okResponse("Desconectada.", { action: "disconnect", session_id: "abc123", status: "STOPPED" }), ...ERROR_RESPONSES },
                },
            },
            "/api/v1/instances/{instanceId}/messages/{messageId}": {
                get: {
                    tags: ["Mensagens"],
                    summary: "Consultar mensagem",
                    description:
                        "Estado pontual da mensagem: `PENDING` (aceita) → `SENT` (enviada) → `DELIVERED` (entregue) → " +
                        "`READ` (lida), ou `FAILED` (falhou).",
                    parameters: [
                        ...instanceParam(),
                        { name: "messageId", in: "path", required: true, description: "Id público da mensagem (`message_id` do envio).", schema: { type: "string" } },
                    ],
                    ...codeSamples({
                        curl: 'curl -sS https://SEU_HOST/api/v1/instances/INSTANCIA/messages/MENSAGEM \\\n  -H "Authorization: Bearer $WOHUB_KEY"',
                        javascript:
                            'const res = await fetch("https://SEU_HOST/api/v1/instances/INSTANCIA/messages/MENSAGEM", {\n  headers: { Authorization: `Bearer ${process.env.WOHUB_KEY}` },\n});\nconst { data } = await res.json();\nconsole.log(data.status); // PENDING | SENT | DELIVERED | READ | FAILED',
                        n8n: 'Nó "HTTP Request" (polling de status)\nMethod: GET\nURL: https://SEU_HOST/api/v1/instances/INSTANCIA/messages/{{$json.message_id}}\nAuthentication: Generic Credential → Header Auth (Authorization: Bearer ...)',
                    }),
                    responses: { "200": okResponse("Mensagem."), ...ERROR_RESPONSES },
                },
            },
            "/api/v1/instances/{instanceId}/messages": {
                get: {
                    tags: ["Mensagens"],
                    summary: "Listar mensagens de um chat",
                    parameters: [
                        ...instanceParam(),
                        { name: "jid", in: "query", required: true, description: "JID do chat (ex.: `5511999999999@s.whatsapp.net` ou JID de grupo).", schema: { type: "string" } },
                        { name: "limit", in: "query", schema: { type: "integer", default: 50, minimum: 1, maximum: 100 } },
                        { name: "before", in: "query", description: "Cursor ISO-8601: retorna mensagens anteriores a esta data.", schema: { type: "string", format: "date-time" } },
                    ],
                    responses: { "200": okResponse("Mensagens em ordem cronológica."), ...ERROR_RESPONSES },
                },
                post: {
                    tags: ["Mensagens"],
                    summary: "Enviar mensagem",
                    description:
                        "Envie **texto** (resposta síncrona `200` com `status: SENT`) **ou** **mídia por URL** " +
                        "(resposta `202` com `status: accepted` e `job_id` — o download é feito pelo worker com " +
                        "proteção SSRF e a cota é conferida novamente na entrega). `SENT` significa enviada ao " +
                        "WhatsApp, **não** entregue ao destinatário: acompanhe por " +
                        "`GET /api/v1/instances/{instanceId}/messages/{messageId}`.\n\n" +
                        "Use o cabeçalho `Idempotency-Key` para tornar o envio seguro contra repetição.",
                    parameters: [
                        ...instanceParam(),
                        {
                            name: "Idempotency-Key",
                            in: "header",
                            required: false,
                            description:
                                "Chave única por envio (ex.: `pedido-1234`). Repetir a mesma requisição com a mesma chave devolve a resposta original.",
                            schema: { type: "string", maxLength: 200 },
                        },
                    ],
                    ...codeSamples({
                        curl: 'curl -sS -X POST https://SEU_HOST/api/v1/instances/INSTANCIA/messages \\\n  -H "Authorization: Bearer $WOHUB_KEY" \\\n  -H "Content-Type: application/json" \\\n  -H "Idempotency-Key: pedido-1234" \\\n  -d \'{"to":"5511999999999","text":"Olá!"}\'',
                        javascript:
                            'const res = await fetch("https://SEU_HOST/api/v1/instances/INSTANCIA/messages", {\n  method: "POST",\n  headers: {\n    Authorization: `Bearer ${process.env.WOHUB_KEY}`,\n    "Content-Type": "application/json",\n    "Idempotency-Key": `pedido-${Date.now()}`,\n  },\n  body: JSON.stringify({ to: "5511999999999", text: "Olá!" }),\n});\nconst body = await res.json();\nconsole.log(res.status, body.data.status); // 200 "SENT" | 202 "accepted"',
                        n8n: 'Nó "HTTP Request"\nMethod: POST\nURL: https://SEU_HOST/api/v1/instances/INSTANCIA/messages\nAuthentication: Generic Credential → Header Auth (Authorization: Bearer ...)\nSend Headers:\n  Idempotency-Key: {{$runId}}        <- evita reenvio se o fluxo reexecutar\n  Content-Type: application/json\nSend Body: JSON\n  {"to":"5511999999999","text":"Olá pelo n8n"}\nOn Error: continuar (trate 402/403/429 na sequência)',
                    }),
                    requestBody: jsonBody(
                        {
                            type: "object",
                            required: ["to"],
                            properties: {
                                to: { type: "string", description: "Número com DDI (`5511999999999`) ou JID completo." },
                                text: { type: "string", minLength: 1 },
                                media_url: { type: "string", format: "uri" },
                                media_type: { type: "string", enum: ["image", "video", "audio", "document"] },
                                caption: { type: "string" },
                                mentions: { type: "array", items: { type: "string" } },
                                quoted_message_id: { type: "string" },
                            },
                        },
                        { to: "5511999999999", text: "Olá!" }
                    ),
                    responses: {
                        "200": okResponse(
                            "Texto enviado ao WhatsApp (não confunde com entrega).",
                            { status: "SENT", message_id: "clx...", key_id: "3EB0...", to: "5511999999999@s.whatsapp.net" }
                        ),
                        "202": okResponse(
                            "Mídia aceita na fila (status `accepted`; acompanhe pelo `job_id`).",
                            { status: "accepted", queued: true, job_id: "clx...", to: "5511999999999@s.whatsapp.net" }
                        ),
                        ...ERROR_RESPONSES,
                    },
                },
            },
            "/api/v1/instances/{instanceId}/contacts": {
                get: {
                    tags: ["Contatos"],
                    summary: "Listar contatos",
                    parameters: [
                        ...instanceParam(),
                        { name: "page", in: "query", schema: { type: "integer", default: 1, minimum: 1 } },
                        { name: "limit", in: "query", schema: { type: "integer", default: 20, minimum: 1, maximum: 100 } },
                        { name: "search", in: "query", description: "Busca por nome, pushname ou número.", schema: { type: "string" } },
                    ],
                    responses: { "200": okResponse("Contatos paginados."), ...ERROR_RESPONSES },
                },
            },
            "/api/v1/webhooks": {
                get: {
                    tags: ["Webhooks"],
                    summary: "Listar webhooks",
                    responses: { "200": okResponse("Webhooks da companhia."), ...ERROR_RESPONSES },
                },
                post: {
                    tags: ["Webhooks"],
                    summary: "Criar webhook",
                    description: "Entrega por HTTPS com `X-Webhook-Signature: sha256=<hmac>` quando há `secret`. Reenvios reutilizam o mesmo `event_id` (dedupe no consumidor).",
                    ...codeSamples({
                        curl: 'curl -sS -X POST https://SEU_HOST/api/v1/webhooks \\\n  -H "Authorization: Bearer $WOHUB_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"name":"Meu backend","url":"https://exemplo.com/webhooks/woohub","events":["message.received"],"secret":"SEGredo-com-min-8"}\'',
                        javascript:
                            'const res = await fetch("https://SEU_HOST/api/v1/webhooks", {\n  method: "POST",\n  headers: {\n    Authorization: `Bearer ${process.env.WOHUB_KEY}`,\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify({\n    name: "Meu backend",\n    url: "https://exemplo.com/webhooks/woohub",\n    events: ["message.received"],\n    secret: process.env.MY_WEBHOOK_SECRET,\n  }),\n});\nconst { data } = await res.json();\nconsole.log(data.id);',
                        n8n: 'Receber no n8n: nó "Webhook" (Method POST) na URL que o Woohub devolver.\nDepois, no nó "Respond to Webhook": responda 200.\nPara validar: compare o header X-Webhook-Signature com HMAC-SHA256 do corpo usando o mesmo secret cadastrado.',
                    }),
                    requestBody: jsonBody(
                        {
                            type: "object",
                            required: ["name", "url", "events"],
                            properties: {
                                name: { type: "string" },
                                url: { type: "string", format: "uri" },
                                events: { type: "array", minItems: 1, items: { type: "string", enum: [...WEBHOOK_EVENT_TYPES, "*"] } },
                                secret: { type: "string", minLength: 8, description: "Segredo do HMAC (mín. 8 caracteres)." },
                                instance_id: { type: "string", description: "Restringe os eventos a uma instância." },
                            },
                        },
                        { name: "Meu backend", url: "https://exemplo.com/webhooks/woohub", events: ["message.received"], secret: "segredo-forte-123" }
                    ),
                    responses: { "201": okResponse("Webhook criado."), ...ERROR_RESPONSES },
                },
            },
            "/api/v1/webhooks/{webhookId}": {
                get: {
                    tags: ["Webhooks"],
                    summary: "Detalhar webhook",
                    parameters: [{ name: "webhookId", in: "path", required: true, schema: { type: "string" } }],
                    responses: { "200": okResponse("Webhook."), ...ERROR_RESPONSES },
                },
                patch: {
                    tags: ["Webhooks"],
                    summary: "Atualizar webhook",
                    parameters: [{ name: "webhookId", in: "path", required: true, schema: { type: "string" } }],
                    requestBody: jsonBody({
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            url: { type: "string", format: "uri" },
                            events: { type: "array", items: { type: "string" } },
                            secret: { type: "string", nullable: true },
                            is_active: { type: "boolean" },
                            instance_id: { type: "string", nullable: true },
                        },
                    }),
                    responses: { "200": okResponse("Webhook atualizado."), ...ERROR_RESPONSES },
                },
                delete: {
                    tags: ["Webhooks"],
                    summary: "Remover webhook",
                    parameters: [{ name: "webhookId", in: "path", required: true, schema: { type: "string" } }],
                    responses: { "204": { description: "Removido." }, ...ERROR_RESPONSES },
                },
            },
            "/api/v1/webhooks/{webhookId}/logs": {
                get: {
                    tags: ["Webhooks"],
                    summary: "Tentativas de entrega",
                    parameters: [
                        { name: "webhookId", in: "path", required: true, schema: { type: "string" } },
                        { name: "limit", in: "query", schema: { type: "integer", default: 50, minimum: 1, maximum: 200 } },
                        { name: "status", in: "query", schema: { type: "string", enum: ["SUCCESS", "FAILED"] } },
                    ],
                    responses: { "200": okResponse("Tentativas, da mais recente."), ...ERROR_RESPONSES },
                },
            },
        },
        components: {
            securitySchemes: {
                apiKey: {
                    type: "apiKey",
                    in: "header",
                    name: "Authorization",
                    description: "Use `Authorization: Bearer <chave>` ou o cabeçalho `X-Api-Key: <chave>`.",
                },
                sessionCookie: {
                    type: "apiKey",
                    in: "cookie",
                    name: "authjs.session-token",
                    description: "Sessão do painel (útil para testar no navegador).",
                },
            },
            schemas: {
                Ok: {
                    type: "object",
                    required: ["data"],
                    properties: {
                        data: { description: "Carga útil da operação.", additionalProperties: true },
                        meta: { description: "Paginação/metadados adicionais.", additionalProperties: true },
                    },
                },
                Erro: ERROR_SCHEMA,
            },
        },
        "x-rate-limit": {
            requests_per_minute: Math.max(1, parseInt(process.env.RATE_LIMIT_PER_MINUTE || "120", 10)),
            headers: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset", "Retry-After"],
        },
    };
}
