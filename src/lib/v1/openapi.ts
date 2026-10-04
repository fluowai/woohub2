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
                "**Cotas:** o limite de requisições vale só para `/api/v1` (ver `GET /api/v1/usage`); " +
                "o limite de mensagens é conferido em cada envio.",
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
                    description: "Cria uma instância parada. Depois use `POST /api/v1/instances/{instanceId}/actions` para conectar.",
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
                        "Envie **texto** (resposta síncrona) **ou** **mídia por URL** (resposta `202` com `job_id` — o download é feito pelo worker com proteção SSRF e a cota é conferida novamente na entrega).",
                    parameters: instanceParam(),
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
                        "200": okResponse("Texto enviado.", { delivered: true, key_id: "3EB0...", to: "5511999999999@s.whatsapp.net" }),
                        "202": okResponse("Mídia enfileirada.", { queued: true, job_id: "clx...", to: "5511999999999@s.whatsapp.net" }),
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
