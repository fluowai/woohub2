import Link from "next/link";
import { ArrowLeft, ShieldCheck, Scale } from "lucide-react";

export const metadata = {
    title: "Termos de Uso | Woohub",
    description: "Termos de Uso da Woohub, gateway de WhatsApp auto-hospedado. Diretrizes de uso, requisitos de segurança e política de uso aceitável.",
    openGraph: {
        title: "Termos de Uso | Woohub",
        description: "Termos de Uso da Woohub, gateway de WhatsApp auto-hospedado.",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Termos de Uso | Woohub",
        description: "Termos de Uso da Woohub, gateway de WhatsApp auto-hospedado.",
    },
};

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-background relative overflow-hidden py-24 selection:bg-primary/30 selection:text-primary-foreground">
            {/* Ambient background glows */}
            <div className="fixed top-0 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] bg-amber-500/5 dark:bg-amber-500/10 rounded-full blur-[120px] pointer-events-none -z-10" />
            <div className="fixed bottom-0 right-1/4 translate-x-1/2 translate-y-1/2 w-[30rem] h-[30rem] bg-blue-500/5 dark:bg-blue-600/10 rounded-full blur-[100px] pointer-events-none -z-10" />

            <div className="container max-w-4xl px-4 mx-auto relative z-10">

                <Link href="/" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground mb-8 transition-colors group">
                    <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
                    Voltar para a página inicial
                </Link>

                <div className="glass-panel p-8 md:p-12 rounded-3xl shadow-xl shadow-black/5 dark:shadow-black/20 animate-in fade-in slide-in-from-bottom-8 duration-700">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="p-3 bg-primary/10 rounded-2xl">
                            <Scale className="h-8 w-8 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground">Termos de Uso</h1>
                            <p className="text-muted-foreground mt-2">Última atualização: {new Date().toLocaleDateString("pt-BR")}</p>
                        </div>
                    </div>

                    <div className="prose prose-slate dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-primary hover:prose-a:text-primary/80 prose-p:leading-relaxed">

                        <p className="lead text-lg text-muted-foreground mb-8">
                            Bem-vindo à Woohub. Ao acessar ou usar nossa plataforma de gateway de WhatsApp, você concorda
                            em cumprir estes Termos. Se não concorda, por favor, não utilize o serviço.
                        </p>

                        <h2 className="flex items-center gap-2 mt-8 text-2xl border-b pb-2">
                            <ShieldCheck className="h-6 w-6 text-emerald-500" />
                            1. Segurança dos dados e responsabilidade
                        </h2>
                        <p>
                            Segurança é o núcleo do nosso serviço. Como plataforma auto-hospedada, a Woohub garante que
                            seus dados permaneçam estritamente na sua própria infraestrutura.
                        </p>
                        <ul>
                            <li><strong>Seus dados são seus:</strong> não rastreamos, interceptamos nem vendemos suas mensagens do WhatsApp, listas de contatos ou dados de sessão. Suas informações ficam seguras e não são mal utilizadas.</li>
                            <li><strong>Uso seguro:</strong> você é responsável por garantir que seu hardware e seu ambiente de servidor estejam devidamente protegidos.</li>
                            <li><strong>Autenticação:</strong> você deve proteger as credenciais da sua conta. Não compartilhe seus dados de acesso com pessoas não autorizadas.</li>
                        </ul>

                        <h2 className="mt-8 text-2xl border-b pb-2">2. Política de uso aceitável</h2>
                        <p>
                            Ao utilizar a API, as respostas automáticas e os recursos de disparo em massa da Woohub,
                            você concorda em respeitar os Termos de Serviço oficiais do WhatsApp e as políticas
                            anti-spam. Você concorda em não:
                        </p>
                        <ul>
                            <li>Enviar mensagens de "spam" não solicitadas ou campanhas promocionais em massa para usuários que não autorizaram explicitamente o recebimento.</li>
                            <li>Usar a plataforma para distribuir software malicioso, links de phishing ou conteúdo ilegal.</li>
                            <li>Tentar fazer engenharia reversa da API principal ou sobrecarregar o serviço com requisições excessivas.</li>
                        </ul>

                        <h2 className="mt-8 text-2xl border-b pb-2">3. Integridade da conta</h2>
                        <p>
                            A Woohub oferece ferramentas para gerenciar várias sessões do WhatsApp. É essencial monitorar
                            seus aparelhos ativos. Se você desconfiar de acesso não autorizado ao painel, troque sua senha
                            imediatamente e revogue as sessões do WhatsApp conectadas a partir do seu aparelho físico.
                        </p>

                        <h2 className="mt-8 text-2xl border-b pb-2">4. Isenções e limitações</h2>
                        <p>
                            A Woohub é fornecida "como está", sem garantias de qualquer tipo. Utilizamos bibliotecas de
                            terceiros (como o Baileys) para conectar aos protocolos do WhatsApp Web. Mudanças nos
                            sistemas internos do WhatsApp podem ocasionalmente interromper o serviço. Não nos
                            responsabilizamos por suspensões ou banimentos de conta impostos pelo WhatsApp em
                            consequência do seu uso.
                        </p>

                        <div className="mt-12 p-6 bg-primary/5 rounded-2xl border border-primary/10">
                            <p className="font-semibold mb-2">Tem dúvidas sobre estes termos?</p>
                            <p className="text-sm text-muted-foreground mb-0">
                                Consulte nossa <Link href="/docs">documentação</Link> ou fale com os mantenedores do
                                projeto para mais esclarecimentos.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
