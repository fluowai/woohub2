"use client";

import { useEffect, useState } from "react";
import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";

/**
 * Swagger UI da API legada.
 *
 * A página não guarda credencial nenhuma no navegador: o acesso é feito com a
 * sessão do painel (validada no proxy), e a spec em `/api/docs` não contém
 * dados de tenant nem segredos. As antigas credenciais fixas
 * (`admin`/`admin123`) foram removidas — variável `NEXT_PUBLIC_*` nunca
 * carrega segredo.
 */
export default function ApiDocsPage() {
    const [ready, setReady] = useState(false);

    useEffect(() => {
        // Suppress Swagger UI legacy lifecycle warnings (ModelCollapse)
        const originalWarn = console.warn;
        console.warn = (...args: unknown[]) => {
            if (
                typeof args[0] === "string" &&
                args[0].includes("UNSAFE_componentWillReceiveProps") &&
                args[0].includes("ModelCollapse")
            ) {
                return;
            }
            originalWarn(...args);
        };
        setReady(true);
        return () => {
            console.warn = originalWarn;
        };
    }, []);

    if (!ready) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[oklch(0.995_0.002_60)]">
                <p className="text-gray-600">Carregando documentação...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white">
            <div className="bg-black text-white p-4 shadow-lg">
                <div className="container mx-auto flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold">Documentação da API Woohub</h1>
                        <p className="text-orange-300 text-sm mt-1">
                            API legada (compatibilidade). A API pública versionada está em{" "}
                            <a href="/docs/v1" className="underline">
                                /docs/v1
                            </a>
                            .
                        </p>
                    </div>
                    <a
                        href="/dashboard"
                        className="bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded-lg transition-colors text-sm font-medium"
                    >
                        Voltar ao painel
                    </a>
                </div>
            </div>

            <div className="container mx-auto">
                <SwaggerUI url="/api/docs" />
            </div>
        </div>
    );
}
