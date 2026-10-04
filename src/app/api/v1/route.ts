import { API_KEY_SCOPES } from "@/lib/permissions";
import { v1Ok } from "@/lib/v1/http";

export const dynamic = "force-dynamic";

/** Metadados da API pública (não expõe dados de tenant). */
export async function GET() {
    const rateLimit = Math.max(1, parseInt(process.env.RATE_LIMIT_PER_MINUTE || "120", 10));

    return v1Ok({
        name: "Woohub API",
        version: "1.0.0",
        base_path: "/api/v1",
        openapi: "/api/v1/openapi.json",
        authentication: {
            header: "Authorization: Bearer <chave>",
            alt_header: "X-Api-Key: <chave>",
            note: "Também aceita a sessão do painel (cookie). A chave é exibida uma única vez na criação.",
        },
        scopes: API_KEY_SCOPES,
        limits: {
            requests_per_minute: rateLimit,
            headers: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset", "Retry-After"],
        },
        errors: {
            envelope: '{ "error": { "code": string, "message": string }, "request_id": string }',
            codes: [
                "invalid_request",
                "validation_error",
                "unauthenticated",
                "invalid_api_key",
                "insufficient_scope",
                "forbidden",
                "not_found",
                "instance_not_found",
                "rate_limited",
                "quota_exceeded",
                "subscription_inactive",
                "instance_not_connected",
                "internal_error",
            ],
        },
    });
}
