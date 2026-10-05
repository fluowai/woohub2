/** Representação pública de uma mensagem na API v1 (pt-BR, sem dados internos). */

export interface MessageRecord {
    id: string;
    keyId: string;
    remoteJid: string;
    senderJid: string | null;
    fromMe: boolean;
    pushName: string | null;
    type: string;
    content: string | null;
    mediaUrl: string | null;
    status: string;
    timestamp: Date;
    quoteId: string | null;
}

export function mapMessage(m: MessageRecord) {
    return {
        id: m.id,
        key_id: m.keyId,
        jid: m.remoteJid,
        sender: m.senderJid,
        from_me: m.fromMe,
        push_name: m.pushName,
        type: m.type,
        content: m.content,
        media_url: m.mediaUrl,
        status: m.status,
        quote_id: m.quoteId,
        timestamp: m.timestamp.toISOString(),
    };
}
