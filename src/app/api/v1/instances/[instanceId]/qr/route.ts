import type { NextRequest } from "next/server";
import QRCode from "qrcode";
import { waManager } from "@/modules/whatsapp/manager";
import { HttpError, requireUser, v1ErrorResponse, v1Ok } from "@/lib/v1/http";
import { requireInstance } from "@/lib/v1/instance";

export const dynamic = "force-dynamic";

/**
 * QR de pareamento da instância.
 * Retorna o conteúdo bruto (para gerar a imagem no cliente) e a imagem em base64.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ instanceId: string }> }
) {
    try {
        const user = await requireUser(request);
        const { instanceId } = await params;
        const ref = await requireInstance(user, instanceId);

        const instance = waManager.getInstance(ref.sessionId);
        if (!instance) {
            throw new HttpError(409, "instance_not_connected", "Instância não está em execução; conecte-a antes de pedir o QR");
        }
        if (instance.socket?.user) {
            throw new HttpError(409, "already_connected", "Instância já conectada");
        }

        const qr = instance.qr;
        if (!qr) {
            throw new HttpError(409, "qr_not_available", "QR ainda não disponível (instância conectando)");
        }

        return v1Ok({ qr, image: await QRCode.toDataURL(qr) });
    } catch (error) {
        return await v1ErrorResponse(error);
    }
}
