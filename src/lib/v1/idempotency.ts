import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/v1/http";
import { logger } from "@/lib/logger";

/**
 * Idempotency-Key para operações de envio (spec Woohub, seção 7).
 *
 * - repetição da mesma requisição com a mesma chave devolve a resposta original;
 * - mesma chave com corpo diferente → 409 `idempotency_key_reuse`;
 * - requisição ainda em andamento → 409 `idempotency_in_progress`;
 * - resposta de falha não é memorizada (um retry pode tentar de novo).
 *
 * A chave é scoped por empresa + endpoint, então um cliente nunca reaproveita
 * o registro de outro.
 */

const TTL_HOURS = 24;
const STALE_MS = 2 * 60 * 1000; // takeover after 2 minutes (worker crash)

export function idempotencyKey(request: NextRequest): string | null {
    const raw = request.headers.get("idempotency-key");
    const value = raw?.trim();
    return value ? value.slice(0, 200) : null;
}

export function requestFingerprint(parts: string[]): string {
    return createHash("sha256").update(parts.join("\n")).digest("hex");
}

function uniqueWhere(tenantId: string, endpoint: string, key: string) {
    return { tenantId_endpoint_key: { tenantId, endpoint, key } };
}

export async function withIdempotency(params: {
    tenantId: string;
    endpoint: string;
    key: string | null;
    fingerprint: string;
    execute: () => Promise<NextResponse>;
}): Promise<NextResponse> {
    const { tenantId, endpoint, key, fingerprint, execute } = params;
    if (!key) return execute();

    const where = uniqueWhere(tenantId, endpoint, key);
    const existing = await prisma.idempotencyRecord.findUnique({ where });

    if (existing) {
        if (existing.requestHash !== fingerprint) {
            throw new HttpError(
                409,
                "idempotency_key_reuse",
                "Idempotency-Key já usada com um corpo diferente nesta empresa"
            );
        }
        if (existing.status === "COMPLETED" && existing.responseCode) {
            return NextResponse.json(existing.responseBody ?? { data: null }, { status: existing.responseCode });
        }
        if (Date.now() - existing.createdAt.getTime() < STALE_MS) {
            throw new HttpError(409, "idempotency_in_progress", "Requisição com esta Idempotency-Key ainda em andamento");
        }
        await prisma.idempotencyRecord.update({
            where: { id: existing.id },
            data: { status: "IN_PROGRESS", requestHash: fingerprint, createdAt: new Date() },
        });
    } else {
        try {
            await prisma.idempotencyRecord.create({
                data: {
                    tenantId,
                    endpoint,
                    key,
                    requestHash: fingerprint,
                    status: "IN_PROGRESS",
                    expiresAt: new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000),
                },
            });
        } catch {
            // Unique violation: a concurrent request claimed this key first.
            throw new HttpError(409, "idempotency_in_progress", "Requisição com esta Idempotency-Key já em andamento");
        }
    }

    try {
        const response = await execute();
        if (response.status < 400) {
            try {
                const body: unknown = await response.clone().json();
                await prisma.idempotencyRecord.update({
                    where,
                    data: {
                        status: "COMPLETED",
                        responseCode: response.status,
                        responseBody: body as Prisma.InputJsonValue,
                    },
                });
            } catch (error) {
                logger.warn("V1", "Não foi possível memorizar a resposta idempotente:", error);
            }
        } else {
            await prisma.idempotencyRecord.delete({ where }).catch(() => undefined);
        }
        return response;
    } catch (error) {
        await prisma.idempotencyRecord.delete({ where }).catch(() => undefined);
        throw error;
    }
}
