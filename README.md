# gestão de confecção

Sistema de gestão de confecção para controle de **ordens de produção** (clientes, produtos, tamanhos, quantidades e status).

Monorepo full-stack em TypeScript:

- **`server/`** — API REST em Express + SQLite (`better-sqlite3`).
- **`web/`** — interface em React + Vite.

## Requisitos

- Node.js >= 20 (o projeto é desenvolvido com Node 22).
- npm 10+ (usa workspaces).

## Instalação

```bash
npm ci        # ou: npm install
```

Isso instala as dependências dos dois workspaces (`server` e `web`).

## Rodando em desenvolvimento

```bash
npm run dev
```

- API: http://localhost:3001 (health check em `/api/health`)
- Web: http://localhost:5173 (proxy de `/api` → API)

Também é possível rodar cada parte separadamente:

```bash
npm run dev:server
npm run dev:web
```

## Scripts úteis

| Comando              | Descrição                                        |
| -------------------- | ------------------------------------------------ |
| `npm run dev`        | Sobe API e web simultaneamente.                  |
| `npm run build`      | Compila `server` (tsc) e `web` (vite build).     |
| `npm test`           | Testes da API com Vitest + Supertest.            |
| `npm run typecheck`  | Checagem de tipos nos dois workspaces.           |
| `npm run lint`       | ESLint nos dois workspaces.                       |

## API

| Método   | Rota                | Descrição                        |
| -------- | ------------------- | -------------------------------- |
| `GET`    | `/api/health`       | Health check.                    |
| `GET`    | `/api/ordens`       | Lista as ordens de produção.     |
| `POST`   | `/api/ordens`       | Cria uma ordem de produção.      |
| `GET`    | `/api/ordens/:id`   | Detalha uma ordem.               |
| `PATCH`  | `/api/ordens/:id`   | Atualiza o status de uma ordem.  |
| `DELETE` | `/api/ordens/:id`   | Remove uma ordem.                |

O banco SQLite é criado automaticamente em `data/gestao-confeccao.sqlite`
(configurável via `DB_PATH`).
