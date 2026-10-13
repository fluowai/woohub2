'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { AlertCircle, ShieldAlert, Lock, Hourglass, HelpCircle, ArrowLeft, Home, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorConfig {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  description: string;
  colorTheme: 'amber' | 'rose' | 'destructive' | 'indigo' | 'primary';
}

const ERROR_CONFIGS: Record<string, ErrorConfig> = {
  '400': {
    icon: <AlertCircle className="size-12 animate-pulse" />,
    title: '400',
    subtitle: 'Requisição Inválida',
    description: 'O servidor não pôde processar sua solicitação devido a formato ou parâmetros inválidos.',
    colorTheme: 'amber',
  },
  '401': {
    icon: <Lock className="size-12 animate-pulse" />,
    title: '401',
    subtitle: 'Acesso Não Autorizado',
    description: 'Você precisa efetuar login para acessar esta página ou recurso da plataforma.',
    colorTheme: 'rose',
  },
  '403': {
    icon: <ShieldAlert className="size-12 animate-pulse" />,
    title: '403',
    subtitle: 'Acesso Proibido',
    description: 'Você não possui permissão suficiente para acessar este recurso ou empresa.',
    colorTheme: 'destructive',
  },
  '404': {
    icon: <AlertCircle className="size-12 animate-pulse" />,
    title: '404',
    subtitle: 'Recurso Não Encontrado',
    description: 'A página ou endpoint solicitado não existe ou foi removido do servidor.',
    colorTheme: 'primary',
  },
  '429': {
    icon: <Hourglass className="size-12 animate-pulse" />,
    title: '429',
    subtitle: 'Limite de Requisições Atingido',
    description: 'Muitas tentativas em pouco tempo. Por favor, aguarde alguns instantes antes de tentar novamente.',
    colorTheme: 'indigo',
  },
  '500': {
    icon: <AlertCircle className="size-12 animate-pulse" />,
    title: '500',
    subtitle: 'Erro Interno do Servidor',
    description: 'Ocorreu uma falha inesperada em nossos servidores durante o processamento da sua solicitação.',
    colorTheme: 'destructive',
  },
};

function ErrorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const code = searchParams.get('code') || '500';
  const customMessage = searchParams.get('message');

  useEffect(() => {
    setMounted(true);
  }, []);

  const config = ERROR_CONFIGS[code] || {
    icon: <HelpCircle className="size-12 animate-pulse" />,
    title: code,
    subtitle: 'Ocorreu um Erro',
    description: customMessage || 'Ocorreu um erro ou instabilidade inesperada na aplicação.',
    colorTheme: 'primary',
  };

  const COLOR_THEMES = {
    amber: { text: 'text-amber-500', bg: 'bg-amber-500', bgSoft: 'bg-amber-500/10', border: 'border-amber-500/20', hoverBg: 'hover:bg-amber-500/10', hoverText: 'hover:text-amber-500', from: 'from-amber-500/15', ring: 'ring-amber-500/5', shadow: 'shadow-amber-500/10', btnShadow: 'shadow-amber-500/20' },
    rose: { text: 'text-rose-500', bg: 'bg-rose-500', bgSoft: 'bg-rose-500/10', border: 'border-rose-500/20', hoverBg: 'hover:bg-rose-500/10', hoverText: 'hover:text-rose-500', from: 'from-rose-500/15', ring: 'ring-rose-500/5', shadow: 'shadow-rose-500/10', btnShadow: 'shadow-rose-500/20' },
    destructive: { text: 'text-destructive', bg: 'bg-destructive', bgSoft: 'bg-destructive/10', border: 'border-destructive/20', hoverBg: 'hover:bg-destructive/10', hoverText: 'hover:text-destructive', from: 'from-destructive/15', ring: 'ring-destructive/5', shadow: 'shadow-destructive/10', btnShadow: 'shadow-destructive/20' },
    indigo: { text: 'text-indigo-500', bg: 'bg-indigo-500', bgSoft: 'bg-indigo-500/10', border: 'border-indigo-500/20', hoverBg: 'hover:bg-indigo-500/10', hoverText: 'hover:text-indigo-500', from: 'from-indigo-500/15', ring: 'ring-indigo-500/5', shadow: 'shadow-indigo-500/10', btnShadow: 'shadow-indigo-500/20' },
    primary: { text: 'text-primary', bg: 'bg-primary', bgSoft: 'bg-primary/10', border: 'border-primary/20', hoverBg: 'hover:bg-primary/10', hoverText: 'hover:text-primary', from: 'from-primary/15', ring: 'ring-primary/5', shadow: 'shadow-primary/10', btnShadow: 'shadow-primary/20' },
  };
  
  const colorMap = COLOR_THEMES[config.colorTheme as keyof typeof COLOR_THEMES] || COLOR_THEMES['primary'];

  if (!mounted) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 min-h-[80vh]" suppressHydrationWarning>
        <div className={`w-10 h-10 rounded-full border-4 ${colorMap.border} border-t-transparent animate-spin`} suppressHydrationWarning />
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-6 md:p-8 min-h-[85vh] w-full" suppressHydrationWarning>
      <div className={`w-full max-w-lg bg-background/70 dark:bg-card/40 backdrop-blur-3xl border ${colorMap.border} shadow-2xl ${colorMap.shadow} rounded-3xl p-8 sm:p-12 flex flex-col items-center relative overflow-hidden`} suppressHydrationWarning>
        {/* Glow Effect */}
        <div className={`absolute inset-0 bg-gradient-to-b ${colorMap.from} via-transparent to-transparent pointer-events-none`} suppressHydrationWarning />
        
        {/* Decorative Icon */}
        <div className={`relative w-24 h-24 ${colorMap.bgSoft} ${colorMap.text} rounded-3xl flex items-center justify-center mb-6 ring-8 ${colorMap.ring} shadow-inner`} suppressHydrationWarning>
          {config.icon}
        </div>

        {/* Text Content */}
        <div className="relative text-center mb-8 w-full" suppressHydrationWarning>
          <div className={`inline-block px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase ${colorMap.bgSoft} ${colorMap.text} mb-3`}>
            Código {config.title}
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground mb-3">
            {config.subtitle}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
            {customMessage || config.description}
          </p>
        </div>

        {/* Actions */}
        <div className="relative w-full flex flex-col gap-3" suppressHydrationWarning>
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <Button
              onClick={() => router.back()}
              variant="outline"
              className={`w-full sm:w-1/2 flex items-center justify-center gap-2 h-11 ${colorMap.border} ${colorMap.hoverBg} text-foreground ${colorMap.hoverText} rounded-xl transition-all shadow-sm font-medium`}
            >
              <ArrowLeft className="size-4" />
              <span>Voltar</span>
            </Button>
            <Button
              asChild
              className={`w-full sm:w-1/2 flex items-center justify-center gap-2 h-11 ${colorMap.bg} hover:opacity-90 text-white shadow-lg ${colorMap.btnShadow} rounded-xl transition-all font-medium`}
            >
              <Link href="/dashboard">
                <Home className="size-4" />
                <span>Painel Principal</span>
              </Link>
            </Button>
          </div>
          {code === '401' && (
            <Button
              asChild
              variant="ghost"
              className="w-full flex items-center justify-center gap-2 h-10 text-xs text-muted-foreground hover:text-foreground rounded-xl transition-all"
            >
              <Link href="/login">
                <LogIn className="size-3.5" />
                <span>Ir para a tela de login</span>
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GenericErrorPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center p-4 min-h-[80vh]" suppressHydrationWarning>
        <div className="w-10 h-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin" suppressHydrationWarning />
      </div>
    }>
      <ErrorContent />
    </Suspense>
  );
}
