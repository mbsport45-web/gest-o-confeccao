import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';
import {
  autenticar,
  autenticarNovaEmpresa,
  autenticarPapel,
  type TestApi,
} from './httpTest.js';
import {
  acaoDoPedido,
  moduloDaRota,
  PAPEIS,
  PREFIXOS_MODULO,
  temPermissao,
  type Acao,
  type Modulo,
  type Papel,
  type PapelConvite,
} from './papeis.js';

const DIR = dirname(fileURLToPath(import.meta.url));

const ROTAS_PROTEGIDAS: Array<{ metodo: string; caminho: string }> = [
  { metodo: 'GET', caminho: '/api/membros' },
  { metodo: 'GET', caminho: '/api/membros/1' },
  { metodo: 'PATCH', caminho: '/api/membros/1' },
  { metodo: 'GET', caminho: '/api/convites' },
  { metodo: 'POST', caminho: '/api/convites' },
  { metodo: 'DELETE', caminho: '/api/convites/1' },

  { metodo: 'GET', caminho: '/api/clientes' },
  { metodo: 'GET', caminho: '/api/clientes/1' },
  { metodo: 'POST', caminho: '/api/clientes' },
  { metodo: 'PATCH', caminho: '/api/clientes/1/status' },
  { metodo: 'PATCH', caminho: '/api/clientes/1' },
  { metodo: 'DELETE', caminho: '/api/clientes/1' },

  { metodo: 'GET', caminho: '/api/produtos' },
  { metodo: 'GET', caminho: '/api/produtos/1' },
  { metodo: 'POST', caminho: '/api/produtos' },
  { metodo: 'PATCH', caminho: '/api/produtos/1/status' },
  { metodo: 'POST', caminho: '/api/produtos/1/variantes' },
  { metodo: 'PATCH', caminho: '/api/produtos/1/variantes/1' },
  { metodo: 'DELETE', caminho: '/api/produtos/1/variantes/1' },
  { metodo: 'PATCH', caminho: '/api/produtos/1' },
  { metodo: 'DELETE', caminho: '/api/produtos/1' },

  { metodo: 'GET', caminho: '/api/materias-primas' },
  { metodo: 'GET', caminho: '/api/materias-primas/1' },
  { metodo: 'POST', caminho: '/api/materias-primas' },
  { metodo: 'PATCH', caminho: '/api/materias-primas/1/status' },
  { metodo: 'PATCH', caminho: '/api/materias-primas/1' },
  { metodo: 'DELETE', caminho: '/api/materias-primas/1' },

  { metodo: 'GET', caminho: '/api/estoque' },
  { metodo: 'GET', caminho: '/api/estoque/movimentos' },
  { metodo: 'GET', caminho: '/api/estoque/1' },
  { metodo: 'POST', caminho: '/api/estoque/movimentos' },

  { metodo: 'GET', caminho: '/api/pedidos/resumo' },
  { metodo: 'GET', caminho: '/api/pedidos' },
  { metodo: 'GET', caminho: '/api/pedidos/1' },
  { metodo: 'POST', caminho: '/api/pedidos' },
  { metodo: 'PATCH', caminho: '/api/pedidos/1' },
  { metodo: 'POST', caminho: '/api/pedidos/1/itens' },
  { metodo: 'PATCH', caminho: '/api/pedidos/1/itens/1' },
  { metodo: 'DELETE', caminho: '/api/pedidos/1/itens/1' },
  { metodo: 'POST', caminho: '/api/pedidos/1/gerar-op' },
  { metodo: 'POST', caminho: '/api/pedidos/1/financeiro' },
  { metodo: 'DELETE', caminho: '/api/pedidos/1' },

  { metodo: 'GET', caminho: '/api/expedicao/resumo' },
  { metodo: 'GET', caminho: '/api/expedicao' },
  { metodo: 'POST', caminho: '/api/expedicao/1/pronto-envio' },
  { metodo: 'POST', caminho: '/api/expedicao/1/expedir' },
  { metodo: 'POST', caminho: '/api/expedicao/1/entregar' },

  { metodo: 'GET', caminho: '/api/ordens/ficha-tecnica' },
  { metodo: 'PUT', caminho: '/api/ordens/ficha-tecnica' },
  { metodo: 'GET', caminho: '/api/ordens' },
  { metodo: 'GET', caminho: '/api/ordens/1' },
  { metodo: 'POST', caminho: '/api/ordens' },
  { metodo: 'PATCH', caminho: '/api/ordens/1' },
  { metodo: 'DELETE', caminho: '/api/ordens/1' },

  { metodo: 'POST', caminho: '/api/etapas/fluxo' },
  { metodo: 'GET', caminho: '/api/etapas' },
  { metodo: 'GET', caminho: '/api/etapas/1' },
  { metodo: 'POST', caminho: '/api/etapas' },
  { metodo: 'PATCH', caminho: '/api/etapas/1' },
  { metodo: 'DELETE', caminho: '/api/etapas/1' },

  { metodo: 'GET', caminho: '/api/fornecedores' },
  { metodo: 'GET', caminho: '/api/fornecedores/1' },
  { metodo: 'POST', caminho: '/api/fornecedores' },
  { metodo: 'PATCH', caminho: '/api/fornecedores/1' },
  { metodo: 'DELETE', caminho: '/api/fornecedores/1' },

  { metodo: 'GET', caminho: '/api/compras' },
  { metodo: 'GET', caminho: '/api/compras/1' },
  { metodo: 'POST', caminho: '/api/compras' },
  { metodo: 'PATCH', caminho: '/api/compras/1' },
  { metodo: 'POST', caminho: '/api/compras/1/itens' },
  { metodo: 'PATCH', caminho: '/api/compras/1/itens/1' },
  { metodo: 'DELETE', caminho: '/api/compras/1/itens/1' },
  { metodo: 'POST', caminho: '/api/compras/1/receber' },
  { metodo: 'DELETE', caminho: '/api/compras/1' },

  { metodo: 'GET', caminho: '/api/financeiro/categorias' },
  { metodo: 'POST', caminho: '/api/financeiro/categorias' },
  { metodo: 'GET', caminho: '/api/financeiro/resumo' },
  { metodo: 'GET', caminho: '/api/financeiro/lancamentos' },
  { metodo: 'GET', caminho: '/api/financeiro/lancamentos/1' },
  { metodo: 'POST', caminho: '/api/financeiro/lancamentos' },
  { metodo: 'PATCH', caminho: '/api/financeiro/lancamentos/1' },
  { metodo: 'DELETE', caminho: '/api/financeiro/lancamentos/1' },

  { metodo: 'GET', caminho: '/api/relatorios/estoque' },
  { metodo: 'GET', caminho: '/api/relatorios/compras' },
  { metodo: 'GET', caminho: '/api/relatorios/financeiro' },
  { metodo: 'GET', caminho: '/api/relatorios/producao' },
  { metodo: 'GET', caminho: '/api/relatorios/custos' },
  { metodo: 'GET', caminho: '/api/relatorios/vendas' },
  { metodo: 'GET', caminho: '/api/relatorios/resumo' },

  { metodo: 'GET', caminho: '/api/planos' },
  { metodo: 'GET', caminho: '/api/assinatura' },
  { metodo: 'PATCH', caminho: '/api/assinatura' },
];

const ARQUIVOS_ROTAS = [
  'equipe.ts',
  'clientes.ts',
  'produtos.ts',
  'materiasPrimas.ts',
  'estoque.ts',
  'pedidos.ts',
  'expedicao.ts',
  'ordens.ts',
  'etapas.ts',
  'fornecedores.ts',
  'compras.ts',
  'financeiro.ts',
  'relatorios.ts',
  'planos.ts',
];

function contarRotasNoFonte(): number {
  return ARQUIVOS_ROTAS.reduce((total, arquivo) => {
    const src = readFileSync(join(DIR, arquivo), 'utf8');
    return total + [...src.matchAll(/router\.(get|post|patch|put|delete)\(/g)].length;
  }, 0);
}

function chamar(api: TestApi, metodo: string, caminho: string) {
  const corpo = { nome: 'auditoria' };
  switch (metodo.toUpperCase()) {
    case 'GET':
      return api.get(caminho);
    case 'POST':
      return api.post(caminho).send(corpo);
    case 'PATCH':
      return api.patch(caminho).send(corpo);
    case 'PUT':
      return api.put(caminho).send(corpo);
    case 'DELETE':
      return api.delete(caminho);
    default:
      throw new Error(`método não suportado: ${metodo}`);
  }
}

function esperado(papel: Papel, metodo: string, caminho: string): {
  modulo: Modulo;
  acao: Acao;
  permitido: boolean;
} {
  const modulo = moduloDaRota(caminho);
  if (!modulo) throw new Error(`rota sem módulo: ${caminho}`);
  const acao = acaoDoPedido(metodo, caminho);
  return { modulo, acao, permitido: temPermissao(papel, modulo, acao) };
}

describe('auditoria de permissões por papel nas APIs', () => {
  let db: AppDatabase;

  beforeEach(() => {
    db = createDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('o catálogo de rotas cobre todos os handlers protegidos e os prefixos da API', () => {
    expect(ROTAS_PROTEGIDAS).toHaveLength(contarRotasNoFonte());
    const appSrc = readFileSync(join(DIR, 'app.ts'), 'utf8');
    const mounts = [...appSrc.matchAll(/app\.use\('(\/api\/[^']+)'/g)]
      .map((m) => m[1])
      .filter((mount) => mount !== '/api/auth');
    expect(mounts.length).toBeGreaterThan(0);
    for (const mount of mounts) {
      expect(PREFIXOS_MODULO.some((p) => p.prefixo === mount)).toBe(true);
    }
    for (const rota of ROTAS_PROTEGIDAS) {
      expect(moduloDaRota(rota.caminho)).toBeTruthy();
    }
  });

  it('sem sessão todas as APIs de negócio respondem 401, inclusive por URL direta', async () => {
    const app = createApp(db);
    const falhas: string[] = [];
    for (const rota of ROTAS_PROTEGIDAS) {
      const res = await chamar(request(app), rota.metodo, rota.caminho);
      if (res.status !== 401) {
        falhas.push(`${rota.metodo} ${rota.caminho} → ${res.status}`);
      }
    }
    expect(falhas).toEqual([]);
  });

  it('cada papel só passa do gate nas rotas permitidas e 403 em todas as outras', async () => {
    const app = createApp(db);
    const proprietario = await autenticar(app);
    const sessoes = new Map<Papel, TestApi>([['proprietario', proprietario]]);
    for (const papel of PAPEIS.filter((p) => p !== 'proprietario') as PapelConvite[]) {
      sessoes.set(papel, await autenticarPapel(app, proprietario, papel));
    }

    const falhas: string[] = [];
    for (const papel of PAPEIS) {
      const api = sessoes.get(papel);
      if (!api) throw new Error(`sessão ausente: ${papel}`);
      for (const rota of ROTAS_PROTEGIDAS) {
        const { modulo, acao, permitido } = esperado(papel, rota.metodo, rota.caminho);
        const res = await chamar(api, rota.metodo, rota.caminho);
        if (permitido) {
          if (res.status === 401 || (res.status === 403 && res.body.modulo)) {
            falhas.push(
              `${papel} deveria passar no gate em ${rota.metodo} ${rota.caminho} (${acao} ${modulo}) mas recebeu ${res.status} ${JSON.stringify(res.body)}`,
            );
          }
        } else if (res.status !== 403) {
          falhas.push(
            `${papel} deveria ser 403 em ${rota.metodo} ${rota.caminho} (${acao} ${modulo}) mas recebeu ${res.status}`,
          );
        } else if (res.body.modulo !== modulo || res.body.acao !== acao) {
          falhas.push(
            `${papel} 403 em ${rota.caminho} veio com ${res.body.modulo}/${res.body.acao} em vez de ${modulo}/${acao}`,
          );
        }
      }
    }
    expect(falhas).toEqual([]);
  });

  it('rota /api desconhecida autenticada não cai sem permissão (fail-closed)', async () => {
    const app = createApp(db);
    const api = await autenticar(app);
    const res = await api.get('/api/nao-existe');
    expect(res.status).toBe(403);
    expect(res.body.erro).toBe('Sem permissão para este recurso');
  });

  it('acesso direto a registro de outra empresa: 403 sem visualizar, 404 com visualizar', async () => {
    const app = createApp(db);
    const empresa1 = await autenticar(app);
    const { api: dono2 } = await autenticarNovaEmpresa(app);
    const vendas2 = await autenticarPapel(app, dono2, 'vendas');
    const financeiro2 = await autenticarPapel(app, dono2, 'financeiro');
    const estoque2 = await autenticarPapel(app, dono2, 'estoque');
    const producao2 = await autenticarPapel(app, dono2, 'producao');

    const cliente = await empresa1.post('/api/clientes').send({ nome: 'Cliente Empresa 1' });
    const produto = await empresa1.post('/api/produtos').send({
      sku: 'AUD-1',
      nome: 'Produto Audit',
      cores: ['Azul'],
      tamanhos: ['M'],
      preco_venda: 50,
    });
    const materia = await empresa1.post('/api/materias-primas').send({
      codigo: 'AUD-TEC',
      nome: 'Tecido Audit',
      tipo: 'tecido',
    });
    const fornecedor = await empresa1.post('/api/fornecedores').send({ nome: 'Fornecedor Audit' });
    const ordem = await empresa1.post('/api/ordens').send({
      cliente: 'Cliente OP',
      cliente_id: cliente.body.id,
      produto: 'Produto OP',
      produto_id: produto.body.id,
      tamanho: 'M',
      quantidade: 1,
    });
    const pedido = await empresa1.post('/api/pedidos').send({
      cliente_id: cliente.body.id,
      itens: [
        {
          produto_id: produto.body.id,
          variante_id: produto.body.variantes[0].id,
          quantidade: 1,
          preco_unitario: 50,
        },
      ],
    });
    const compra = await empresa1.post('/api/compras').send({ fornecedor_id: fornecedor.body.id });
    const lancamento = await empresa1.post('/api/financeiro/lancamentos').send({
      tipo: 'pagar',
      descricao: 'Conta audit',
      valor: 10,
    });

    expect(cliente.status).toBe(201);
    expect(produto.status).toBe(201);
    expect(materia.status).toBe(201);
    expect(fornecedor.status).toBe(201);
    expect(ordem.status).toBe(201);
    expect(pedido.status).toBe(201);
    expect(compra.status).toBe(201);
    expect(lancamento.status).toBe(201);

    const ids = {
      clientes: cliente.body.id as number,
      produtos: produto.body.id as number,
      materiais: materia.body.id as number,
      fornecedores: fornecedor.body.id as number,
      ordens: ordem.body.id as number,
      pedidos: pedido.body.id as number,
      compras: compra.body.id as number,
      financeiro: lancamento.body.id as number,
    };

    const caminhos: Array<{ papel: Papel; api: TestApi; modulo: Modulo; get: string; patch: string; del?: string }> =
      [
        {
          papel: 'vendas',
          api: vendas2,
          modulo: 'clientes',
          get: `/api/clientes/${ids.clientes}`,
          patch: `/api/clientes/${ids.clientes}`,
          del: `/api/clientes/${ids.clientes}`,
        },
        {
          papel: 'vendas',
          api: vendas2,
          modulo: 'produtos',
          get: `/api/produtos/${ids.produtos}`,
          patch: `/api/produtos/${ids.produtos}`,
          del: `/api/produtos/${ids.produtos}`,
        },
        {
          papel: 'vendas',
          api: vendas2,
          modulo: 'pedidos',
          get: `/api/pedidos/${ids.pedidos}`,
          patch: `/api/pedidos/${ids.pedidos}`,
          del: `/api/pedidos/${ids.pedidos}`,
        },
        {
          papel: 'financeiro',
          api: financeiro2,
          modulo: 'clientes',
          get: `/api/clientes/${ids.clientes}`,
          patch: `/api/clientes/${ids.clientes}`,
          del: `/api/clientes/${ids.clientes}`,
        },
        {
          papel: 'financeiro',
          api: financeiro2,
          modulo: 'financeiro',
          get: `/api/financeiro/lancamentos/${ids.financeiro}`,
          patch: `/api/financeiro/lancamentos/${ids.financeiro}`,
          del: `/api/financeiro/lancamentos/${ids.financeiro}`,
        },
        {
          papel: 'estoque',
          api: estoque2,
          modulo: 'materiais',
          get: `/api/materias-primas/${ids.materiais}`,
          patch: `/api/materias-primas/${ids.materiais}`,
          del: `/api/materias-primas/${ids.materiais}`,
        },
        {
          papel: 'estoque',
          api: estoque2,
          modulo: 'fornecedores',
          get: `/api/fornecedores/${ids.fornecedores}`,
          patch: `/api/fornecedores/${ids.fornecedores}`,
          del: `/api/fornecedores/${ids.fornecedores}`,
        },
        {
          papel: 'estoque',
          api: estoque2,
          modulo: 'compras',
          get: `/api/compras/${ids.compras}`,
          patch: `/api/compras/${ids.compras}`,
          del: `/api/compras/${ids.compras}`,
        },
        {
          papel: 'producao',
          api: producao2,
          modulo: 'ordens',
          get: `/api/ordens/${ids.ordens}`,
          patch: `/api/ordens/${ids.ordens}`,
          del: `/api/ordens/${ids.ordens}`,
        },
        {
          papel: 'producao',
          api: producao2,
          modulo: 'clientes',
          get: `/api/clientes/${ids.clientes}`,
          patch: `/api/clientes/${ids.clientes}`,
          del: `/api/clientes/${ids.clientes}`,
        },
        {
          papel: 'estoque',
          api: estoque2,
          modulo: 'clientes',
          get: `/api/clientes/${ids.clientes}`,
          patch: `/api/clientes/${ids.clientes}`,
          del: `/api/clientes/${ids.clientes}`,
        },
        {
          papel: 'vendas',
          api: vendas2,
          modulo: 'financeiro',
          get: `/api/financeiro/lancamentos/${ids.financeiro}`,
          patch: `/api/financeiro/lancamentos/${ids.financeiro}`,
          del: `/api/financeiro/lancamentos/${ids.financeiro}`,
        },
        {
          papel: 'producao',
          api: producao2,
          modulo: 'pedidos',
          get: `/api/pedidos/${ids.pedidos}`,
          patch: `/api/pedidos/${ids.pedidos}`,
          del: `/api/pedidos/${ids.pedidos}`,
        },
      ];

    const falhas: string[] = [];
    for (const caso of caminhos) {
      const getOk = temPermissao(caso.papel, caso.modulo, 'visualizar');
      const patchOk = temPermissao(caso.papel, caso.modulo, 'editar');
      const delOk = temPermissao(caso.papel, caso.modulo, 'excluir');
      const get = await caso.api.get(caso.get);
      const patch = await caso.api.patch(caso.patch).send({ nome: 'Invadir' });
      const del = caso.del ? await caso.api.delete(caso.del) : undefined;

      const getEsperado = getOk ? 404 : 403;
      if (get.status !== getEsperado) {
        falhas.push(`${caso.papel} GET ${caso.get} → ${get.status}, esperado ${getEsperado}`);
      }
      const patchEsperado = patchOk ? 404 : 403;
      if (patch.status !== patchEsperado) {
        falhas.push(`${caso.papel} PATCH ${caso.patch} → ${patch.status}, esperado ${patchEsperado}`);
      }
      if (del && caso.del) {
        const delEsperado = delOk ? 404 : 403;
        if (del.status !== delEsperado) {
          falhas.push(`${caso.papel} DELETE ${caso.del} → ${del.status}, esperado ${delEsperado}`);
        }
      }
    }

    const originalCliente = await empresa1.get(`/api/clientes/${ids.clientes}`);
    expect(originalCliente.status).toBe(200);
    expect(originalCliente.body.nome).toBe('Cliente Empresa 1');

    expect(falhas).toEqual([]);
  });

  it('listagens da empresa 2 não incluem dados da empresa 1 mesmo com o mesmo papel', async () => {
    const app = createApp(db);
    const empresa1 = await autenticar(app);
    const vendas1 = await autenticarPapel(app, empresa1, 'vendas');
    const { api: dono2 } = await autenticarNovaEmpresa(app);
    const vendas2 = await autenticarPapel(app, dono2, 'vendas');

    const criado = await vendas1.post('/api/clientes').send({ nome: 'Só empresa 1' });
    expect(criado.status).toBe(201);

    const lista2 = await vendas2.get('/api/clientes');
    expect(lista2.status).toBe(200);
    expect(lista2.body.total).toBe(0);
    expect(lista2.body.data).toEqual([]);

    const forcarQuery = await vendas2.get(`/api/clientes?empresa_id=1`);
    expect(forcarQuery.status).toBe(200);
    expect(forcarQuery.body.total).toBe(0);

    const forcarBody = await vendas2.post('/api/clientes').send({
      nome: 'Clone',
      empresa_id: 1,
    });
    expect(forcarBody.status).toBe(201);
    expect(forcarBody.body.empresa_id).not.toBe(1);

    const lista1 = await vendas1.get('/api/clientes');
    expect(lista1.body.data.map((c: { nome: string }) => c.nome)).toEqual(['Só empresa 1']);
  });
});
