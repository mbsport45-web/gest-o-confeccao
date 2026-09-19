# Gestão de Confecção

Sistema de gestão para confecção: cadastro de produtos e acompanhamento de
ordens de produção. Aplicação full-stack usada como base de desenvolvimento.

## Stack

- **API** (`server/`): Node.js + Express + SQLite (`better-sqlite3`), em TypeScript.
- **Web** (`web/`): React + TypeScript + Vite.
- Monorepo com npm workspaces.

## Como rodar

```bash
npm install        # instala dependências dos workspaces
npm run dev        # sobe API (porta 4000) e web (porta 5173) juntos
```

- Web: http://localhost:5173
- API: http://localhost:4000/api/health

O front-end faz proxy de `/api` para a API (configurado em `web/vite.config.ts`),
então basta abrir a interface web.

### Scripts úteis

| Comando | Descrição |
| --- | --- |
| `npm run dev` | API + Web em modo desenvolvimento |
| `npm run dev:server` | Apenas a API |
| `npm run dev:web` | Apenas o front-end |
| `npm run build` | Build de produção do front-end |
| `npm run typecheck` | Checagem de tipos (server + web) |

## API

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/api/health` | Status da API |
| GET | `/api/produtos` | Lista produtos |
| POST | `/api/produtos` | Cria produto (`nome`, `sku`, `categoria`, `preco`) |
| DELETE | `/api/produtos/:id` | Remove produto |
| GET | `/api/ordens` | Lista ordens de produção |
| POST | `/api/ordens` | Cria ordem (`produto_id`, `quantidade`, `prazo`) |
| PATCH | `/api/ordens/:id` | Atualiza status da ordem |

O banco SQLite é criado automaticamente em `data/gestao.db` (ou em `DB_PATH`)
e populado com alguns produtos de exemplo no primeiro uso.

## Ambiente Cloud Agent

O arquivo `.cursor/environment.json` sobe automaticamente a API e o front-end
em terminais nomeados (`api` e `web`) e expõe as portas 4000 e 5173.
