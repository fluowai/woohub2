import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
            // next-auth importa `next/server` como subpath ESM; o pacote next não
            // declara `exports`, então o Vitest precisa do arquivo explícito.
            "next/server": path.resolve(__dirname, "node_modules/next/server.js"),
        },
    },
    test: {
        globals: true,
        environment: "node",
        server: {
            deps: {
                // next-auth (ESM) importa `next/server` sem extensão — só funciona
                // com resolução de bundler; inline faz o Vite resolver (alias acima).
                inline: ["next", "next-auth", "@auth/core"],
            },
        },
        env: {
            // Banco nunca é conectado nos testes unitários, mas o PrismaClient
            // exige a variável presente ao ser instanciado.
            DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/woohub_test",
            AUTH_SECRET: "test-secret-not-used-outside-tests",
            NODE_ENV: "test",
        },
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
            include: ["src/lib/**/*.ts", "src/modules/**/*.ts"],
            // Baseline real (2026-10-15): lines 11.79 / functions 30.81 / branches >75.
            // Subir gradualmente conforme cobertura cresce — nunca abaixar.
            thresholds: {
                lines: 11,
                functions: 30,
                branches: 75,
                statements: 11,
            },
        },
    },
});
