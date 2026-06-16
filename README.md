# sass-obra-pub

SaaS de **captação e busca de editais de obra pública** para empreiteiros.

Ajuda o empreiteiro a encontrar licitações de obra pública relevantes por região.
Esta fase cobre a primeira funcionalidade do MVP: **captação e busca de editais por região**.

## Stack

Monorepo gerenciado com **pnpm**.

| Pacote | Descrição |
|---|---|
| `apps/api` | Backend — NestJS + TypeORM + PostgreSQL |
| `apps/web` | Frontend — Vite + React 18 + TypeScript |
| `packages/` | Código compartilhado (tipos, contratos de API) |

## Pré-requisitos

- Node.js >= 20 (ver `.nvmrc`)
- pnpm >= 10
- Docker (PostgreSQL em desenvolvimento)

## Começando

```bash
pnpm install
```

> ⚠️ Os apps (`api`, `web`) serão configurados nas próximas tasks do backlog
> (T-05 e T-25). Por ora, este repositório contém o esqueleto do monorepo.

## Documentação

- [`CLAUDE.md`](CLAUDE.md) — regras de trabalho e arquitetura
- [`BACKLOG.md`](BACKLOG.md) — backlog da fase atual
- [`spikes/RESULTADOS.md`](spikes/RESULTADOS.md) — validação das fontes de dados (PNCP, Compras.gov.br)

## Licença

Proprietário e confidencial. Todos os direitos reservados. Ver [`LICENSE`](LICENSE).
