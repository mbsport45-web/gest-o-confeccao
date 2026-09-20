import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { hashToken } from './auth.js';
import { createDatabase, type AppDatabase } from './db.js';
import {
  autenticar,
  autenticarNovaEmpresa,
  type TestApi,
} from './httpTest.js';
import {
  CHAVES_LIMITE,
  CODIGO_LIMITE_PLANO,
  PLANOS_CATALOGO,
  contarUso,
  type ChaveLimite,
  type CodigoPlano,
} from './planos.js';

function definirPlano(db: AppDatabase, empresaId: number, codigo: CodigoPlano) {
  const plano = db.prepare('SELECT id FROM planos WHERE codigo = ?').get(codigo) as { id: number };
  db.prepare(
    `UPDATE assinaturas SET plano_id = ?, cobranca = 'desativada', atualizado_em = datetime('now')
      WHERE empresa_id = ?`,
  ).run(plano.id, empresaId);
}

function garantirCliente(db: AppDatabase, empresaId: number): number {
  const row = db
    .prepare('SELECT id FROM clientes WHERE empresa_id = ? ORDER BY id LIMIT 1')
    .get(empresaId) as { id: number } | undefined;
  if (row) return row.id;
  const info = db.prepare('INSERT INTO clientes (empresa_id, nome) VALUES (?, ?)').run(
    empresaId,
    'Cliente limite',
  );
  return Number(info.lastInsertRowid);
}

function preencher(db: AppDatabase, empresaId: number, chave: ChaveLimite, alvo: number) {
  const atual = contarUso(db, empresaId)[chave];
  const falta = alvo - atual;
  if (falta <= 0) return;

  if (chave === 'usuarios') {
    const insert = db.prepare(
      `INSERT INTO usuarios (empresa_id, nome, email, senha_hash, papel)
       VALUES (?, ?, ?, 'hash', 'vendas')`,
    );
    db.transaction(() => {
      for (let i = 0; i < falta; i++) {
        insert.run(
          empresaId,
          `Usuário limite ${i}`,
          `limite-${empresaId}-${i}-${randomBytes(4).toString('hex')}@gestao.local`,
        );
      }
    })();
    return;
  }

  if (chave === 'clientes') {
    const insert = db.prepare('INSERT INTO clientes (empresa_id, nome) VALUES (?, ?)');
    db.transaction(() => {
      for (let i = 0; i < falta; i++) insert.run(empresaId, `Cliente limite ${i}`);
    })();
    return;
  }

  if (chave === 'produtos') {
    const insert = db.prepare('INSERT INTO produtos (empresa_id, nome) VALUES (?, ?)');
    db.transaction(() => {
      for (let i = 0; i < falta; i++) insert.run(empresaId, `Produto limite ${i}`);
    })();
    return;
  }

  if (chave === 'materiais') {
    const insert = db.prepare('INSERT INTO materias_primas (empresa_id, nome) VALUES (?, ?)');
    db.transaction(() => {
      for (let i = 0; i < falta; i++) insert.run(empresaId, `Material limite ${i}`);
    })();
    return;
  }

  if (chave === 'pedidos_mes') {
    const clienteId = garantirCliente(db, empresaId);
    const insert = db.prepare(
      `INSERT INTO pedidos (empresa_id, cliente_id, data_pedido) VALUES (?, ?, date('now'))`,
    );
    db.transaction(() => {
      for (let i = 0; i < falta; i++) insert.run(empresaId, clienteId);
    })();
    return;
  }

  const insert = db.prepare(
    `INSERT INTO ordens_producao (empresa_id, cliente, produto, tamanho, quantidade)
     VALUES (?, 'Cliente', 'Produto', 'M', 1)`,
  );
  db.transaction(() => {
    for (let i = 0; i < falta; i++) insert.run(empresaId);
  })();
}

async function tentarCriar(api: TestApi, db: AppDatabase, empresaId: number, chave: ChaveLimite) {
  const hijack = { empresa_id: 999 };
  if (chave === 'usuarios') {
    return api.post('/api/convites').send({
      email: `novo-${randomBytes(4).toString('hex')}@gestao.local`,
      papel: 'vendas',
      ...hijack,
    });
  }
  if (chave === 'clientes') {
    return api.post('/api/clientes').send({ nome: 'Além do limite', ...hijack });
  }
  if (chave === 'produtos') {
    return api.post('/api/produtos').send({ nome: 'Além do limite', ...hijack });
  }
  if (chave === 'materiais') {
    return api.post('/api/materias-primas').send({ nome: 'Além do limite', ...hijack });
  }
  if (chave === 'pedidos_mes') {
    return api.post('/api/pedidos').send({
      cliente_id: garantirCliente(db, empresaId),
      ...hijack,
    });
  }
  return api.post('/api/ordens').send({
    cliente: 'Além',
    produto: 'Limite',
    tamanho: 'M',
    quantidade: 1,
    ...hijack,
  });
}

const casos = PLANOS_CATALOGO.flatMap((plano) =>
  CHAVES_LIMITE.map((chave) => ({
    plano: plano.codigo,
    nome: plano.nome,
    chave,
    maximo: plano.limites[chave],
  })),
);

describe('aplicação dos limites por plano', () => {
  let db: AppDatabase;
  let api: TestApi;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    api = await autenticar(createApp(db));
  });

  afterEach(() => {
    db.close();
  });

  it.each(casos)('$plano / $chave', async ({ plano, nome, chave, maximo }) => {
    definirPlano(db, 1, plano);
    if (maximo === null) {
      preencher(db, 1, chave, 40);
      const res = await tentarCriar(api, db, 1, chave);
      expect(res.status).toBe(201);
      expect(contarUso(db, 1)[chave]).toBe(41);
      return;
    }

    preencher(db, 1, chave, maximo);
    expect(contarUso(db, 1)[chave]).toBe(maximo);

    const res = await tentarCriar(api, db, 1, chave);
    expect(res.status).toBe(409);
    expect(res.body.codigo).toBe(CODIGO_LIMITE_PLANO);
    expect(res.body.upgrade).toBe(true);
    expect(res.body.limite).toEqual({ chave, atual: maximo, maximo, plano });
    expect(res.body.erro).toBe(
      `Limite do plano ${nome} atingido: ${
        {
          usuarios: 'usuários',
          clientes: 'clientes',
          produtos: 'produtos',
          materiais: 'matérias-primas',
          pedidos_mes: 'pedidos deste mês',
          ordens_mes: 'ordens de produção deste mês',
        }[chave]
      } (${maximo}/${maximo}). Faça upgrade do plano para continuar.`,
    );
    expect(contarUso(db, 1)[chave]).toBe(maximo);
  });

  it('GET /api/assinatura e /api/me expõem o uso atual', async () => {
    preencher(db, 1, 'clientes', 50);
    const assinatura = await api.get('/api/assinatura');
    expect(assinatura.status).toBe(200);
    expect(assinatura.body.uso.clientes).toEqual({ atual: 50, maximo: 50, atingido: true });
    expect(assinatura.body.uso.usuarios).toEqual({ atual: 1, maximo: 3, atingido: false });
    const me = await api.get('/api/me');
    expect(me.body.assinatura.uso.clientes.atingido).toBe(true);
  });

  it('editar cliente continua permitido com o limite de cadastro atingido', async () => {
    const criado = await api.post('/api/clientes').send({ nome: 'Loja Original' });
    expect(criado.status).toBe(201);
    preencher(db, 1, 'clientes', 50);
    const editar = await api.patch(`/api/clientes/${criado.body.id}`).send({ nome: 'Loja Editada' });
    expect(editar.status).toBe(200);
    expect(editar.body.nome).toBe('Loja Editada');
    const extra = await api.post('/api/clientes').send({ nome: 'Não deve entrar' });
    expect(extra.status).toBe(409);
  });

  it('empresa vizinha não herda o limite e empresa_id no body não contorna', async () => {
    const app = createApp(db);
    const { api: empresa2 } = await autenticarNovaEmpresa(app);
    preencher(db, 1, 'clientes', 50);

    const bloqueado = await api.post('/api/clientes').send({ nome: 'Hijack', empresa_id: 2 });
    expect(bloqueado.status).toBe(409);
    expect(contarUso(db, 1).clientes).toBe(50);
    expect(contarUso(db, 2).clientes).toBe(0);

    const ok = await empresa2.post('/api/clientes').send({ nome: 'Cliente da outra empresa', empresa_id: 1 });
    expect(ok.status).toBe(201);
    expect(contarUso(db, 1).clientes).toBe(50);
    expect(contarUso(db, 2).clientes).toBe(1);
  });

  it('pedidos do mês anterior não consomem a cota do mês atual', async () => {
    const clienteId = garantirCliente(db, 1);
    db.prepare(
      `INSERT INTO pedidos (empresa_id, cliente_id, data_pedido, criado_em)
       VALUES (?, ?, date('now', '-1 month'), datetime('now', '-1 month'))`,
    ).run(1, clienteId);
    db.prepare(
      `INSERT INTO pedidos (empresa_id, cliente_id, data_pedido, criado_em)
       VALUES (?, ?, date('now', '-1 month'), datetime('now', '-1 month'))`,
    ).run(1, clienteId);

    const primeiro = await api.post('/api/pedidos').send({ cliente_id: clienteId });
    expect(primeiro.status).toBe(201);
    expect(contarUso(db, 1).pedidos_mes).toBe(1);

    preencher(db, 1, 'pedidos_mes', 50);
    const bloqueado = await api.post('/api/pedidos').send({ cliente_id: clienteId });
    expect(bloqueado.status).toBe(409);
    expect(bloqueado.body.limite.chave).toBe('pedidos_mes');
  });

  it('convite pendente ocupa vaga de usuário', async () => {
    const primeiro = await api.post('/api/convites').send({
      email: 'vaga1@gestao.local',
      papel: 'vendas',
    });
    const segundo = await api.post('/api/convites').send({
      email: 'vaga2@gestao.local',
      papel: 'estoque',
    });
    expect(primeiro.status).toBe(201);
    expect(segundo.status).toBe(201);
    expect(contarUso(db, 1).usuarios).toBe(3);

    const terceiro = await api.post('/api/convites').send({
      email: 'vaga3@gestao.local',
      papel: 'producao',
    });
    expect(terceiro.status).toBe(409);
    expect(terceiro.body.codigo).toBe(CODIGO_LIMITE_PLANO);
    expect(terceiro.body.limite.chave).toBe('usuarios');
  });

  it('aceitar convite é recusado quando a empresa já tem o máximo de usuários', async () => {
    const app = createApp(db);
    preencher(db, 1, 'usuarios', 3);
    const token = randomBytes(32).toString('base64url');
    db.prepare(
      `INSERT INTO convites (empresa_id, email, papel, token_hash, status, expira_em)
       VALUES (1, 'cheio@gestao.local', 'vendas', ?, 'pendente', datetime('now', '+1 day'))`,
    ).run(hashToken(token));

    const res = await request(app).post('/api/auth/registrar').send({
      nome: 'Fora do limite',
      email: 'cheio@gestao.local',
      senha: 'senha-teste-9',
      convite: token,
    });
    expect(res.status).toBe(409);
    expect(res.body.codigo).toBe(CODIGO_LIMITE_PLANO);
    expect(res.body.limite.chave).toBe('usuarios');
    expect(
      (db.prepare('SELECT COUNT(*) AS n FROM usuarios WHERE empresa_id = 1').get() as { n: number }).n,
    ).toBe(3);
  });

  it('gerar OP respeita o limite mensal de ordens, inclusive em lote', async () => {
    const cliente = await api.post('/api/clientes').send({ nome: 'Loja OP' });
    const produto = await api.post('/api/produtos').send({
      sku: 'CAM-LIM',
      nome: 'Camisa limite',
      cores: ['Azul'],
      tamanhos: ['P', 'M'],
      preco_venda: 50,
    });
    const variantes = produto.body.variantes as Array<{ id: number; tamanho: string }>;
    const pedido = await api.post('/api/pedidos').send({
      cliente_id: cliente.body.id,
      status: 'aberto',
      itens: variantes.map((v) => ({
        produto_id: produto.body.id,
        variante_id: v.id,
        quantidade: 2,
        preco_unitario: 50,
      })),
    });
    await api.patch(`/api/pedidos/${pedido.body.id}`).send({ status: 'confirmado' });

    preencher(db, 1, 'ordens_mes', 19);
    const lote = await api.post(`/api/pedidos/${pedido.body.id}/gerar-op`).send({});
    expect(lote.status).toBe(409);
    expect(lote.body.limite.chave).toBe('ordens_mes');
    expect(contarUso(db, 1).ordens_mes).toBe(19);

    preencher(db, 1, 'ordens_mes', 20);
    const umItem = await api.post(`/api/pedidos/${pedido.body.id}/gerar-op`).send({
      item_ids: [pedido.body.itens[0].id],
    });
    expect(umItem.status).toBe(409);
    expect(umItem.body.upgrade).toBe(true);
  });
});
