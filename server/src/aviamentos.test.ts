import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';
import { autenticar, autenticarNovaEmpresa, type TestApi } from './httpTest.js';
import { moduloDaRota } from './papeis.js';
import { pdfComTexto } from './pdfTexto.js';

describe('API de aviamentos', () => {
  let db: AppDatabase;
  let api: TestApi;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    api = await autenticar(createApp(db));
  });

  afterEach(() => {
    db.close();
  });

  it('responde no módulo de materiais', () => {
    expect(moduloDaRota('/api/aviamentos')).toBe('materiais');
    expect(moduloDaRota('/api/aviamentos/4/movimentos')).toBe('materiais');
  });

  it('cadastra cadarço por cor, busca e inativa sem apagar o histórico', async () => {
    const criado = await api.post('/api/aviamentos').send({
      codigo: 'CAD-01',
      categoria: 'cadarco',
      nome: 'Cadarço chato',
      modelo: 'CH-15',
      unidade: 'MT',
      estoque_minimo: 10,
      variantes: [{ cor: 'Preto' }, { cor: 'Branco' }],
    });
    expect(criado.status).toBe(201);
    expect(criado.body.variantes).toHaveLength(2);
    expect(criado.body.variantes.every((variante: { quantidade: number }) => variante.quantidade === 0)).toBe(true);

    const busca = await api.get('/api/aviamentos').query({ q: 'branco' });
    expect(busca.body.total).toBe(1);
    expect(busca.body.data[0].nome).toBe('Cadarço chato');

    const varianteId = criado.body.variantes[0].id as number;
    const entrada = await api.post('/api/aviamentos/movimentos').send({
      variante_id: varianteId,
      tipo: 'entrada',
      quantidade: 25,
      motivo: 'Compra avulsa',
    });
    expect(entrada.status).toBe(201);
    expect(entrada.body.saldo_posterior).toBe(25);

    const baixa = await api.post('/api/aviamentos/movimentos').send({
      variante_id: varianteId,
      tipo: 'saida',
      quantidade: 5,
    });
    expect(baixa.status).toBe(201);
    expect(baixa.body.saldo_posterior).toBe(20);

    const insuficiente = await api.post('/api/aviamentos/movimentos').send({
      variante_id: varianteId,
      tipo: 'saida',
      quantidade: 21,
    });
    expect(insuficiente.status).toBe(409);
    expect(insuficiente.body.erro).toBe('Estoque insuficiente para a saída');

    const ajuste = await api.post('/api/aviamentos/movimentos').send({
      variante_id: varianteId,
      tipo: 'ajuste',
      quantidade: 18,
    });
    expect(ajuste.status).toBe(400);

    const ajusteOk = await api.post('/api/aviamentos/movimentos').send({
      variante_id: varianteId,
      tipo: 'ajuste',
      quantidade: 18,
      motivo: 'Contagem',
    });
    expect(ajusteOk.status).toBe(201);
    expect(ajusteOk.body.saldo_posterior).toBe(18);

    const saldo = (await api.get(`/api/aviamentos/${criado.body.id}`)).body.variantes
      .find((variante: { id: number }) => variante.id === varianteId);
    expect(saldo.quantidade).toBe(18);

    const inativo = await api.patch(`/api/aviamentos/${criado.body.id}/status`).send({ status: 'inativo' });
    expect(inativo.status).toBe(200);
    expect(inativo.body.status).toBe('inativo');
    expect(inativo.body.variantes.every((variante: { status: string }) => variante.status === 'inativo')).toBe(true);
    const historico = await api.get(`/api/aviamentos/${criado.body.id}/movimentos`);
    expect(historico.body.data).toHaveLength(3);

    const exclusao = await api.delete(`/api/aviamentos/${criado.body.id}`);
    expect(exclusao.status).toBe(409);
  });

  it('guarda o consumo por peça sem movimentar estoque nem matéria-prima', async () => {
    const tecido = await api.post('/api/materias-primas').send({
      nome: 'Malha dry',
      tipo: 'tecido',
      unidade: 'KG',
    });
    expect(tecido.status).toBe(201);
    const entradaTecido = await api.post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 12,
      materia_prima_id: tecido.body.id,
      motivo: 'Rolo',
    });
    expect(entradaTecido.status).toBe(201);

    const saquinho = await api.post('/api/aviamentos').send({
      categoria: 'saquinho',
      nome: 'Saquinho zip',
      modelo: '20x30',
      consumo_por_peca: 1,
      variantes: [{ tamanho: 'M' }],
    });
    expect(saquinho.status).toBe(201);
    expect(saquinho.body.consumo_por_peca).toBe(1);
    expect(saquinho.body.variantes[0].quantidade).toBe(0);

    const etiqueta = await api.post('/api/aviamentos').send({
      categoria: 'etiqueta_tamanho',
      nome: 'Etiqueta interna',
      variantes: [{ tamanho: 'P' }, { tamanho: 'G' }],
    });
    expect(etiqueta.status).toBe(201);
    expect(etiqueta.body.consumo_por_peca).toBe(1);
    expect(etiqueta.body.variantes.map((variante: { tamanho: string }) => variante.tamanho)).toEqual(['P', 'G']);

    const movimentosAviamento = db
      .prepare('SELECT COUNT(*) AS n FROM aviamento_movimentos')
      .get() as { n: number };
    expect(movimentosAviamento.n).toBe(0);
    const saldoTecido = db
      .prepare('SELECT quantidade FROM estoque_saldos WHERE materia_prima_id = ?')
      .get(tecido.body.id) as { quantidade: number };
    expect(saldoTecido.quantidade).toBe(12);
    expect((await api.get('/api/materias-primas')).body.total).toBe(1);
  });

  it('rejeita cadastro incompleto e isola por empresa', async () => {
    const semCor = await api.post('/api/aviamentos').send({
      categoria: 'cadarco',
      nome: 'Cadarço',
      modelo: 'Fino',
      variantes: [{ tamanho: '2' }],
    });
    expect(semCor.status).toBe(400);
    expect(semCor.body.erro).toBe('Cadarço exige ao menos uma cor');

    const tag = await api.post('/api/aviamentos').send({
      categoria: 'tag',
      nome: 'Tag tecido',
      marca: 'MB',
      modelo: 'Costas',
    });
    expect(tag.status).toBe(201);
    expect(tag.body.variantes).toHaveLength(1);

    const adesivo = await api.post('/api/aviamentos').send({
      categoria: 'adesivo',
      nome: 'Adesivo logo',
      marca: 'MB',
      modelo: 'Peito',
      variantes: [{ tamanho: 'P' }],
    });
    expect(adesivo.status).toBe(201);

    const outra = await autenticarNovaEmpresa(createApp(db));
    const listaAlheia = await outra.api.get('/api/aviamentos');
    expect(listaAlheia.body.total).toBe(0);
    const detalheAlheio = await outra.api.get(`/api/aviamentos/${adesivo.body.id}`);
    expect(detalheAlheio.status).toBe(404);
    const movimentoAlheio = await outra.api.post('/api/aviamentos/movimentos').send({
      variante_id: adesivo.body.variantes[0].id,
      tipo: 'entrada',
      quantidade: 3,
    });
    expect(movimentoAlheio.status).toBe(404);
  });

  it('recebe compra no saldo do aviamento sem criar matéria-prima', async () => {
    const fornecedor = await api.post('/api/fornecedores').send({
      nome: 'Etiquetas Sul',
      cpf_cnpj: '11444777000161',
      cidade: 'Brusque',
      estado: 'SC',
    });
    expect(fornecedor.status).toBe(201);
    const adesivo = await api.post('/api/aviamentos').send({
      categoria: 'adesivo',
      nome: 'Adesivo logo',
      marca: 'MB Sport',
      modelo: 'Peito',
      variantes: [{ tamanho: 'M' }],
    });
    const compra = await api.post('/api/compras').send({
      fornecedor_id: fornecedor.body.id,
      confirmar: true,
      itens: [{
        aviamento_variante_id: adesivo.body.variantes[0].id,
        quantidade: 40,
        custo_unitario: 0.35,
        unidade: 'UN',
      }],
    });
    expect(compra.status).toBe(201);
    expect(compra.body.itens[0].aviamento_variante_id).toBe(adesivo.body.variantes[0].id);
    expect(compra.body.itens[0].materia_prima_id).toBeNull();
    const saldo = await api.get(`/api/aviamentos/${adesivo.body.id}`);
    expect(saldo.body.variantes[0].quantidade).toBe(40);
    expect((await api.get('/api/materias-primas')).body.total).toBe(0);
    expect((await api.get('/api/estoque')).body.total).toBe(0);
  });

  it('sugere o aviamento cadastrado na leitura do documento sem criar matéria-prima', async () => {
    const adesivo = await api.post('/api/aviamentos').send({
      categoria: 'adesivo',
      nome: 'Adesivo logo',
      marca: 'MB Sport',
      modelo: 'Peito',
      variantes: [{ tamanho: 'M' }],
    });
    expect(adesivo.status).toBe(201);
    const pdf = pdfComTexto([
      'NF-e 4410',
      'Fornecedor: Etiquetas Sul',
      '10/10/2026',
      'Adesivo logo Peito MB Sport M 10 UN 1,00 10,00',
      'Valor total da nota 10,00',
    ]);
    const res = await api.post('/api/compras/documentos').send({
      tipo: 'nota_fiscal',
      nome_arquivo: 'adesivo.pdf',
      conteudo_base64: pdf.toString('base64'),
    });
    expect(res.status).toBe(201);
    expect(res.body.itens[0]).toMatchObject({
      materia_prima_id: null,
      produto_id: null,
      aviamento_variante_id: adesivo.body.variantes[0].id,
    });
    expect((await api.get('/api/materias-primas')).body.total).toBe(0);
    expect((await api.get('/api/compras')).body.total).toBe(0);
  });
});
