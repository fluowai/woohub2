import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { currentContext } from "@/lib/access";
import { QuotaError } from "@/lib/quota";
import { getAuthenticatedUser, type AuthenticatedUser } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

/**
 * Envelope único da API pública v1.
 *
 * Sucesso : { "data": ... }            (opcionalmente { "meta": ... })
 * Erro    : { "error": { "code", "message", "details?" }, "request_id" }
 *
 * `code` é estável (snake_case, inglês) para consumo de máquina; `message` é em
 * português para leitura humana. Todos os erros passam por `v1ErrorResponse`,
 * então nenhuma rota devolve status 200 com falha embutida.
 */

export class HttpError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
        message: string,
        readonly details?: unknown
    ) {
        super(message);
        this.name = "HttpError";
    }
}

export function badRequest(message: string, details?: unknown): HttpError {
    return new HttpError(400, "invalid_request", message, details);
}

export function notFound(message = "Recurso não encontrado"): HttpError {
    return new HttpError(404, "not_found", message);
}

export function forbidden(message = "Sem permissão para este recurso"): HttpError {
    return new HttpError(403, "forbidden", message);
}

function requestId(): string {
    return currentContext()?.requestId ?? "stateless";
}

/** Authenticated caller or 401 (the proxy already blocks anonymous traffic). */
export async function requireUser(request: NextRequest): Promise<AuthenticatedUser> {
    const user = await getAuthenticatedUser(request);
    if (!user) throw new HttpError(401, "unauthenticated", "Credencial ausente ou inválida");
    return user;
}

export function v1Ok<T>(data: T, meta?: Record<string, unknown>): NextResponse {
    return NextResponse.json(meta ? { data, meta } : { data });
}

export function v1Created<T>(data: T): NextResponse {
    return NextResponse.json({ data }, { status: 201 });
}

export function v1Accepted<T>(data: T): NextResponse {
    return NextResponse.json({ data }, { status: 202 });
}

export function v1NoContent(): NextResponse {
    return new NextResponse(null, { status: 204 });
}

export function v1Error(status: number, code: string, message: string, details?: unknown): NextResponse {
    return NextResponse.json(
        { error: { code, message, ...(details !== undefined ? { details } : {}) }, request_id: requestId() },
        { status }
    );
}

/**
 * Maps any thrown value to the v1 error envelope:
 *   HttpError -> its own status/code; QuotaError -> 402/403; ZodError -> 400;
 *   anything else -> 500 internal_error (logged, never leaked to the client).
 */
export function v1ErrorResponse(error: unknown): NextResponse {
    if (error instanceof HttpError) {
        return v1Error(error.status, error.code, error.message, error.details);
    }
    if (error instanceof QuotaError) {
        return v1Error(error.status, error.code, error.message);
    }
    if (error instanceof ZodError) {
        return v1Error(400, "validation_error", "Corpo/parâmetros inválidos", error.flatten());
    }
    logger.error("V1", "Erro interno:", error);
    return v1Error(500, "internal_error", "Erro interno do servidor");
}
