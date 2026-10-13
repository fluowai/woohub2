'use client';

import React from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';
import '@/app/globals.css';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased flex items-center justify-center p-4 sm:p-6 md:p-8" suppressHydrationWarning>
        <div className="w-full max-w-lg bg-background/70 dark:bg-card/50 backdrop-blur-3xl border border-destructive/20 shadow-2xl shadow-destructive/10 rounded-3xl p-8 sm:p-12 flex flex-col items-center relative overflow-hidden" suppressHydrationWarning>
          {/* Glow Effect */}
          <div className="absolute inset-0 bg-gradient-to-b from-destructive/15 via-transparent to-transparent pointer-events-none" suppressHydrationWarning />
          
          {/* Decorative Icon */}
          <div className="relative w-24 h-24 bg-destructive/10 text-destructive rounded-3xl flex items-center justify-center mb-6 ring-8 ring-destructive/5 shadow-inner" suppressHydrationWarning>
            <AlertOctagon className="size-12 animate-pulse" />
          </div>

          {/* Text Content */}
          <div className="relative text-center mb-8 w-full" suppressHydrationWarning>
            <div className="inline-block px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase bg-destructive/10 text-destructive mb-3">
              Falha Crítica
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground mb-3">
              Erro Crítico no Sistema
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
              A aplicação encontrou uma falha de execução nos componentes base. Por favor, clique abaixo para recarregar o sistema.
            </p>
          </div>

          {/* Action */}
          <div className="relative w-full flex flex-col sm:flex-row gap-4" suppressHydrationWarning>
            <button
              onClick={() => reset()}
              className="w-full flex-1 flex items-center justify-center gap-2 h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-all shadow-lg shadow-primary/20 active:scale-95 duration-150"
            >
              <RotateCcw className="size-4" />
              <span>Recarregar Aplicação</span>
            </button>
          </div>

          {error.digest && (
            <div className="relative mt-6 text-[11px] text-muted-foreground font-mono bg-muted/60 p-3 rounded-xl border border-border/30 w-full text-center break-all" suppressHydrationWarning>
              Identificador do erro: {error.digest}
            </div>
          )}
        </div>
      </body>
    </html>
  );
}
