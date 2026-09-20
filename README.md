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
| `GET`    | `/api/health`       | Health check (público).          |
| `POST`   | `/api/auth/registrar` | Sem convite: primeiro usuário na Empresa 1; cadastros seguintes criam empresa nova. Com `convite`: entra na empresa convidada. Cookie httpOnly. |
| `POST`   | `/api/auth/login`   | Abre sessão.                     |
| `POST`   | `/api/auth/logout`  | Encerra a sessão.                |
| `GET`    | `/api/auth/me` / `/api/me` | Usuário, papel, empresa e permissões da sessão. |
| `GET`    | `/api/auth/convite/:token` | Dados públicos de um convite pendente. |
| `GET`    | `/api/membros` | Lista membros da empresa da sessão (proprietário/administrador). |
| `PATCH`  | `/api/membros/:id` | Altera papel (`administrador`/`financeiro`/`vendas`/`estoque`/`producao`) ou ativa/inativa. |
| `GET`    | `/api/convites` | Lista convites (padrão: pendentes). |
| `POST`   | `/api/convites` | Convida e-mail com papel; devolve o token uma vez. |
| `DELETE` | `/api/convites/:id` | Cancela convite pendente. |
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
| `GET`    | `/api/fornecedores` | Lista fornecedores (busca, filtros, paginação). |
| `POST`   | `/api/fornecedores` | Cria um fornecedor. |
| `GET`    | `/api/pedidos`      | Lista pedidos de venda (busca, filtros, paginação). |
| `POST`   | `/api/pedidos`      | Cria um pedido (itens e totais no servidor). |
| `GET`    | `/api/pedidos/resumo` | Abertos, confirmados, em produção, atrasados, vendido. |
| `GET`    | `/api/pedidos/:id`  | Detalha pedido, itens, OPs e financeiro. |
| `PATCH`  | `/api/pedidos/:id`  | Edita orçamento/aberto ou transiciona status. |
| `POST`   | `/api/pedidos/:id/gerar-op` | Gera OP a partir dos itens confirmados. |
| `POST`   | `/api/pedidos/:id/financeiro` | Gera conta a receber (sem duplicar). |
| `GET`    | `/api/expedicao` | Fila de pedidos prontos/faturados para envio. |
| `GET`    | `/api/expedicao/resumo` | Contagens da fila, prontos para envio, expedidos e entregues. |
| `POST`   | `/api/expedicao/:id/pronto-envio` | Marca o pedido como pronto para envio. |
| `POST`   | `/api/expedicao/:id/expedir` | Registra a expedição (data e observações; sem transportadora). |
| `POST`   | `/api/expedicao/:id/entregar` | Marca o pedido como entregue. |
| `GET`    | `/api/compras`      | Lista pedidos de compra (filtros e paginação). |
| `POST`   | `/api/compras`      | Cria uma compra (itens, totais). |
| `GET`    | `/api/compras/:id`  | Detalha compra com itens. |
| `PATCH`  | `/api/compras/:id`  | Edita rascunho ou abre/cancela. |
| `POST`   | `/api/compras/:id/receber` | Recebe itens e gera entrada de estoque. |
| `GET`    | `/api/financeiro/resumo` | Saldo, pagar/receber, vencidos, fluxo. |
| `GET`    | `/api/financeiro/lancamentos` | Contas a pagar/receber. |
| `POST`   | `/api/financeiro/lancamentos` | Cria lançamento. |
| `PATCH`  | `/api/financeiro/lancamentos/:id` | Baixa pagamento/recebimento. |
| `GET`    | `/api/relatorios/:tipo` | Estoque, compras, vendas, financeiro, produção, custos, resumo (`?formato=csv`). |

Cada variante possui SKU e código de barras únicos. O cadastro de produtos fica pronto para ficha técnica/BOM, matérias-primas, estoque, pedidos de venda e OPs (`produto_id` / `variante_id`). Matérias-primas usam `materias_primas.id` para os mesmos vínculos futuros. O estoque guarda saldo atual em `estoque_saldos` e o histórico em `estoque_movimentos`.

Ordens de produção têm código (`OP-0001`), prioridade, data prevista, responsável, observações e status de chão de fábrica (`planejada`, `corte`, `costura`, `acabamento`, `qualidade`, `embalagem`, `concluida`, `cancelada`). A ficha técnica/BOM do produto ou variante vira requisito da OP; ao avançar para corte o sistema dá saída no estoque das matérias (e estorna se a OP for cancelada). O contrato antigo (`cliente`/`produto`/`tamanho` + `pendente`/`em_producao`) continua válido.

O fluxo de produção vive em `etapas_producao`, vinculado à OP: Corte, Costura, Acabamento, Controle de qualidade e Embalagem, com sequência, status, operador e horários de início/término. A etapa seguinte só inicia depois que a anterior for concluída.

Compras usam `fornecedores`, `pedidos_compra` e `pedido_compra_itens`. Ao receber uma compra o sistema reutiliza o movimento de estoque (`entrada`). Abrir a compra gera uma conta a pagar em `financeiro_lancamentos` vinculada a `compra_id`. Relatórios leem os dados reais e podem exportar CSV. O relatório de **vendas** usa `pedidos` / `pedido_itens` (total, quantidade, faturamento por período, por produto e por cliente) com filtros de período (`data_pedido`) e status.

Pedidos de venda usam `pedidos` e `pedido_itens` (cliente, produto e variante existentes). Confirmar o pedido reserva a quantidade no próprio item (não baixa estoque de produto acabado). **Gerar OP** cria registros em `ordens_producao` com `pedido_id` / `pedido_item_id`, copiando cliente, produto, variante, quantidade, prioridade e previsão. **Gerar financeiro** cria uma conta a receber em `financeiro_lancamentos` (`pedido_id`) sem duplicar.

Expedição usa a tabela `expedicoes` ligada ao pedido. A fila mostra pedidos `pronto` ou `faturado`. Dali é possível marcar **pronto para envio**, **registrar a expedição** e **marcar entregue** (atualiza o status do pedido). Não há integração com transportadoras nesta etapa.

A API de negócio exige sessão. O primeiro cadastro cria um usuário **proprietário** na **Empresa 1** e grava o cookie httpOnly `gc_sessao` (SameSite=Lax). Cadastros seguintes, sem convite, criam uma empresa nova e isolada. Com um convite válido (`POST /api/auth/registrar` com `convite`), a pessoa entra na empresa que convidou, no papel combinado, e **não** cria outra confecção.

Papéis por empresa, com permissões de visualizar/criar/editar/excluir por módulo:

- **proprietário** e **administrador**: acesso completo, inclusive equipe. O proprietário não pode ser alterado nem inativado; convites não criam outro proprietário.
- **financeiro**: CRUD no financeiro; visualiza relatórios, compras, fornecedores, pedidos e clientes.
- **vendas**: CRUD em clientes, produtos, pedidos e expedição; visualiza relatórios.
- **estoque**: CRUD em materiais, estoque, compras e fornecedores; visualiza produtos.
- **produção**: CRUD em ordens e etapas; visualiza produtos, materiais, estoque e clientes.

A API recusa (403) ação fora do papel e responde 404 quando o registro é de outra empresa. `/api/health` continua público. As APIs usam só a empresa da sessão autenticada — nunca `empresa_id` do body ou da query. Planos, cobrança e PostgreSQL/RLS ainda não entram nesta etapa.

O banco SQLite é criado automaticamente em `data/gestao-confeccao.sqlite`
(configurável via `DB_PATH`).
