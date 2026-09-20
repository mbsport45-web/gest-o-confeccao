# gestão de confecção

Sistema de gestão de confecção para controle de **ordens de produção**, **clientes** e **produtos** (com variantes de cor e tamanho).

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
| `GET`    | `/api/clientes`     | Lista clientes (busca, filtros, paginação). |
| `POST`   | `/api/clientes`     | Cria um cliente.                 |
| `GET`    | `/api/clientes/:id` | Detalha um cliente.              |
| `PATCH`  | `/api/clientes/:id` | Atualiza um cliente.             |
| `PATCH`  | `/api/clientes/:id/status` | Ativa ou inativa.         |
| `DELETE` | `/api/clientes/:id` | Remove se não houver OPs vinculadas. |
| `GET`    | `/api/produtos`     | Lista produtos (busca, filtros, paginação). |
| `POST`   | `/api/produtos`     | Cria produto e gera variantes cor × tamanho. |
| `GET`    | `/api/produtos/:id` | Detalha produto com variantes. |
| `PATCH`  | `/api/produtos/:id` | Atualiza produto e inclui novas combinações. |
| `PATCH`  | `/api/produtos/:id/status` | Ativa ou inativa. |
| `DELETE` | `/api/produtos/:id` | Remove se não houver OPs vinculadas. |
| `POST`   | `/api/produtos/:id/variantes` | Inclui variante avulsa. |
| `PATCH`  | `/api/produtos/:id/variantes/:vid` | Atualiza SKU/barcode da variante. |
| `DELETE` | `/api/produtos/:id/variantes/:vid` | Remove variante sem vínculo de OP. |

Cada variante possui SKU e código de barras únicos. O cadastro de produtos fica pronto para ficha técnica/BOM, matérias-primas, estoque, pedidos de venda e OPs (`produto_id` / `variante_id`).

O banco SQLite é criado automaticamente em `data/gestao-confeccao.sqlite`
(configurável via `DB_PATH`).
