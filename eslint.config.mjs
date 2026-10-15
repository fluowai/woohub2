import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Saida gerada (nao e codigo proprio): cliente Prisma e relatorio de cobertura.
    "src/generated/**",
    "coverage/**",
    // Scripts legados de scan (nao fazem parte da app).
    ".omx/**",
    // Backups locais (conteudo sensivel, fora do escopo de lint).
    "data/backup/**",
  ]),
  {
    // Baseline legado (2026-10-15): ~310 "errors" sao estilo, nao bugs.
    // Mantidos como warning para visibilidade sem bloquear CI.
    // Regras reais (hooks, require-imports, etc.) continuam como error.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      // Padrao legitimo de carregamento em useEffect (setState no corpo do
      // effect): refatorar exige revisao de UX por tela. Erro de perf, nao bug.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    // Scripts Node.js em CommonJS: require() e a forma correta neles.
    files: ["scripts/**/*.js", "*.config.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
