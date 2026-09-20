import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';
import { autenticar, autenticarNovaEmpresa, type TestApi } from './httpTest.js';

const CPF_VALIDO = '52998224725';

describe('isolamento por empresa da sessão', () => {
  let db: AppDatabase;
  let empresa1: TestApi;
  let empresa2: TestApi;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    const app = createApp(db);
    empresa1 = await autenticar(app);
    ({ api: empresa2 } = await autenticarNovaEmpresa(app));
  });

  afterEach(() => {
    db.close();
  });

  it('vincula dados atuais à Empresa 1 e ignora empresa_id do body ou da query', async () => {
    const criado = await empresa1.post('/api/clientes').send({
      nome: 'Loja da Empresa 1',
      cpf_cnpj: CPF_VALIDO,
      empresa_id: 999,
    });
    expect(criado.status).toBe(201);
    expect(criado.body.empresa_id).toBe(1);

    const noBanco = db
      .prepare('SELECT empresa_id FROM clientes WHERE id = ?')
      .get(criado.body.id) as { empresa_id: number };
    expect(noBanco.empresa_id).toBe(1);

    const listaForcada = await empresa2.get('/api/clientes?empresa_id=1');
    expect(listaForcada.status).toBe(200);
    expect(listaForcada.body.total).toBe(0);
    expect(listaForcada.body.data).toEqual([]);
  });

  it('bloqueia GET, PATCH e DELETE de cliente de outra empresa', async () => {
    const cliente = await empresa1.post('/api/clientes').send({ nome: 'Cliente A' });
    expect(cliente.status).toBe(201);

    const get = await empresa2.get(`/api/clientes/${cliente.body.id}`);
    expect(get.status).toBe(404);

    const patch = await empresa2.patch(`/api/clientes/${cliente.body.id}`).send({ nome: 'Invadido' });
    expect(patch.status).toBe(404);

    const del = await empresa2.delete(`/api/clientes/${cliente.body.id}`);
    expect(del.status).toBe(404);

    const original = await empresa1.get(`/api/clientes/${cliente.body.id}`);
    expect(original.status).toBe(200);
    expect(original.body.nome).toBe('Cliente A');
  });

  it('permite o mesmo CPF/CNPJ em empresas diferentes', async () => {
    const a = await empresa1.post('/api/clientes').send({
      nome: 'Cliente Norte',
      cpf_cnpj: CPF_VALIDO,
    });
    const b = await empresa2.post('/api/clientes').send({
      nome: 'Cliente Sul',
      cpf_cnpj: CPF_VALIDO,
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.id).not.toBe(b.body.id);
  });

  it('bloqueia produto, matéria-prima e fornecedor de outra empresa', async () => {
    const produto = await empresa1.post('/api/produtos').send({
      sku: 'CAM-1',
      nome: 'Camisa Tenant',
      cores: ['Azul'],
      tamanhos: ['M'],
      preco_venda: 50,
    });
    const materia = await empresa1.post('/api/materias-primas').send({
      codigo: 'TEC-1',
      nome: 'Malha',
      tipo: 'tecido',
    });
    const fornecedor = await empresa1.post('/api/fornecedores').send({
      nome: 'Fornecedor A',
    });
    expect(produto.status).toBe(201);
    expect(materia.status).toBe(201);
    expect(fornecedor.status).toBe(201);

    expect((await empresa2.get(`/api/produtos/${produto.body.id}`)).status).toBe(404);
    expect((await empresa2.get(`/api/materias-primas/${materia.body.id}`)).status).toBe(404);
    expect((await empresa2.get(`/api/fornecedores/${fornecedor.body.id}`)).status).toBe(404);
    expect((await empresa2.get('/api/produtos')).body.total).toBe(0);
    expect((await empresa2.get('/api/materias-primas')).body.total).toBe(0);
    expect((await empresa2.get('/api/fornecedores')).body.total).toBe(0);
  });

  it('não deixa criar pedido com cliente de outra empresa', async () => {
    const cliente = await empresa1.post('/api/clientes').send({ nome: 'Cliente Pedido' });
    const produto = await empresa1.post('/api/produtos').send({
      sku: 'CAM-PV',
      nome: 'Camisa Pedido',
      cores: ['Preto'],
      tamanhos: ['M'],
      preco_venda: 80,
    });
    const variante = (produto.body.variantes as Array<{ id: number }> )[0];
    const pedido = await empresa1.post('/api/pedidos').send({
      cliente_id: cliente.body.id,
      itens: [{ produto_id: produto.body.id, variante_id: variante.id, quantidade: 1, preco_unitario: 80 }],
    });
    expect(pedido.status).toBe(201);
    expect(pedido.body.empresa_id).toBe(1);

    const invadir = await empresa2.post('/api/pedidos').send({
      cliente_id: cliente.body.id,
      empresa_id: 1,
    });
    expect(invadir.status).toBe(404);

    expect((await empresa2.get(`/api/pedidos/${pedido.body.id}`)).status).toBe(404);
    expect((await empresa2.patch(`/api/pedidos/${pedido.body.id}`).send({ observacoes: 'x' })).status).toBe(
      404,
    );
    expect((await empresa2.get('/api/pedidos')).body.total).toBe(0);
  });

  it('bloqueia OP, estoque, compra, financeiro, expedição e relatórios de outra empresa', async () => {
    const cliente = await empresa1.post('/api/clientes').send({ nome: 'Cliente OP' });
    const produto = await empresa1.post('/api/produtos').send({
      sku: 'CAM-OP',
      nome: 'Camisa OP',
      cores: ['Branco'],
      tamanhos: ['G'],
      preco_venda: 40,
    });
    const variante = (produto.body.variantes as Array<{ id: number }>)[0];
    const materia = await empresa1.post('/api/materias-primas').send({
      codigo: 'LIN-1',
      nome: 'Linha',
      tipo: 'linha',
    });
    const fornecedor = await empresa1.post('/api/fornecedores').send({ nome: 'Fio Sul' });
    const ordem = await empresa1.post('/api/ordens').send({
      cliente: 'Cliente OP',
      cliente_id: cliente.body.id,
      produto: 'Camisa OP',
      produto_id: produto.body.id,
      tamanho: 'G',
      quantidade: 2,
    });
    const pedido = await empresa1.post('/api/pedidos').send({
      cliente_id: cliente.body.id,
      itens: [
        {
          produto_id: produto.body.id,
          variante_id: variante.id,
          quantidade: 1,
          preco_unitario: 40,
        },
      ],
    });
    const compra = await empresa1.post('/api/compras').send({
      fornecedor_id: fornecedor.body.id,
    });
    const lancamento = await empresa1.post('/api/financeiro/lancamentos').send({
      tipo: 'pagar',
      descricao: 'Conta empresa 1',
      valor: 10,
    });
    const estoque = await empresa1.post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 5,
      materia_prima_id: materia.body.id,
      motivo: 'Ajuste teste',
    });

    expect(ordem.status).toBe(201);
    expect(pedido.status).toBe(201);
    expect(compra.status).toBe(201);
    expect(lancamento.status).toBe(201);
    expect(estoque.status).toBe(201);

    expect((await empresa2.get(`/api/ordens/${ordem.body.id}`)).status).toBe(404);
    expect((await empresa2.get('/api/ordens')).body).toEqual([]);
    expect((await empresa2.get(`/api/compras/${compra.body.id}`)).status).toBe(404);
    expect((await empresa2.get('/api/compras')).body.total).toBe(0);
    expect((await empresa2.get(`/api/financeiro/lancamentos/${lancamento.body.id}`)).status).toBe(404);
    expect((await empresa2.get('/api/financeiro/lancamentos')).body.total).toBe(0);
    expect((await empresa2.get(`/api/estoque/${estoque.body.saldo.id}`)).status).toBe(404);
    expect((await empresa2.get('/api/estoque')).body.total).toBe(0);

    const expedir = await empresa2.post(`/api/expedicao/${pedido.body.id}/pronto-envio`);
    expect(expedir.status).toBe(404);

    const resumo = await empresa2.get('/api/relatorios/resumo');
    expect(resumo.status).toBe(200);
    expect(resumo.body.ordens).toBe(0);
    expect(resumo.body.vendas).toBe(0);
    expect(resumo.body.compras).toBe(0);
  });
});
