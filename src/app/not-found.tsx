'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Home, FileQuestion, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 min-h-[80vh]" suppressHydrationWarning>
        <div className="w-10 h-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin" suppressHydrationWarning />
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-6 md:p-8 min-h-[85vh] w-full" suppressHydrationWarning>
      <div className="w-full max-w-lg bg-background/70 dark:bg-card/40 backdrop-blur-3xl border border-primary/20 shadow-2xl shadow-primary/10 rounded-3xl p-8 sm:p-12 flex flex-col items-center relative overflow-hidden" suppressHydrationWarning>
        {/* Glow Effect */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary/15 via-transparent to-transparent pointer-events-none" suppressHydrationWarning />
        
        {/* Decorative Icon */}
        <div className="relative w-24 h-24 bg-primary/10 text-primary rounded-3xl flex items-center justify-center mb-6 ring-8 ring-primary/5 shadow-inner" suppressHydrationWarning>
          <FileQuestion className="size-12 animate-pulse" />
        </div>

        {/* Text Content */}
        <div className="relative text-center mb-8 w-full" suppressHydrationWarning>
          <div className="inline-block px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase bg-primary/10 text-primary mb-3">
            Erro 404
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground mb-3">
            Página Não Encontrada
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
            A página que você está procurando pode ter sido removida, renomeada ou está temporariamente indisponível.
          </p>
        </div>

        {/* Actions */}
        <div className="relative w-full flex flex-col gap-3" suppressHydrationWarning>
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <Button
              onClick={() => router.back()}
              variant="outline"
              className="w-full sm:w-1/2 flex items-center justify-center gap-2 h-11 border-primary/20 hover:bg-primary/10 text-foreground hover:text-primary rounded-xl transition-all shadow-sm font-medium"
            >
              <ArrowLeft className="size-4" />
              <span>Voltar</span>
            </Button>
            <Button
              asChild
              variant="default"
              className="w-full sm:w-1/2 flex items-center justify-center gap-2 h-11 shadow-lg shadow-primary/20 rounded-xl transition-all font-medium"
            >
              <Link href="/dashboard">
                <Home className="size-4" />
                <span>Painel Principal</span>
              </Link>
            </Button>
          </div>
          <Button
            asChild
            variant="ghost"
            className="w-full flex items-center justify-center gap-2 h-10 text-xs text-muted-foreground hover:text-foreground rounded-xl transition-all"
          >
            <Link href="/login">
              <LogIn className="size-3.5" />
              <span>Acessar tela de login</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
