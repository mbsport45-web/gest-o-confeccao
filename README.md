# gestão de confecção

Sistema de gestão de confecção para controle de **ordens de produção**, **etapas/fluxo**, **clientes**, **produtos** (com variantes de cor e tamanho), **matérias-primas** e **estoque**. A interface web abre em um **dashboard** com navegação lateral (pt-BR) e detalhe visual da OP (Corte → Costura → Acabamento → Qualidade → Embalagem), usando os dados reais da API.

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
| `GET`    | `/api/ordens`       | Lista OPs (array; com `pagina` retorna busca, filtros e paginação). |
| `POST`   | `/api/ordens`       | Cria uma ordem de produção (código, produto/variante, BOM). |
| `GET`    | `/api/ordens/ficha-tecnica` | Lê a ficha técnica/BOM do produto ou variante. |
| `PUT`    | `/api/ordens/ficha-tecnica` | Grava a ficha técnica/BOM. |
| `GET`    | `/api/ordens/:id`   | Detalha uma OP com requisitos e estoque. |
| `PATCH`  | `/api/ordens/:id`   | Edita campos ou transiciona o status. |
| `DELETE` | `/api/ordens/:id`   | Remove se não estiver em produção. |
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
| `GET`    | `/api/materias-primas` | Lista matérias-primas (busca, filtros, paginação). |
| `POST`   | `/api/materias-primas` | Cria uma matéria-prima. |
| `GET`    | `/api/materias-primas/:id` | Detalha uma matéria-prima. |
| `PATCH`  | `/api/materias-primas/:id` | Atualiza uma matéria-prima. |
| `PATCH`  | `/api/materias-primas/:id/status` | Ativa ou inativa. |
| `DELETE` | `/api/materias-primas/:id` | Remove se não houver vínculos de BOM/estoque/compras. |
| `GET`    | `/api/estoque` | Lista saldos atuais (busca, filtros, paginação). |
| `GET`    | `/api/estoque/:id` | Detalha saldo e histórico de movimentos. |
| `GET`    | `/api/estoque/movimentos` | Histórico de entradas, saídas e ajustes. |
| `POST`   | `/api/estoque/movimentos` | Lança entrada, saída ou ajuste (variante, produto ou matéria-prima). |
| `GET`    | `/api/etapas` | Lista etapas do fluxo (busca, filtros, paginação). |
| `POST`   | `/api/etapas/fluxo` | Gera Corte → Costura → Acabamento → Qualidade → Embalagem para uma OP. |
| `POST`   | `/api/etapas` | Cria uma etapa avulsa. |
| `GET`    | `/api/etapas/:id` | Detalha uma etapa (operador, início, término). |
| `PATCH`  | `/api/etapas/:id` | Atualiza status, operador ou timestamps. |
| `DELETE` | `/api/etapas/:id` | Remove etapa pendente ou cancelada. |

Cada variante possui SKU e código de barras únicos. O cadastro de produtos fica pronto para ficha técnica/BOM, matérias-primas, estoque, pedidos de venda e OPs (`produto_id` / `variante_id`). Matérias-primas usam `materias_primas.id` para os mesmos vínculos futuros. O estoque guarda saldo atual em `estoque_saldos` e o histórico em `estoque_movimentos`.

Ordens de produção têm código (`OP-0001`), prioridade, data prevista, responsável, observações e status de chão de fábrica (`planejada`, `corte`, `costura`, `acabamento`, `qualidade`, `embalagem`, `concluida`, `cancelada`). A ficha técnica/BOM do produto ou variante vira requisito da OP; ao avançar para corte o sistema dá saída no estoque das matérias (e estorna se a OP for cancelada). O contrato antigo (`cliente`/`produto`/`tamanho` + `pendente`/`em_producao`) continua válido.

O fluxo de produção vive em `etapas_producao`, vinculado à OP: Corte, Costura, Acabamento, Controle de qualidade e Embalagem, com sequência, status, operador e horários de início/término. A etapa seguinte só inicia depois que a anterior for concluída.

O banco SQLite é criado automaticamente em `data/gestao-confeccao.sqlite`
(configurável via `DB_PATH`).
