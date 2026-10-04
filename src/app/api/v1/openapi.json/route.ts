import { getV1Spec } from "@/lib/v1/openapi";

export const dynamic = "force-dynamic";

/** Especificação OpenAPI 3.1 da API pública (pt-BR). */
export async function GET() {
    return Response.json(getV1Spec());
}
