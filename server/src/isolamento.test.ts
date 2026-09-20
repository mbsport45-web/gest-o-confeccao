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

  it('não conta pedido atrasado nem aceita vínculo financeiro de outra empresa', async () => {
    const cliente = await empresa1.post('/api/clientes').send({ nome: 'Cliente Atraso' });
    const produto = await empresa1.post('/api/produtos').send({
      sku: 'CAM-ATR',
      nome: 'Camisa Atraso',
      cores: ['Verde'],
      tamanhos: ['P'],
      preco_venda: 30,
    });
    const variante = (produto.body.variantes as Array<{ id: number }>)[0];
    const pedido = await empresa1.post('/api/pedidos').send({
      cliente_id: cliente.body.id,
      data_prevista: '2000-01-01',
      itens: [
        {
          produto_id: produto.body.id,
          variante_id: variante.id,
          quantidade: 1,
          preco_unitario: 30,
        },
      ],
    });
    const fornecedor = await empresa1.post('/api/fornecedores').send({ nome: 'Fornecedor Atraso' });
    const materia = await empresa1.post('/api/materias-primas').send({
      codigo: 'MAT-ATR',
      nome: 'Linha atraso',
      tipo: 'linha',
    });
    const compra = await empresa1.post('/api/compras').send({
      fornecedor_id: fornecedor.body.id,
      itens: [{ materia_prima_id: materia.body.id, quantidade: 1, custo_unitario: 2 }],
    });
    const ordem = await empresa1.post('/api/ordens').send({
      cliente_id: cliente.body.id,
      produto_id: produto.body.id,
      tamanho: 'P',
      quantidade: 1,
    });
    expect(pedido.status).toBe(201);
    expect(compra.status).toBe(201);
    expect(ordem.status).toBe(201);

    const resumo1 = await empresa1.get('/api/pedidos/resumo');
    expect(resumo1.status).toBe(200);
    expect(resumo1.body.atrasados).toBe(1);

    const resumo2 = await empresa2.get('/api/pedidos/resumo');
    expect(resumo2.status).toBe(200);
    expect(resumo2.body.atrasados).toBe(0);
    expect(resumo2.body.total).toBe(0);
    expect(resumo2.body.total_vendido).toBe(0);

    const pedidoAlheio = await empresa2.post('/api/financeiro/lancamentos').send({
      tipo: 'receber',
      descricao: 'Vínculo indevido',
      valor: 30,
      pedido_id: pedido.body.id,
    });
    expect(pedidoAlheio.status).toBe(404);
    expect(pedidoAlheio.body.pedido_codigo).toBeUndefined();

    const compraAlheia = await empresa2.post('/api/financeiro/lancamentos').send({
      tipo: 'pagar',
      descricao: 'Compra indevida',
      valor: 2,
      compra_id: compra.body.id,
    });
    expect(compraAlheia.status).toBe(404);
    expect(compraAlheia.body.compra_codigo).toBeUndefined();

    const ordemAlheia = await empresa2.post('/api/financeiro/lancamentos').send({
      tipo: 'pagar',
      descricao: 'OP indevida',
      valor: 1,
      ordem_id: ordem.body.id,
    });
    expect(ordemAlheia.status).toBe(404);

    const proprio = await empresa2.post('/api/financeiro/lancamentos').send({
      tipo: 'receber',
      descricao: 'Conta própria',
      valor: 9,
    });
    expect(proprio.status).toBe(201);

    const patchCliente = await empresa2
      .patch(`/api/financeiro/lancamentos/${proprio.body.id}`)
      .send({ cliente_id: cliente.body.id });
    expect(patchCliente.status).toBe(404);
    expect(patchCliente.body.cliente).toBeUndefined();

    const original = await empresa2.get(`/api/financeiro/lancamentos/${proprio.body.id}`);
    expect(original.status).toBe(200);
    expect(original.body.cliente_id).toBeNull();
  });

  it('bloqueia as demais rotas e FKs de outra empresa', async () => {
    const cliente = await empresa1.post('/api/clientes').send({ nome: 'Cliente Completo' });
    const produto = await empresa1.post('/api/produtos').send({
      sku: 'CAM-FULL',
      nome: 'Camisa Completa',
      cores: ['Azul'],
      tamanhos: ['M'],
      preco_venda: 80,
    });
    const variante = (produto.body.variantes as Array<{ id: number }>)[0];
    const materia = await empresa1.post('/api/materias-primas').send({
      codigo: 'MAT-FULL',
      nome: 'Malha completa',
      tipo: 'tecido',
    });
    const fornecedor = await empresa1.post('/api/fornecedores').send({ nome: 'Fornecedor Completo' });
    const pedido = await empresa1.post('/api/pedidos').send({
      cliente_id: cliente.body.id,
      itens: [
        {
          produto_id: produto.body.id,
          variante_id: variante.id,
          quantidade: 2,
          preco_unitario: 80,
        },
      ],
    });
    const itemPedido = (pedido.body.itens as Array<{ id: number }>)[0];
    const ordem = await empresa1.post('/api/ordens').send({
      cliente_id: cliente.body.id,
      produto_id: produto.body.id,
      variante_id: variante.id,
      tamanho: 'M',
      quantidade: 2,
    });
    const fluxo = await empresa1.post('/api/etapas/fluxo').send({ ordem_id: ordem.body.id });
    const etapa = (fluxo.body.data as Array<{ id: number }>)[0];
    const compra = await empresa1.post('/api/compras').send({
      fornecedor_id: fornecedor.body.id,
      itens: [{ materia_prima_id: materia.body.id, quantidade: 4, custo_unitario: 3 }],
    });
    const itemCompra = (compra.body.itens as Array<{ id: number }>)[0];
    const lancamento = await empresa1.post('/api/financeiro/lancamentos').send({
      tipo: 'pagar',
      descricao: 'Conta completa',
      valor: 12,
    });
    const estoque = await empresa1.post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 8,
      materia_prima_id: materia.body.id,
      motivo: 'Ajuste isolamento',
    });
    const ficha = await empresa1.put('/api/ordens/ficha-tecnica').send({
      produto_id: produto.body.id,
      variante_id: variante.id,
      itens: [{ materia_prima_id: materia.body.id, quantidade: 0.2 }],
    });

    expect(cliente.status).toBe(201);
    expect(produto.status).toBe(201);
    expect(pedido.status).toBe(201);
    expect(ordem.status).toBe(201);
    expect(fluxo.status).toBe(201);
    expect(compra.status).toBe(201);
    expect(lancamento.status).toBe(201);
    expect(estoque.status).toBe(201);
    expect(ficha.status).toBe(200);

    const ids = {
      cliente: cliente.body.id as number,
      produto: produto.body.id as number,
      variante: variante.id,
      materia: materia.body.id as number,
      fornecedor: fornecedor.body.id as number,
      pedido: pedido.body.id as number,
      itemPedido: itemPedido.id,
      ordem: ordem.body.id as number,
      etapa: etapa.id,
      compra: compra.body.id as number,
      itemCompra: itemCompra.id,
      lancamento: lancamento.body.id as number,
      saldo: estoque.body.saldo.id as number,
    };

    expect((await empresa2.patch(`/api/clientes/${ids.cliente}/status`).send({ status: 'inativo' })).status).toBe(404);
    expect((await empresa2.patch(`/api/produtos/${ids.produto}`).send({ nome: 'Invadido' })).status).toBe(404);
    expect((await empresa2.patch(`/api/produtos/${ids.produto}/status`).send({ status: 'inativo' })).status).toBe(404);
    expect((await empresa2.delete(`/api/produtos/${ids.produto}`)).status).toBe(404);
    expect(
      (
        await empresa2.post(`/api/produtos/${ids.produto}/variantes`).send({
          cor: 'Rosa',
          tamanho: 'G',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await empresa2.patch(`/api/produtos/${ids.produto}/variantes/${ids.variante}`).send({
          preco_venda: 1,
        })
      ).status,
    ).toBe(404);
    expect((await empresa2.delete(`/api/produtos/${ids.produto}/variantes/${ids.variante}`)).status).toBe(404);
    expect((await empresa2.patch(`/api/materias-primas/${ids.materia}`).send({ nome: 'X' })).status).toBe(404);
    expect(
      (await empresa2.patch(`/api/materias-primas/${ids.materia}/status`).send({ status: 'inativo' })).status,
    ).toBe(404);
    expect((await empresa2.delete(`/api/materias-primas/${ids.materia}`)).status).toBe(404);
    expect((await empresa2.patch(`/api/fornecedores/${ids.fornecedor}`).send({ nome: 'X' })).status).toBe(404);
    expect((await empresa2.delete(`/api/fornecedores/${ids.fornecedor}`)).status).toBe(404);
    expect((await empresa2.patch(`/api/ordens/${ids.ordem}`).send({ quantidade: 99 })).status).toBe(404);
    expect((await empresa2.delete(`/api/ordens/${ids.ordem}`)).status).toBe(404);
    expect((await empresa2.get(`/api/etapas/${ids.etapa}`)).status).toBe(404);
    expect((await empresa2.patch(`/api/etapas/${ids.etapa}`).send({ observacoes: 'x' })).status).toBe(404);
    expect((await empresa2.delete(`/api/etapas/${ids.etapa}`)).status).toBe(404);
    expect((await empresa2.post('/api/etapas/fluxo').send({ ordem_id: ids.ordem })).status).toBe(404);
    expect((await empresa2.post('/api/etapas').send({ ordem_id: ids.ordem, tipo: 'corte' })).status).toBe(404);
    expect((await empresa2.get('/api/etapas').query({ ordem_id: ids.ordem })).body.total).toBe(0);
    expect((await empresa2.delete(`/api/pedidos/${ids.pedido}`)).status).toBe(404);
    expect(
      (
        await empresa2.post(`/api/pedidos/${ids.pedido}/itens`).send({
          produto_id: ids.produto,
          variante_id: ids.variante,
          quantidade: 1,
          preco_unitario: 80,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await empresa2.patch(`/api/pedidos/${ids.pedido}/itens/${ids.itemPedido}`).send({ quantidade: 9 })
      ).status,
    ).toBe(404);
    expect((await empresa2.delete(`/api/pedidos/${ids.pedido}/itens/${ids.itemPedido}`)).status).toBe(404);
    expect((await empresa2.post(`/api/pedidos/${ids.pedido}/gerar-op`)).status).toBe(404);
    expect((await empresa2.post(`/api/pedidos/${ids.pedido}/financeiro`)).status).toBe(404);
    expect((await empresa2.patch(`/api/compras/${ids.compra}`).send({ observacoes: 'x' })).status).toBe(404);
    expect((await empresa2.delete(`/api/compras/${ids.compra}`)).status).toBe(404);
    expect(
      (
        await empresa2.post(`/api/compras/${ids.compra}/itens`).send({
          materia_prima_id: ids.materia,
          quantidade: 1,
          custo_unitario: 1,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await empresa2.patch(`/api/compras/${ids.compra}/itens/${ids.itemCompra}`).send({ quantidade: 9 })
      ).status,
    ).toBe(404);
    expect((await empresa2.delete(`/api/compras/${ids.compra}/itens/${ids.itemCompra}`)).status).toBe(404);
    expect((await empresa2.post(`/api/compras/${ids.compra}/receber`)).status).toBe(404);
    expect((await empresa2.patch(`/api/financeiro/lancamentos/${ids.lancamento}`).send({ valor: 1 })).status).toBe(
      404,
    );
    expect((await empresa2.delete(`/api/financeiro/lancamentos/${ids.lancamento}`)).status).toBe(404);
    expect((await empresa2.get(`/api/estoque/${ids.saldo}`)).status).toBe(404);
    expect((await empresa2.get('/api/estoque/movimentos').query({ saldo_id: ids.saldo })).body.total).toBe(0);
    expect((await empresa2.post(`/api/expedicao/${ids.pedido}/pronto-envio`)).status).toBe(404);
    expect((await empresa2.post(`/api/expedicao/${ids.pedido}/expedir`)).status).toBe(404);
    expect((await empresa2.post(`/api/expedicao/${ids.pedido}/entregar`)).status).toBe(404);
    expect((await empresa2.get('/api/expedicao')).body.total).toBe(0);
    expect((await empresa2.get('/api/expedicao/resumo')).body).toMatchObject({
      fila: 0,
      prontos_envio: 0,
      expedidos: 0,
      entregues: 0,
    });
    expect((await empresa2.get('/api/pedidos/resumo')).body.total).toBe(0);
    expect((await empresa2.get('/api/financeiro/resumo')).body.contas_pagar).toBe(0);
    expect((await empresa2.get('/api/ordens/ficha-tecnica').query({ produto_id: ids.produto })).status).toBe(404);
    expect(
      (
        await empresa2.put('/api/ordens/ficha-tecnica').send({
          produto_id: ids.produto,
          variante_id: ids.variante,
          itens: [{ materia_prima_id: ids.materia, quantidade: 1 }],
        })
      ).status,
    ).toBe(404);

    expect((await empresa2.post('/api/ordens').send({ cliente_id: ids.cliente, produto: 'X', tamanho: 'M', quantidade: 1 })).status).toBe(400);
    expect(
      (
        await empresa2.post('/api/estoque/movimentos').send({
          tipo: 'entrada',
          quantidade: 1,
          materia_prima_id: ids.materia,
          motivo: 'Invasão',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await empresa2.post('/api/compras').send({
          fornecedor_id: ids.fornecedor,
          itens: [{ materia_prima_id: ids.materia, quantidade: 1, custo_unitario: 1 }],
        })
      ).status,
    ).toBe(404);

    const relatorios = [
      '/api/relatorios/estoque',
      '/api/relatorios/compras',
      '/api/relatorios/producao',
      '/api/relatorios/vendas',
    ];
    for (const rota of relatorios) {
      const res = await empresa2.get(rota);
      expect(res.status).toBe(200);
      expect(res.body.total ?? 0).toBe(0);
    }
    const financeiroRel = await empresa2.get('/api/relatorios/financeiro');
    expect(financeiroRel.status).toBe(200);
    expect(financeiroRel.body.total).toBe(0);
    const custos = await empresa2.get('/api/relatorios/custos');
    expect(custos.status).toBe(200);
    expect(custos.body.totais.compras).toBe(0);
    expect(custos.body.totais.estoque_materiais).toBe(0);

    const proprioCliente = await empresa2.post('/api/clientes').send({ nome: 'Cliente Isolado' });
    const proprioProduto = await empresa2.post('/api/produtos').send({
      sku: 'CAM-ISO',
      nome: 'Camisa Isolada',
      cores: ['Preto'],
      tamanhos: ['M'],
      preco_venda: 40,
    });
    const proprioPedido = await empresa2.post('/api/pedidos').send({
      cliente_id: proprioCliente.body.id,
    });
    const itemAlheioNoProprio = await empresa2.post(`/api/pedidos/${proprioPedido.body.id}/itens`).send({
      produto_id: ids.produto,
      variante_id: ids.variante,
      quantidade: 1,
      preco_unitario: 80,
    });
    expect(itemAlheioNoProprio.status).toBe(404);

    const proprioFornecedor = await empresa2.post('/api/fornecedores').send({ nome: 'Fornecedor Isolado' });
    const propriaCompra = await empresa2.post('/api/compras').send({
      fornecedor_id: proprioFornecedor.body.id,
    });
    const itemCompraAlheio = await empresa2.post(`/api/compras/${propriaCompra.body.id}/itens`).send({
      materia_prima_id: ids.materia,
      quantidade: 1,
      custo_unitario: 1,
    });
    expect(itemCompraAlheio.status).toBe(404);

    const fichaAlheia = await empresa2.put('/api/ordens/ficha-tecnica').send({
      produto_id: proprioProduto.body.id,
      variante_id: ids.variante,
      itens: [{ materia_prima_id: ids.materia, quantidade: 1 }],
    });
    expect(fichaAlheia.status).toBe(404);

    const estoqueAlheio = await empresa2.post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 1,
      variante_id: ids.variante,
      motivo: 'Invasão variante',
    });
    expect(estoqueAlheio.status).toBe(404);

    const me1 = await empresa1.get('/api/me');
    const me2 = await empresa2.get('/api/me');
    expect(me1.body.empresa.id).toBe(1);
    expect(me2.body.empresa.id).not.toBe(me1.body.empresa.id);

    const vendasProprias = await empresa2.get('/api/relatorios/vendas');
    expect(vendasProprias.status).toBe(200);
    expect((vendasProprias.body.data as Array<{ id: number }>).map((p) => p.id)).not.toContain(ids.pedido);

    const categorias1 = await empresa1.get('/api/financeiro/categorias');
    const categorias2 = await empresa2.get('/api/financeiro/categorias');
    expect(categorias1.status).toBe(200);
    expect(categorias2.status).toBe(200);
    expect(categorias2.body.total).toBe(categorias1.body.total);
  });
});
