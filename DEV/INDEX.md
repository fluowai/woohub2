# DEV/INDEX

| Arquivo | Conteúdo |
|---|---|
| README.md | Índice geral e regras |
| HANDOFF.md | Estado atual, próximos passos, bloqueios |
| CONTEXT.md | Produto, arquitetura, decisões técnicas |
| SPECS/ACTIVE.md | Contrato da tarefa em curso (briefing Woohub) |
| WORKLOG.md | Registro cronológico de mudanças |
| VERIFY.md | Comandos de verificação e estado dos checks |
| LOGS/ | Registros de execução/auditoria pontuais |

## Convenções

- Commits por fase (ver WORKLOG.md).
- Migrações versionadas em `prisma/migrations/`.
- Testes automatizados em `tests/` (Vitest; `vitest.config.ts` define alias/env de teste).
