"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Zap,
  Shield,
  MessageSquare,
  Clock,
  Code,
  CheckCircle2,
  ChevronDown,
  Sparkles,
  Server,
  Users,
  Layers,
  HelpCircle,
  Copy,
  Check,
  Smartphone,
  Send,
  Lock,
  Headphones,
  Flame,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  const [copied, setCopied] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  const copyCode = () => {
    const code = `curl -X POST "https://api.woohub.app/v1/messages/send-text" \\
  -H "X-API-Key: sua_chave_woohub" \\
  -H "Content-Type: application/json" \\
  -d '{
    "sessionId": "instancia-vendas-01",
    "to": "5511999998888",
    "text": "Olá! Sua mensagem foi enviada com sucesso pela Woohub 🚀"
  }'`;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleFaq = (index: number) => {
    setActiveFaq(activeFaq === index ? null : index);
  };

  const discountMultiplier = billingPeriod === "yearly" ? 0.8 : 1;

  const plans = [
    {
      id: "starter",
      name: "Starter",
      badge: "Iniciante",
      description: "Ideal para profissionais autônomos e pequenos negócios automatizarem seu WhatsApp.",
      monthlyPrice: 49.9,
      instances: 1,
      popular: false,
      features: [
        "1 Instância de WhatsApp ativa",
        "Cota mensal conforme o plano",
        "Conexão via QR Code em segundos",
        "Webhooks em tempo real",
        "API REST com documentação",
        "Envio de textos, áudios e mídias",
        "Suporte técnico via chamado",
      ],
      cta: "Contratar Starter",
      highlight: false,
    },
    {
      id: "pro",
      name: "Profissional",
      badge: "Mais Escolhido 🔥",
      description: "Para empresas que precisam de múltiplos números, atendimento veloz e alta performance.",
      monthlyPrice: 129.9,
      instances: 5,
      popular: true,
      features: [
        "5 Instâncias de WhatsApp simultâneas",
        "Cotas ampliadas de mensagens e contatos",
        "Disparo inteligente com atraso humanizado",
        "Automações e respostas inteligentes",
        "Agendamento de mensagens futuras",
        "Webhooks e API REST de alta velocidade",
        "Monitor de conexão e reconexão automática",
        "Suporte prioritário via WhatsApp",
      ],
      cta: "Garantir Plano Pro",
      highlight: true,
    },
    {
      id: "business",
      name: "Empresarial",
      badge: "Alta Escala",
      description: "Para agências, e-commerces e equipes comerciais com tráfego intenso de mensagens.",
      monthlyPrice: 279.9,
      instances: 15,
      popular: false,
      features: [
        "15 Instâncias de WhatsApp simultâneas",
        "Fila prioritária com velocidade máxima",
        "Múltiplos usuários e gestão de equipe",
        "Chaves de API ilimitadas com permissões",
        "Integração direta com CRMs e Webhooks",
        "Monitoramento de conexão e consumo",
        "Suporte comercial prioritário",
        "Gerente de conta e suporte VIP",
      ],
      cta: "Contratar Empresarial",
      highlight: false,
    },
    {
      id: "reseller",
      name: "Revenda White Label",
      badge: "Sua Marca",
      description: "Monte sua própria agência ou SaaS revendendo instâncias com sua marca e domínio próprio.",
      monthlyPrice: 449.9,
      instances: 30,
      popular: false,
      features: [
        "30 Instâncias para revender a seus clientes",
        "Painel 100% White Label com sua logomarca",
        "Domínio próprio (ex: api.suaempresa.com.br)",
        "Gestão comercial dos seus revendedores e clientes",
        "Controle de planos, limites e preços de venda",
        "Isolamento completo e segurança total",
        "Infraestrutura dedicada de alto rendimento",
        "Acompanhamento técnico exclusivo",
      ],
      cta: "Quero Ser Revendedor",
      highlight: false,
    },
  ];

  const faqs = [
    {
      q: "O que é uma instância de WhatsApp na Woohub?",
      a: "Uma instância representa um número de WhatsApp conectado à plataforma. Com ela, você pode enviar e receber mensagens, mídias, áudios, disparar alertas automáticos e integrar com seus sistemas via API através de um único painel intuitivo.",
    },
    {
      q: "Como faço para conectar meu WhatsApp na instância?",
      a: "O processo é idêntico ao WhatsApp Web: após assinar seu plano, você acessa o painel da Woohub, clica em 'Criar Instância' e lê o QR Code gerado na tela com o seu celular. A conexão é estabelecida em menos de 10 segundos.",
    },
    {
      q: "Existe limite de mensagens que posso enviar por mês?",
      a: "Cada plano possui cotas e limites publicados no painel. O consumo pode ser consultado em tempo real e o upgrade pode ser solicitado quando necessário.",
    },
    {
      q: "A Woohub protege contra bloqueios de número?",
      a: "Não. A WooHub é uma API não oficial e não garante ausência de bloqueios, entrega de mensagens ou disponibilidade de recursos específicos do WhatsApp. Use somente contatos com consentimento e respeite as regras de envio.",
    },
    {
      q: "Consigo integrar com Typebot, n8n, Make e CRMs?",
      a: "Sim. A WooHub oferece API REST, webhooks assinados, documentação OpenAPI, MCP e exemplos para integração com n8n, Chatwoot, Typebot e CRMs que aceitem HTTP ou webhooks.",
    },
    {
      q: "Posso trocar o número de WhatsApp de uma instância?",
      a: "O primeiro número conectado fica registrado na instância. Para usar outro número, fale com o suporte da WooHub para avaliar a troca ou criar uma nova instância.",
    },
    {
      q: "Como funciona a contratação e ativação?",
      a: "A contratação é imediata. Assim que você escolhe seu plano e conclui o cadastro, seu acesso ao painel da Woohub é liberado instantaneamente e você já pode subir suas primeiras instâncias.",
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900 selection:bg-[#ff5a00]/20 selection:text-[#ea5300]">
      <div className="bg-slate-950 px-4 py-2 text-center text-xs text-slate-200">
        A WooHub é uma plataforma independente e não oficial. Não somos afiliados ao WhatsApp ou à Meta.
      </div>
      {/* Top Notification Banner */}
      <div className="bg-gradient-to-r from-[#ff5a00] to-[#ea5300] text-white py-2 px-4 text-center text-xs sm:text-sm font-medium shadow-xs">
        <span className="inline-flex items-center gap-2">
          <Flame className="h-4 w-4 animate-bounce" />
          <span><strong>Oferta Especial:</strong> Assine qualquer plano no ciclo anual e ganhe <strong>20% de desconto</strong> imediato!</span>
        </span>
      </div>

      {/* Floating Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-[#ff5a00] to-[#ff843d] flex items-center justify-center text-white shadow-md shadow-[#ff5a00]/20 group-hover:scale-105 transition-transform">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none">
                <circle cx="8" cy="12" r="4.5" fill="currentColor" />
                <circle cx="15.5" cy="12" r="5" stroke="currentColor" strokeWidth="2.5" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-black tracking-tight text-slate-950">woohub</span>
              <span className="text-[10px] font-semibold tracking-wider uppercase text-[#ff5a00] -mt-1">Instâncias de WhatsApp</span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden lg:flex items-center gap-8">
            <a href="#recursos" className="text-sm font-semibold text-slate-600 hover:text-[#ff5a00] transition-colors">
              Recursos
            </a>
            <a href="#como-funciona" className="text-sm font-semibold text-slate-600 hover:text-[#ff5a00] transition-colors">
              Como Funciona
            </a>
            <a href="#planos" className="text-sm font-semibold text-slate-600 hover:text-[#ff5a00] transition-colors">
              Planos & Preços
            </a>
            <a href="#integracoes" className="text-sm font-semibold text-slate-600 hover:text-[#ff5a00] transition-colors">
              API & Integrações
            </a>
            <a href="#faq" className="text-sm font-semibold text-slate-600 hover:text-[#ff5a00] transition-colors">
              Dúvidas
            </a>
          </nav>

          {/* Action CTAs */}
          <div className="flex items-center gap-3">
            <Link href="/auth/login">
              <Button variant="ghost" className="font-semibold text-slate-700 hover:text-slate-950 hover:bg-slate-100">
                Entrar
              </Button>
            </Link>
            <a href="#planos">
              <Button className="bg-[#ff5a00] hover:bg-[#ea5300] text-white font-bold px-5 sm:px-6 shadow-md shadow-[#ff5a00]/25 rounded-xl transition-all hover:shadow-lg hover:shadow-[#ff5a00]/35 hover:-translate-y-0.5">
                Contratar Instância
              </Button>
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* HERO SECTION */}
        <section className="relative pt-12 pb-20 lg:pt-20 lg:pb-32 overflow-hidden bg-gradient-to-b from-orange-50/40 via-white to-white">
          {/* Subtle Glows */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-orange-300/20 to-amber-200/20 rounded-full blur-[140px] pointer-events-none -z-10" />

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-4xl mx-auto space-y-6">
              {/* Top Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-100/80 border border-orange-200 text-[#ea5300] text-xs sm:text-sm font-bold shadow-2xs">
                <Sparkles className="h-4 w-4 text-[#ff5a00]" />
                <span>A PLATAFORMA Nº 1 PARA VENDA E ESCALA DE INSTÂNCIAS DE WHATSAPP</span>
              </div>

              {/* Main Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-950 leading-[1.12]">
                Conecte, Automatize e Escale suas{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ff5a00] to-[#ea5300]">
                  Instâncias de WhatsApp
                </span>
              </h1>

              {/* Subheadline */}
              <p className="text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed font-normal">
                Conecte seus números via QR Code, envie mensagens, receba webhooks em tempo real e integre seus sistemas pela API REST da WooHub.
              </p>

              {/* Hero Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
                <a href="#planos" className="w-full sm:w-auto">
                  <Button size="lg" className="w-full sm:w-auto h-14 px-8 rounded-xl bg-[#ff5a00] hover:bg-[#ea5300] text-white font-extrabold text-base shadow-xl shadow-[#ff5a00]/30 hover:shadow-2xl hover:shadow-[#ff5a00]/40 transition-all hover:-translate-y-0.5">
                    Garantir Minhas Instâncias Agora
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </a>
                <Link href="/docs" className="w-full sm:w-auto">
                  <Button size="lg" variant="outline" className="w-full sm:w-auto h-14 px-8 rounded-xl border-slate-300 font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-950">
                    Ver Documentação da API
                  </Button>
                </Link>
              </div>

              {/* Trust Badges */}
              <div className="pt-10 grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-3xl mx-auto text-left border-t border-slate-200/80 mt-10">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-orange-100 flex items-center justify-center text-[#ff5a00] font-bold">
                    ⚡
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900">QR Code Instantâneo</div>
                    <div className="text-xs text-slate-500">Conexão em 10 segundos</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold">
                    ✓
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900">99,9% Uptime</div>
                    <div className="text-xs text-slate-500">Infraestrutura blindada</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                    🚀
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900">Envios Ilimitados</div>
                    <div className="text-xs text-slate-500">Sem custos por mensagem</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600 font-bold">
                    🛡️
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900">API Blindada</div>
                    <div className="text-xs text-slate-500">Chaves e isolamento total</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Interactive Preview Card / Mockup */}
            <div className="mt-16 max-w-5xl mx-auto bg-slate-900 rounded-3xl p-4 sm:p-8 shadow-2xl border border-slate-800 relative overflow-hidden">
              <div className="absolute -top-32 -right-32 w-80 h-80 bg-[#ff5a00]/20 rounded-full blur-3xl pointer-events-none" />

              {/* Panel Top Bar */}
              <div className="flex items-center justify-between pb-6 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-red-500/80" />
                  <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
                  <div className="h-3 w-3 rounded-full bg-green-500/80" />
                  <span className="text-xs text-slate-400 font-mono ml-2">painel.woohub.app — Gestão em Tempo Real</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/20">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    Gateway Operacional 100%
                  </span>
                </div>
              </div>

              {/* Dashboard Preview Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6">
                {/* Instance Card 1 */}
                <div className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700/60">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Instância #01 • Vendas</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 text-[10px] font-bold">CONECTADA</span>
                  </div>
                  <div className="text-lg font-bold text-white flex items-center gap-2">
                    <Smartphone className="h-5 w-5 text-[#ff5a00]" />
                    +55 11 98765-4321
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-slate-400 border-t border-slate-700/50 pt-3">
                    <span>Mensagens hoje: <strong className="text-white">14.820</strong></span>
                    <span className="text-emerald-400 font-semibold">100% entregues</span>
                  </div>
                </div>

                {/* Instance Card 2 */}
                <div className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700/60">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Instância #02 • Suporte</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 text-[10px] font-bold">CONECTADA</span>
                  </div>
                  <div className="text-lg font-bold text-white flex items-center gap-2">
                    <Smartphone className="h-5 w-5 text-[#ff5a00]" />
                    +55 21 97654-3210
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-slate-400 border-t border-slate-700/50 pt-3">
                    <span>Chatbot Ativo: <strong className="text-white">24h</strong></span>
                    <span className="text-orange-400 font-semibold">Latência: 45ms</span>
                  </div>
                </div>

                {/* Instance Card 3 */}
                <div className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700/60">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Instância #03 • Cobrança</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 text-[10px] font-bold">CONECTADA</span>
                  </div>
                  <div className="text-lg font-bold text-white flex items-center gap-2">
                    <Smartphone className="h-5 w-5 text-[#ff5a00]" />
                    +55 31 96543-2109
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-slate-400 border-t border-slate-700/50 pt-3">
                    <span>Disparos em fila: <strong className="text-white">0 (Livre)</strong></span>
                    <span className="text-emerald-400 font-semibold">Webhooks OK</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* WHY WOOHUB SECTION */}
        <section id="recursos" className="py-24 bg-slate-50 border-y border-slate-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
              <span className="text-xs font-bold uppercase tracking-wider text-[#ff5a00] bg-orange-100/70 px-3 py-1 rounded-full border border-orange-200">
                Poder e Robustez
              </span>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-950 tracking-tight">
                Tudo o que sua Empresa Precisa para Dominar o WhatsApp
              </h2>
              <p className="text-base sm:text-lg text-slate-600">
                A Woohub foi desenvolvida do zero para oferecer estabilidade máxima, segurança nas sessões e facilidade de integração.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {/* Feature 1 */}
              <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-xl hover:border-orange-200 transition-all group">
                <div className="h-14 w-14 rounded-2xl bg-orange-100/80 flex items-center justify-center text-[#ff5a00] mb-6 group-hover:scale-110 transition-transform">
                  <Smartphone className="h-7 w-7" />
                </div>
                <h3 className="text-xl font-bold text-slate-950 mb-3">Conexão Instantânea via QR Code</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Conecte um número de WhatsApp pelo QR Code. O painel acompanha o estado da sessão e permite reconexão conforme a disponibilidade do serviço.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-xl hover:border-orange-200 transition-all group">
                <div className="h-14 w-14 rounded-2xl bg-orange-100/80 flex items-center justify-center text-[#ff5a00] mb-6 group-hover:scale-110 transition-transform">
                  <Zap className="h-7 w-7" />
                </div>
                <h3 className="text-xl font-bold text-slate-950 mb-3">Webhooks em Tempo Real</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Receba eventos instantâneos de mensagens recebidas, confirmações de entrega, status de leitura e alterações de conexão diretamente no seu endpoint.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-xl hover:border-orange-200 transition-all group">
                <div className="h-14 w-14 rounded-2xl bg-orange-100/80 flex items-center justify-center text-[#ff5a00] mb-6 group-hover:scale-110 transition-transform">
                  <Shield className="h-7 w-7" />
                </div>
                <h3 className="text-xl font-bold text-slate-950 mb-3">Disparo Humanizado & Anti-Ban</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Configure filas, agendamentos e controles de envio para organizar suas automações. A WooHub não garante ausência de bloqueios; use somente contatos com consentimento.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-xl hover:border-orange-200 transition-all group">
                <div className="h-14 w-14 rounded-2xl bg-orange-100/80 flex items-center justify-center text-[#ff5a00] mb-6 group-hover:scale-110 transition-transform">
                  <MessageSquare className="h-7 w-7" />
                </div>
                <h3 className="text-xl font-bold text-slate-950 mb-3">Chatbots & Respostas Automáticas</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Configure fluxos de respostas automáticas por palavras-chave ou conecte seu agente de inteligência artificial para atender clientes 24 horas por dia.
                </p>
              </div>

              {/* Feature 5 */}
              <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-xl hover:border-orange-200 transition-all group">
                <div className="h-14 w-14 rounded-2xl bg-orange-100/80 flex items-center justify-center text-[#ff5a00] mb-6 group-hover:scale-110 transition-transform">
                  <Layers className="h-7 w-7" />
                </div>
                <h3 className="text-xl font-bold text-slate-950 mb-3">Multi-Instâncias e Isolamento</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Gerencie de 1 a dezenas de números de WhatsApp com isolamento completo de dados, banco de dados seguro e controle de permissões por usuário.
                </p>
              </div>

              {/* Feature 6 */}
              <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-xl hover:border-orange-200 transition-all group">
                <div className="h-14 w-14 rounded-2xl bg-orange-100/80 flex items-center justify-center text-[#ff5a00] mb-6 group-hover:scale-110 transition-transform">
                  <Headphones className="h-7 w-7" />
                </div>
                <h3 className="text-xl font-bold text-slate-950 mb-3">Suporte Técnico Especializado</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Conte com suporte humanizado em Português para ajudar em integrações, dúvidas sobre a API e otimização dos seus disparos diários.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS SECTION */}
        <section id="como-funciona" className="py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
              <span className="text-xs font-bold uppercase tracking-wider text-[#ff5a00] bg-orange-100/70 px-3 py-1 rounded-full border border-orange-200">
                Simples e Rápido
              </span>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-950 tracking-tight">
                Em 3 Passos sua Operação Está no Ar
              </h2>
              <p className="text-base sm:text-lg text-slate-600">
                Você não precisa de infraestrutura complexa. Tudo funciona pronto para usar na nuvem da Woohub.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
              {/* Step 1 */}
              <div className="bg-orange-50/50 p-8 rounded-3xl border border-orange-100 relative">
                <div className="text-6xl font-black text-orange-200 mb-4">01</div>
                <h3 className="text-xl font-bold text-slate-950 mb-2">Escolha seu Plano</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Selecione a quantidade de instâncias que seu negócio precisa e conclua seu cadastro em menos de 1 minuto.
                </p>
              </div>

              {/* Step 2 */}
              <div className="bg-orange-50/50 p-8 rounded-3xl border border-orange-100 relative">
                <div className="text-6xl font-black text-orange-200 mb-4">02</div>
                <h3 className="text-xl font-bold text-slate-950 mb-2">Escaneie o QR Code</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Abra o WhatsApp no seu smartphone, aponte a câmera para o QR Code gerado no painel da Woohub e conecte instantaneamente.
                </p>
              </div>

              {/* Step 3 */}
              <div className="bg-orange-50/50 p-8 rounded-3xl border border-orange-100 relative">
                <div className="text-6xl font-black text-orange-200 mb-4">03</div>
                <h3 className="text-xl font-bold text-slate-950 mb-2">Envie e Automatize</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Gere sua chave de API ou conecte com n8n, Typebot, Make ou CRM e comece a enviar mensagens em escala imediatamente!
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* PRICING PLANS SECTION (CORE SALES ELEMENT) */}
        <section id="planos" className="py-24 bg-slate-900 text-white relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#ff5a00]/10 rounded-full blur-[160px] pointer-events-none" />

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
              <span className="text-xs font-bold uppercase tracking-wider text-[#ff5a00] bg-orange-500/10 px-3 py-1 rounded-full border border-orange-500/20">
                Planos Comerciais de Instâncias
              </span>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white">
                Escolha o Pacote Ideal de Instâncias para seu Negócio
              </h2>
              <p className="text-base sm:text-lg text-slate-400">
                Preço fixo por instâncias ativas. Sem pegadinhas, sem taxas extras por mensagem enviada.
              </p>

              {/* Billing Toggle (Monthly / Yearly) */}
              <div className="pt-4 flex items-center justify-center gap-3">
                <button
                  onClick={() => setBillingPeriod("monthly")}
                  className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                    billingPeriod === "monthly"
                      ? "bg-[#ff5a00] text-white shadow-md shadow-[#ff5a00]/30"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Mensal
                </button>
                <button
                  onClick={() => setBillingPeriod("yearly")}
                  className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 ${
                    billingPeriod === "yearly"
                      ? "bg-[#ff5a00] text-white shadow-md shadow-[#ff5a00]/30"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <span>Anual</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-black uppercase">
                    Economize 20%
                  </span>
                </button>
              </div>
            </div>

            {/* Plans Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {plans.map((p) => {
                const finalPrice = (p.monthlyPrice * discountMultiplier).toFixed(2).replace(".", ",");

                return (
                  <div
                    key={p.id}
                    className={`rounded-3xl p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 relative ${
                      p.highlight
                        ? "bg-slate-800 border-2 border-[#ff5a00] shadow-2xl shadow-[#ff5a00]/20 scale-105 z-20"
                        : "bg-slate-800/60 border border-slate-700/60 hover:border-slate-600 shadow-xl"
                    }`}
                  >
                    {/* Badge */}
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-lg font-black text-white">{p.name}</span>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                          p.highlight
                            ? "bg-[#ff5a00] text-white"
                            : "bg-slate-700 text-slate-300"
                        }`}
                      >
                        {p.badge}
                      </span>
                    </div>

                    {/* Price Header */}
                    <div className="mb-6">
                      <div className="flex items-baseline gap-1">
                        <span className="text-xs text-slate-400 font-semibold">R$</span>
                        <span className="text-4xl sm:text-5xl font-black text-white">{finalPrice}</span>
                        <span className="text-xs text-slate-400 font-medium">/mês</span>
                      </div>
                      <div className="mt-2 text-xs font-bold text-[#ff843d] flex items-center gap-1">
                        <Smartphone className="h-3.5 w-3.5" />
                        <span>{p.instances} {p.instances === 1 ? "Instância inclusa" : "Instâncias simultâneas"}</span>
                      </div>
                      <p className="mt-3 text-xs text-slate-400 leading-relaxed min-h-[36px]">
                        {p.description}
                      </p>
                    </div>

                    {/* Features List */}
                    <ul className="space-y-3 mb-8 border-t border-slate-700/60 pt-6 flex-1">
                      {p.features.map((feat, idx) => (
                        <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-300 leading-normal">
                          <CheckCircle2 className="h-4 w-4 text-[#ff5a00] flex-shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA Button */}
                    <Link href={`/auth/register?plan=${p.id}`} className="w-full">
                      <Button
                        className={`w-full h-12 rounded-xl font-bold text-sm transition-all shadow-md ${
                          p.highlight
                            ? "bg-[#ff5a00] hover:bg-[#ea5300] text-white shadow-[#ff5a00]/30 hover:shadow-lg hover:shadow-[#ff5a00]/40"
                            : "bg-slate-700 hover:bg-slate-600 text-white"
                        }`}
                      >
                        {p.cta}
                      </Button>
                    </Link>
                  </div>
                );
              })}
            </div>

            {/* Custom High Volume Banner */}
            <div className="mt-16 p-8 rounded-3xl bg-slate-800/80 border border-slate-700 flex flex-col md:flex-row items-center justify-between gap-6">
              <div>
                <h3 className="text-xl font-bold text-white mb-2">Precisa de mais de 50 instâncias ou infraestrutura dedicada?</h3>
                <p className="text-slate-400 text-sm">
                  Criamos clusters personalizados de instâncias com servidores dedicados e suporte exclusivo para grandes operações.
                </p>
              </div>
              <Link href="/auth/register">
                <Button variant="outline" className="h-12 px-8 rounded-xl border-slate-600 text-white font-bold hover:bg-slate-700 whitespace-nowrap">
                  Falar com Especialista
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* API & INTEGRATIONS CODE SHOWCASE */}
        <section id="integracoes" className="py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              {/* Left Column Text */}
              <div className="space-y-6">
                <span className="text-xs font-bold uppercase tracking-wider text-[#ff5a00] bg-orange-100/70 px-3 py-1 rounded-full border border-orange-200">
                  Pronto para Desenvolvedores e No-Code
                </span>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-950 tracking-tight">
                  Envie Mensagens com Poucas Linhas de Código
                </h2>
                <p className="text-slate-600 text-base sm:text-lg leading-relaxed">
                  A API da Woohub segue os mais rigorosos padrões RESTful. Você pode disparar textos, mídias, áudios e gerenciar contatos usando qualquer linguagem de programação ou ferramentas como n8n e Typebot.
                </p>

                <div className="space-y-4 pt-2">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-[#ff5a00] flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-900 block text-sm">Autenticação Segura via Headers</strong>
                      <span className="text-slate-500 text-xs">Chaves com hash sha256 e controle restrito de instâncias.</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-[#ff5a00] flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-900 block text-sm">Documentação Swagger Completa</strong>
                      <span className="text-slate-500 text-xs">Explore todas as rotas com exemplos práticos em cURL, JavaScript e Python.</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-[#ff5a00] flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-900 block text-sm">Webhooks com Assinatura Criptográfica</strong>
                      <span className="text-slate-500 text-xs">Valide a autenticidade de cada payload recebido com assinatura HMAC.</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex items-center gap-4">
                  <Link href="/docs">
                    <Button className="bg-[#ff5a00] hover:bg-[#ea5300] text-white font-bold px-6 h-12 rounded-xl shadow-md shadow-[#ff5a00]/20">
                      Explorar Documentação
                    </Button>
                  </Link>
                  <Link href="/swagger">
                    <Button variant="outline" className="font-bold border-slate-300 h-12 rounded-xl text-slate-700">
                      Abrir Swagger UI
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Right Column Code Block */}
              <div className="bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-800 text-slate-300 relative">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-red-500/80" />
                    <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
                    <span className="h-3 w-3 rounded-full bg-green-500/80" />
                    <span className="text-xs text-slate-400 font-mono ml-2">Exemplo de Envio • POST /v1/messages/send-text</span>
                  </div>
                  <button
                    onClick={copyCode}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-emerald-400 font-medium">Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copiar cURL</span>
                      </>
                    )}
                  </button>
                </div>

                <pre className="text-xs sm:text-sm font-mono overflow-x-auto text-slate-300 leading-relaxed py-2">
                  <code>{`curl -X POST "https://api.woohub.app/v1/messages/send-text" \\
  -H "X-API-Key: whk_live_a8f9c104e7" \\
  -H "Content-Type: application/json" \\
  -d '{
    "sessionId": "minha-instancia-01",
    "to": "5511999998888",
    "text": "Olá! Sua compra foi confirmada pela Woohub 🚀"
  }'`}</code>
                </pre>

                <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <span>Resposta Esperada: <strong className="text-emerald-400 font-mono">200 OK</strong></span>
                  <span className="font-mono text-slate-500">Tempo de Resposta: 42ms</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FREQUENTLY ASKED QUESTIONS (FAQ) */}
        <section id="faq" className="py-24 bg-slate-50 border-t border-slate-100">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16 space-y-4">
              <span className="text-xs font-bold uppercase tracking-wider text-[#ff5a00] bg-orange-100/70 px-3 py-1 rounded-full border border-orange-200">
                Tire suas Dúvidas
              </span>
              <h2 className="text-3xl sm:text-4xl font-black text-slate-950 tracking-tight">
                Perguntas Frequentes sobre as Instâncias
              </h2>
              <p className="text-base text-slate-600">
                Tudo o que você precisa saber antes de contratar sua instância na Woohub.
              </p>
            </div>

            <div className="space-y-4">
              {faqs.map((faq, idx) => {
                const isOpen = activeFaq === idx;

                return (
                  <div
                    key={idx}
                    className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden transition-all"
                  >
                    <button
                      onClick={() => toggleFaq(idx)}
                      className="w-full p-6 text-left flex items-center justify-between gap-4 font-bold text-slate-900 hover:text-[#ff5a00] transition-colors"
                    >
                      <span className="text-base sm:text-lg">{faq.q}</span>
                      <ChevronDown
                        className={`h-5 w-5 text-slate-400 transition-transform duration-200 ${
                          isOpen ? "rotate-180 text-[#ff5a00]" : ""
                        }`}
                      />
                    </button>
                    {isOpen && (
                      <div className="px-6 pb-6 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-4">
                        {faq.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* FINAL CONVERSION CTA */}
        <section className="py-20 bg-gradient-to-r from-[#ff5a00] to-[#ea5300] text-white text-center relative overflow-hidden">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 space-y-6">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight">
              Pronto para Conectar suas Instâncias com Máxima Estabilidade?
            </h2>
            <p className="text-orange-100 text-base sm:text-lg max-w-2xl mx-auto font-normal">
              Comece agora mesmo a automatizar seu WhatsApp com a Woohub. Configuração em menos de 2 minutos.
            </p>
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
              <a href="#planos">
                <Button size="lg" className="h-14 px-10 rounded-xl bg-white text-[#ea5300] hover:bg-orange-50 font-black text-base shadow-xl hover:shadow-2xl hover:scale-105 transition-all">
                  Escolher Meu Plano de Instâncias
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </a>
              <Link href="/auth/login">
                <Button size="lg" variant="outline" className="h-14 px-8 rounded-xl border-white/40 text-white font-bold hover:bg-white/10 hover:border-white">
                  Já Tenho uma Conta
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* CORPORATE FOOTER (100% WOOHUB BRANDED, NO GITHUB, NO REPO) */}
      <footer className="bg-slate-950 text-slate-400 py-16 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
            {/* Col 1 Brand */}
            <div className="space-y-4 md:col-span-1">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-[#ff5a00] flex items-center justify-center text-white font-bold">
                  W
                </div>
                <span className="text-xl font-black text-white">woohub</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Plataforma corporativa de instâncias de WhatsApp com alta disponibilidade, disparos inteligentes e API REST para empresas e revendedores.
              </p>
            </div>

            {/* Col 2 Links */}
            <div>
              <h4 className="text-white text-sm font-bold mb-4 uppercase tracking-wider">Plataforma</h4>
              <ul className="space-y-2.5 text-xs">
                <li><a href="#recursos" className="hover:text-white transition-colors">Recursos Principais</a></li>
                <li><a href="#como-funciona" className="hover:text-white transition-colors">Como Funciona</a></li>
                <li><a href="#planos" className="hover:text-white transition-colors">Planos de Instâncias</a></li>
                <li><a href="#integracoes" className="hover:text-white transition-colors">Integrações No-Code</a></li>
              </ul>
            </div>

            {/* Col 3 Docs */}
            <div>
              <h4 className="text-white text-sm font-bold mb-4 uppercase tracking-wider">Desenvolvedores</h4>
              <ul className="space-y-2.5 text-xs">
                <li><Link href="/docs" className="hover:text-white transition-colors">Documentação da API</Link></li>
                <li><Link href="/swagger" className="hover:text-white transition-colors">Referência Swagger UI</Link></li>
                <li><Link href="/auth/login" className="hover:text-white transition-colors">Acessar Painel</Link></li>
              </ul>
            </div>

            {/* Col 4 Legal */}
            <div>
              <h4 className="text-white text-sm font-bold mb-4 uppercase tracking-wider">Legal & Suporte</h4>
              <ul className="space-y-2.5 text-xs">
                <li><Link href="/terms" className="hover:text-white transition-colors">Termos de Uso</Link></li>
                <li><Link href="/privacy" className="hover:text-white transition-colors">Política de Privacidade</Link></li>
                <li><span className="text-slate-500">Suporte: suporte@woohub.app</span></li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
            <p>© {new Date().getFullYear()} Woohub. Todos os direitos reservados. Feito para empresas modernas.</p>
            <p className="text-slate-600">Alta Disponibilidade • Infraestrutura Segura • API REST Profissional</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
