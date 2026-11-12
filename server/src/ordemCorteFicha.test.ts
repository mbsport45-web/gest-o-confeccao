import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';
import { autenticar, autenticarNovaEmpresa, type TestApi } from './httpTest.js';
import { composicaoImpressaoOc, pdfImpressaoOrdemCorte } from './ordemCortePdf.js';
import type { ExtraImpressaoOc, OrdemCorte } from './ordensGrade.js';

describe('ficha editável da ordem de corte', () => {
  let db: AppDatabase;
  let api: TestApi;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    api = await autenticar(createApp(db));
  });

  afterEach(() => {
    db.close();
  });

  async function criarOpComCorte() {
    const materia = await api.post('/api/materias-primas').send({
      codigo: 'MALHA-OC',
      nome: 'Malha PV',
      tipo: 'tecido',
      unidade: 'KG',
      composicao: '67% poliester 33% viscose',
    });
    const produto = await api.post('/api/produtos').send({
      sku: 'CAM-FICHA',
      nome: 'Camiseta Ficha',
    });
    const op = await api.post('/api/ordens').send({
      cliente: 'Loja Ficha',
      produto_id: produto.body.id,
      quantidade: 6,
      observacoes: 'Cortar com folga',
      data_prevista: '2026-11-20',
      requisitos: [{ materia_prima_id: materia.body.id, quantidade: 0.2 }],
      grade: [
        { cor: 'Preto', tamanho: 'M', quantidade: 4 },
        { cor: 'Preto', tamanho: 'G', quantidade: 2 },
      ],
      status: 'planejada',
    });
    const corte = await api.post(`/api/ordens/${op.body.id}/ordem-corte`).send({});
    return {
      op: op.body as { id: number },
      corte: corte.body as { id: number; codigo: string },
      materia: materia.body as { id: number },
    };
  }

  it('semeia a ficha a partir da OP, produto, tecido e grade sem duplicar cadastro', async () => {
    const { op, corte, materia } = await criarOpComCorte();
    expect(corte.codigo).toBe('OC-01');

    const ficha = await api.get(`/api/ordens/${op.id}/ordem-corte`);
    expect(ficha.status).toBe(200);
    expect(ficha.body.modelo).toBe('Camiseta Ficha');
    expect(ficha.body.referencia).toBe('CAM-FICHA');
    expect(ficha.body.composicao).toBe('67% poliester 33% viscose');
    expect(ficha.body.materia_prima_id).toBe(materia.id);
    expect(ficha.body.informacoes_oficina).toBe('Cortar com folga');
    expect(ficha.body.data_retirada).toBe('2026-11-20');
    expect(ficha.body.tamanhos).toEqual(expect.arrayContaining(['P', 'M', 'G', 'GG', 'XG']));
    expect(ficha.body.linhas).toEqual([expect.objectContaining({ cor: 'Preto', detalhes: '' })]);
    expect(ficha.body.aviamentos).toEqual([]);
    expect(ficha.body.oficinas).toEqual([]);
    expect(ficha.body.materiais).toHaveLength(1);
    expect(ficha.body.materiais[0].nome).toBe('Malha PV');
    expect(ficha.body.materiais[0].quantidade_total).toBeCloseTo(1.2);

    const repetida = await api.post(`/api/ordens/${op.id}/ordem-corte`).send({});
    expect(repetida.status).toBe(200);
    expect(repetida.body.id).toBe(corte.id);
    const total = db.prepare('SELECT COUNT(*) AS n FROM ordens_corte').get() as { n: number };
    expect(total.n).toBe(1);
  });

  it('edita todos os blocos, calcula totais, guarda histórico e reabre a ficha salva', async () => {
    const { op } = await criarOpComCorte();
    const aviamento = await api.post('/api/aviamentos').send({
      codigo: 'ETQ-01',
      categoria: 'etiqueta_tamanho',
      nome: 'Etiqueta composição',
      unidade: 'UN',
      consumo_por_peca: 1,
      variantes: [{ tamanho: 'M' }, { tamanho: 'G' }],
    });
    expect(aviamento.status).toBe(201);

    const salva = await api.patch(`/api/ordens/${op.id}/ordem-corte`).send({
      modelo: 'Camiseta Dry',
      composicao: '100% poliéster',
      referencia: 'DRY-01',
      informacoes_oficina: 'Não refilar gola',
      data_retirada: '2026-11-21',
      informacoes_costureiros: 'Costura 4 fios',
      informacoes_acabamento: 'Passar e embalar',
      tamanhos: ['P', 'M', 'G', 'GG', 'XG'],
      linhas: [
        { cor: 'Preto', detalhes: 'Gola redonda' },
        { cor: 'Branco', detalhes: 'Gola V' },
      ],
      grade: [
        { cor: 'Preto', tamanho: 'P', quantidade: 1 },
        { cor: 'Preto', tamanho: 'M', quantidade: 2 },
        { cor: 'Preto', tamanho: 'G', quantidade: 1 },
        { cor: 'Preto', tamanho: 'GG', quantidade: 0 },
        { cor: 'Preto', tamanho: 'XG', quantidade: 0 },
        { cor: 'Branco', tamanho: 'P', quantidade: 0 },
        { cor: 'Branco', tamanho: 'M', quantidade: 3 },
        { cor: 'Branco', tamanho: 'G', quantidade: 1 },
        { cor: 'Branco', tamanho: 'GG', quantidade: 1 },
        { cor: 'Branco', tamanho: 'XG', quantidade: 0 },
      ],
      aviamentos: [
        {
          aviamento_id: aviamento.body.id,
          descricao: 'Etiqueta composição',
          quantidade: 9,
          unidade: 'UN',
        },
      ],
      oficinas: [
        { oficina: 'Oficina Norte', costureiro: 'Ana' },
        { oficina: 'Oficina Sul', costureiro: 'Paulo', observacoes: 'Acabamento' },
      ],
    });
    expect(salva.status).toBe(200);
    expect(salva.body.modelo).toBe('Camiseta Dry');
    expect(salva.body.quantidade).toBe(9);
    expect(salva.body.oficinas).toHaveLength(2);
    expect(salva.body.aviamentos[0]).toEqual(
      expect.objectContaining({
        aviamento_id: aviamento.body.id,
        descricao: 'Etiqueta composição',
        quantidade: 9,
      }),
    );

    const reaberta = await api.get(`/api/ordens/${op.id}/ordem-corte`);
    expect(reaberta.body.referencia).toBe('DRY-01');
    expect(reaberta.body.linhas).toEqual([
      { cor: 'Preto', detalhes: 'Gola redonda' },
      { cor: 'Branco', detalhes: 'Gola V' },
    ]);
    expect(reaberta.body.informacoes_acabamento).toBe('Passar e embalar');

    const historico = await api.get(`/api/ordens/${op.id}/ordem-corte/historico`);
    expect(historico.status).toBe(200);
    expect(historico.body.data.length).toBeGreaterThanOrEqual(2);
    expect(historico.body.data.some((item: { acao: string }) => item.acao === 'criar')).toBe(true);
    expect(historico.body.data.some((item: { acao: string }) => item.acao === 'editar')).toBe(true);

    const impressao = await api.get(`/api/ordens/${op.id}/ordem-corte/impressao`);
    expect(impressao.status).toBe(200);
    expect(String(impressao.headers['content-type'])).toContain('text/html');
    expect(impressao.text).toContain('Ficha de produção');
    expect(impressao.text).toContain('Camiseta Dry');
    expect(impressao.text).toContain('Oficina Norte');
    expect(impressao.text).toContain('Etiqueta composição');
    expect(impressao.text).toContain('XG');
    expect(impressao.text).toContain('class="folha"');
    expect(impressao.text).not.toContain('1. Modelo');
    expect(impressao.text).toMatch(
      /<div class="lab">Cliente<\/div>[\s\S]*<div class="lab">Modelo<\/div>[\s\S]*<div class="lab">REF<\/div>[\s\S]*<div class="lab">Composição<\/div>[\s\S]*Aviamentos[\s\S]*Oficina — Costureiro[\s\S]*Informações para oficina[\s\S]*Data de retirada[\s\S]*Informações dos costureiros[\s\S]*Detalhes[\s\S]*Informações acabamento/,
    );
    expect(impressao.text).toContain('Gola redonda');
    expect(impressao.text).toContain('Costura 4 fios');
    expect(impressao.text).toContain('Passar e embalar');
    expect(impressao.text).toContain('Loja Ficha');
    expect(impressao.text).not.toContain('<div class="lab">Tecido</div>');
  });

  it('usa a composição do tecido no semeio e persiste código e observações na mesma OC', async () => {
    const materia = await api.post('/api/materias-primas').send({
      codigo: 'PV-COMP',
      nome: 'Malha PV Cadastro',
      tipo: 'tecido',
      unidade: 'KG',
      composicao: '67% poliéster 33% viscose',
    });
    expect(materia.status).toBe(201);
    const produto = await api.post('/api/produtos').send({ sku: 'CAM-COMP', nome: 'Camiseta Comp' });
    const op = await api.post('/api/ordens').send({
      cliente: 'Loja Comp',
      produto_id: produto.body.id,
      quantidade: 2,
      requisitos: [{ materia_prima_id: materia.body.id, quantidade: 0.1 }],
      grade: [{ cor: 'Preto', tamanho: 'M', quantidade: 2 }],
      status: 'planejada',
    });
    const corte = await api.post(`/api/ordens/${op.body.id}/ordem-corte`).send({});
    expect(corte.status).toBe(201);
    expect(corte.body.composicao).toBe('67% poliéster 33% viscose');
    expect(corte.body.codigo).toBe('OC-01');

    const salva = await api.patch(`/api/ordens/${op.body.id}/ordem-corte`).send({
      codigo: 'OC-FICHA',
      composicao: '100% algodão editado',
      observacoes: 'Obs persistida',
    });
    expect(salva.status).toBe(200);
    expect(salva.body.id).toBe(corte.body.id);
    expect(salva.body.codigo).toBe('OC-01');
    expect(salva.body.composicao).toBe('100% algodão editado');
    expect(salva.body.observacoes).toBe('Obs persistida');

    const reaberta = await api.get(`/api/ordens/${op.body.id}/ordem-corte`);
    expect(reaberta.body.id).toBe(corte.body.id);
    expect(reaberta.body.codigo).toBe('OC-01');
    expect(reaberta.body.observacoes).toBe('Obs persistida');

    const repetida = await api.post(`/api/ordens/${op.body.id}/ordem-corte`).send({});
    expect(repetida.body.id).toBe(corte.body.id);
    expect(db.prepare('SELECT COUNT(*) AS n FROM ordens_corte').get() as { n: number }).toEqual({ n: 1 });
  });

  it('rejeita aviamento de outro cadastro e isola a ficha entre empresas', async () => {
    const { op } = await criarOpComCorte();
    const app = createApp(db);
    const { api: outra } = await autenticarNovaEmpresa(app);

    const alheio = await outra.get(`/api/ordens/${op.id}/ordem-corte`);
    expect(alheio.status).toBe(404);
    const patchAlheio = await outra.patch(`/api/ordens/${op.id}/ordem-corte`).send({ modelo: 'Invadido' });
    expect(patchAlheio.status).toBe(404);

    const invalido = await api.patch(`/api/ordens/${op.id}/ordem-corte`).send({
      aviamentos: [{ aviamento_id: 9999, descricao: 'Fantasma', quantidade: 1 }],
    });
    expect(invalido.status).toBe(400);
    expect(invalido.body.erro).toBe('Aviamento não encontrado');
  });

  it('envia a mesma OC para a fila, gera PDF com os dados salvos e não duplica nem baixa estoque no envio', async () => {
    const { op, corte, materia } = await criarOpComCorte();
    await api.post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 20,
      materia_prima_id: materia.id,
    });
    const saldoAntes = await api.get('/api/estoque').query({ tipo: 'materia' });
    const qtdAntes = (
      saldoAntes.body.data as Array<{ materia_prima_id: number; quantidade: number }>
    ).find((item) => item.materia_prima_id === materia.id)?.quantidade;

    const vazia = await api.patch(`/api/ordens/${op.id}/ordem-corte`).send({
      modelo: '',
      composicao: '',
    });
    expect(vazia.status).toBe(200);
    const incompleta = await api.post(`/api/ordens/${op.id}/ordem-corte/enviar-enfesto`).send({});
    expect(incompleta.status).toBe(400);

    await api.patch(`/api/ordens/${op.id}/ordem-corte`).send({
      modelo: 'Camiseta Dry',
      composicao: '100% poliéster',
      referencia: 'DRY-01',
      materia_prima_id: materia.id,
      grade: [
        { cor: 'Preto', tamanho: 'M', quantidade: 4 },
        { cor: 'Preto', tamanho: 'G', quantidade: 2 },
      ],
    });

    const enviada = await api.post(`/api/ordens/${op.id}/ordem-corte/enviar-enfesto`).send({});
    expect(enviada.status).toBe(200);
    expect(enviada.body.id).toBe(corte.id);
    expect(enviada.body.status_processo).toBe('aguardando_enfesto');
    expect(enviada.body.enviado_enfesto_em).toBeTruthy();
    expect(enviada.body.enviado_por_nome).toBeTruthy();

    const opEnviada = await api.get(`/api/ordens/${op.id}`);
    expect(opEnviada.body.status).toBe('corte');
    const painelEnvio = await api.get('/api/ordens/producao').query({ etapa: 'corte' });
    expect(painelEnvio.status).toBe(200);
    expect(painelEnvio.body.totais.cadastradas).toBeGreaterThanOrEqual(1);
    const naLinha = (painelEnvio.body.andamento as Array<{ id: number; etapa_linha: string }>).filter(
      (item) => item.id === op.id,
    );
    expect(naLinha).toHaveLength(1);
    expect(naLinha[0].etapa_linha).toBe('corte');
    const costuraNoEnvio = await api.get('/api/ordens/producao').query({ etapa: 'costura' });
    expect(
      (costuraNoEnvio.body.andamento as Array<{ id: number }>).filter((item) => item.id === op.id),
    ).toHaveLength(0);

    const repetida = await api.post(`/api/ordens/${op.id}/ordem-corte/enviar-enfesto`).send({});
    expect(repetida.body.id).toBe(corte.id);
    expect(db.prepare('SELECT COUNT(*) AS n FROM ordens_corte').get() as { n: number }).toEqual({ n: 1 });

    const saldoDepoisEnvio = await api.get('/api/estoque').query({ tipo: 'materia' });
    const qtdDepoisEnvio = (
      saldoDepoisEnvio.body.data as Array<{ materia_prima_id: number; quantidade: number }>
    ).find((item) => item.materia_prima_id === materia.id)?.quantidade;
    expect(qtdDepoisEnvio).toBe(qtdAntes);

    const fila = await api.get('/api/ordens/ordem-corte/fila-enfesto');
    expect(fila.status).toBe(200);
    expect(fila.body.data).toHaveLength(1);
    expect(fila.body.data[0].codigo).toBe(corte.codigo);
    expect(fila.body.data[0].ordem_id).toBe(op.id);

    const pdf = await api.get(`/api/ordens/${op.id}/ordem-corte/pdf`).buffer(true);
    expect(pdf.status).toBe(200);
    expect(String(pdf.headers['content-type'])).toContain('application/pdf');
    expect(String(pdf.headers['content-disposition'])).toContain(`${corte.codigo}-ficha.pdf`);
    const pdfBuf = Buffer.isBuffer(pdf.body) ? pdf.body : Buffer.from(pdf.body);
    const pdfBruto = pdfBuf.toString('latin1');
    const pdfTexto = [...pdfBruto.matchAll(/<([0-9a-fA-F]+)>/g)]
      .map((item) => Buffer.from(item[1], 'hex').toString('latin1'))
      .join('');
    expect(pdfBruto.startsWith('%PDF')).toBe(true);
    expect(pdfTexto).toContain('Camiseta Dry');
    expect(pdfTexto).toContain('100% poli');
    expect(pdfTexto).toContain('DRY-01');
    expect(pdfTexto).toContain(corte.codigo);
    expect(pdfTexto).toContain('MODELO');
    expect(pdfTexto).toContain('COMPOSIÇÃO');
    expect(pdfTexto).toContain('AVIAMENTOS');
    expect(pdfTexto).toMatch(/OFICINA.{1,5}COSTUREIRO/);
    expect(pdfTexto).toContain('INFORMAÇÕES ACABAMENTO');
    expect(pdfTexto).not.toContain('TECIDO');

    const enfesto = await api.post(`/api/ordens/${op.id}/ordem-corte/apontamento`).send({
      acao: 'iniciar_enfesto',
    });
    expect(enfesto.body.status_processo).toBe('em_enfesto');
    const inicioCorte = await api.post(`/api/ordens/${op.id}/ordem-corte/apontamento`).send({
      acao: 'iniciar_corte',
    });
    expect(inicioCorte.body.status_processo).toBe('em_corte');
    const conclusao = await api.post(`/api/ordens/${op.id}/ordem-corte/apontamento`).send({
      acao: 'concluir_corte',
      consumo_real: 1.5,
      quantidade_cortada: 6,
      perdas: 0.2,
      observacoes_corte: 'Corte alinhado',
      materia_prima_id: materia.id,
    });
    expect(conclusao.status).toBe(200);
    expect(conclusao.body.id).toBe(corte.id);
    expect(conclusao.body.status_processo).toBe('corte_concluido');
    const opAposCorte = await api.get(`/api/ordens/${op.id}`);
    expect(opAposCorte.body.status).toBe('costura');
    const painelAposCorte = await api.get('/api/ordens/producao').query({ etapa: 'costura' });
    const naCostura = (painelAposCorte.body.andamento as Array<{ id: number; etapa_linha: string }>).find(
      (item) => item.id === op.id,
    );
    expect(naCostura?.etapa_linha).toBe('costura');
    const corteApos = await api.get('/api/ordens/producao').query({ etapa: 'corte' });
    expect(
      (corteApos.body.andamento as Array<{ id: number }>).filter((item) => item.id === op.id),
    ).toHaveLength(0);
    expect(conclusao.body.consumo_real).toBeCloseTo(1.5);
    expect(conclusao.body.quantidade_cortada).toBe(6);
    expect(conclusao.body.observacoes_corte).toBe('Corte alinhado');

    const saldoDepoisCorte = await api.get('/api/estoque').query({ tipo: 'materia' });
    const qtdDepoisCorte = (
      saldoDepoisCorte.body.data as Array<{ materia_prima_id: number; quantidade: number }>
    ).find((item) => item.materia_prima_id === materia.id)?.quantidade;
    expect(qtdDepoisCorte).toBeCloseTo((qtdAntes ?? 0) - 1.5);

    const segundaBaixa = await api.post(`/api/ordens/${op.id}/ordem-corte/apontamento`).send({
      acao: 'concluir_corte',
      consumo_real: 1.5,
    });
    expect(segundaBaixa.body.status_processo).toBe('corte_concluido');
    const saldoFinal = await api.get('/api/estoque').query({ tipo: 'materia' });
    const qtdFinal = (
      saldoFinal.body.data as Array<{ materia_prima_id: number; quantidade: number }>
    ).find((item) => item.materia_prima_id === materia.id)?.quantidade;
    expect(qtdFinal).toBe(qtdDepoisCorte);

    const historico = await api.get(`/api/ordens/${op.id}/ordem-corte/historico`);
    expect(historico.body.data.some((item: { acao: string }) => item.acao === 'enviar_enfesto')).toBe(true);
    expect(historico.body.data.some((item: { acao: string }) => item.acao === 'concluir_corte')).toBe(true);
  });

  it('publica OP e OC única a partir da ficha, entra na fila com PDF e não baixa estoque zerado', async () => {
    const materia = await api.post('/api/materias-primas').send({
      codigo: 'PV-NOVA',
      nome: 'Malha Nova',
      tipo: 'tecido',
      unidade: 'KG',
      composicao: '67% poliester 33% viscose',
    });
    const movimentosAntes = db.prepare('SELECT COUNT(*) AS n FROM estoque_movimentos').get() as { n: number };

    const op = await api.post('/api/ordens').send({
      cliente: 'Loja Nova Ficha',
      produto: 'Camiseta Polo',
      quantidade: 4,
      status: 'planejada',
      requisitos: [{ materia_prima_id: materia.body.id, quantidade: 1 }],
      grade: [
        { cor: 'Preto', tamanho: 'M', quantidade: 3 },
        { cor: 'Preto', tamanho: 'G', quantidade: 1 },
      ],
    });
    expect(op.status).toBe(201);

    const oc = await api.post(`/api/ordens/${op.body.id}/ordem-corte`).send({});
    expect([200, 201]).toContain(oc.status);
    const repetida = await api.post(`/api/ordens/${op.body.id}/ordem-corte`).send({});
    expect(repetida.body.id).toBe(oc.body.id);

    const salva = await api.patch(`/api/ordens/${op.body.id}/ordem-corte`).send({
      modelo: 'Camiseta Polo',
      composicao: '67% poliester 33% viscose',
      referencia: 'POLO-NOVA',
      materia_prima_id: materia.body.id,
      grade: [
        { cor: 'Preto', tamanho: 'M', quantidade: 3 },
        { cor: 'Preto', tamanho: 'G', quantidade: 1 },
      ],
    });
    expect(salva.status).toBe(200);

    const enviada = await api.post(`/api/ordens/${op.body.id}/ordem-corte/enviar-enfesto`).send({});
    expect(enviada.status).toBe(200);
    expect(enviada.body.id).toBe(oc.body.id);
    expect(enviada.body.status_processo).toBe('aguardando_enfesto');

    expect(db.prepare('SELECT COUNT(*) AS n FROM ordens_corte').get() as { n: number }).toEqual({ n: 1 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM estoque_movimentos').get() as { n: number }).toEqual({
      n: movimentosAntes.n,
    });

    const fila = await api.get('/api/ordens/ordem-corte/fila-enfesto');
    expect(fila.body.data).toHaveLength(1);
    expect(fila.body.data[0].id).toBe(oc.body.id);
    expect(fila.body.data[0].modelo).toBe('Camiseta Polo');

    const pdf = await api.get(`/api/ordens/${op.body.id}/ordem-corte/pdf`).buffer(true);
    expect(pdf.status).toBe(200);
    expect(String(pdf.headers['content-disposition'])).toContain(`${oc.body.codigo}-ficha.pdf`);
    const pdfBuf = Buffer.isBuffer(pdf.body) ? pdf.body : Buffer.from(pdf.body);
    const pdfTexto = [...pdfBuf.toString('latin1').matchAll(/<([0-9a-fA-F]+)>/g)]
      .map((item) => Buffer.from(item[1], 'hex').toString('latin1'))
      .join('');
    expect(pdfTexto).toContain('Camiseta Polo');
    expect(pdfTexto).toContain('POLO-NOVA');
  });

  it('aceita os tamanhos da ficha, calcula perda percentual e baixa só na confirmação', async () => {
    const materia = await api.post('/api/materias-primas').send({
      codigo: 'PV-PERDA',
      nome: 'Malha Perda',
      tipo: 'tecido',
      unidade: 'KG',
      largura_cm: 160,
      gramatura: 180,
      composicao: 'PV',
    });
    await api.post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 20,
      materia_prima_id: materia.body.id,
    });
    const movimentosAntes = db.prepare('SELECT COUNT(*) AS n FROM estoque_movimentos').get() as { n: number };

    const op = await api.post('/api/ordens').send({
      cliente: 'Loja Perda',
      produto: 'Polo Perda',
      quantidade: 4,
      status: 'planejada',
      requisitos: [{ materia_prima_id: materia.body.id, quantidade: 1 }],
      grade: [
        { cor: 'Preto', tamanho: 'M', quantidade: 3 },
        { cor: 'Preto', tamanho: 'G', quantidade: 1 },
      ],
    });
    await api.post(`/api/ordens/${op.body.id}/ordem-corte`).send({});
    await api.patch(`/api/ordens/${op.body.id}/ordem-corte`).send({
      modelo: 'Polo Perda',
      composicao: 'PV',
      materia_prima_id: materia.body.id,
      tamanhos: ['P', 'M', 'G', 'GG', 'XG'],
      grade: [
        { cor: 'Preto', tamanho: 'P', quantidade: 0 },
        { cor: 'Preto', tamanho: 'M', quantidade: 3 },
        { cor: 'Preto', tamanho: 'G', quantidade: 1 },
        { cor: 'Preto', tamanho: 'GG', quantidade: 0 },
        { cor: 'Preto', tamanho: 'XG', quantidade: 0 },
      ],
    });
    await api.post(`/api/ordens/${op.body.id}/ordem-corte/enviar-enfesto`).send({});
    await api.post(`/api/ordens/${op.body.id}/ordem-corte/apontamento`).send({ acao: 'iniciar_enfesto' });
    await api.post(`/api/ordens/${op.body.id}/ordem-corte/apontamento`).send({ acao: 'iniciar_corte' });

    const cor = await api.post(`/api/ordens/${op.body.id}/corte-infesto`).send({
      materia_prima_id: materia.body.id,
      cor: 'Preto',
      camadas: 10,
      metragem: 2,
      itens: [
        { tamanho: 'P', quantidade: 0 },
        { tamanho: 'M', quantidade: 3 },
        { tamanho: 'G', quantidade: 1 },
        { tamanho: 'GG', quantidade: 0 },
        { tamanho: 'XG', quantidade: 0 },
      ],
    });
    expect(cor.status).toBe(201);
    expect(cor.body.quantidade_baixada).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM estoque_movimentos').get() as { n: number }).toEqual({
      n: movimentosAntes.n,
    });

    const tamanhoFora = await api.post(`/api/ordens/${op.body.id}/corte-infesto`).send({
      materia_prima_id: materia.body.id,
      cor: 'Preto',
      camadas: 10,
      itens: [{ tamanho: 'G1', quantidade: 1 }],
      autorizar_excedente: true,
    });
    expect(tamanhoFora.status).toBe(400);
    expect(tamanhoFora.body.erro).toBe('O tamanho precisa estar na grade desta cor');

    const conclusao = await api.post(`/api/ordens/${op.body.id}/ordem-corte/apontamento`).send({
      acao: 'concluir_corte',
      metragem_risco: 2,
      camadas: 10,
      perdas: 5,
      materia_prima_id: materia.body.id,
    });
    expect(conclusao.status).toBe(200);
    expect(conclusao.body.consumo_real).toBeCloseTo(6.048);
    expect(conclusao.body.perdas).toBe(5);
    expect(conclusao.body.status_processo).toBe('corte_concluido');

    const saldo = await api.get('/api/estoque').query({ tipo: 'materia' });
    const item = (
      saldo.body.data as Array<{ materia_prima_id: number; quantidade: number }>
    ).find((row) => row.materia_prima_id === materia.body.id);
    expect(item?.quantidade).toBeCloseTo(13.952);

    const repetida = await api.post(`/api/ordens/${op.body.id}/ordem-corte/apontamento`).send({
      acao: 'concluir_corte',
      metragem_risco: 2,
      camadas: 10,
      perdas: 5,
      consumo_real: 6.048,
    });
    expect(repetida.body.status_processo).toBe('corte_concluido');
    const saldoFinal = await api.get('/api/estoque').query({ tipo: 'materia' });
    const itemFinal = (
      saldoFinal.body.data as Array<{ materia_prima_id: number; quantidade: number }>
    ).find((row) => row.materia_prima_id === materia.body.id);
    expect(itemFinal?.quantidade).toBe(item?.quantidade);
  });

  it('calcula consumo em metros com perda percentual na confirmação do corte', async () => {
    const materia = await api.post('/api/materias-primas').send({
      codigo: 'TELA-MT',
      nome: 'Tela Metro',
      tipo: 'tecido',
      unidade: 'MT',
    });
    await api.post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 50,
      materia_prima_id: materia.body.id,
    });
    const op = await api.post('/api/ordens').send({
      cliente: 'Loja Metro',
      produto: 'Tela',
      quantidade: 2,
      status: 'planejada',
      requisitos: [{ materia_prima_id: materia.body.id, quantidade: 1 }],
      grade: [{ cor: 'Verde', tamanho: 'M', quantidade: 2 }],
    });
    await api.post(`/api/ordens/${op.body.id}/ordem-corte`).send({});
    await api.patch(`/api/ordens/${op.body.id}/ordem-corte`).send({
      modelo: 'Tela',
      composicao: 'Poliester',
      materia_prima_id: materia.body.id,
    });
    await api.post(`/api/ordens/${op.body.id}/ordem-corte/enviar-enfesto`).send({});
    await api.post(`/api/ordens/${op.body.id}/ordem-corte/apontamento`).send({ acao: 'iniciar_enfesto' });
    await api.post(`/api/ordens/${op.body.id}/ordem-corte/apontamento`).send({ acao: 'iniciar_corte' });

    const conclusao = await api.post(`/api/ordens/${op.body.id}/ordem-corte/apontamento`).send({
      acao: 'concluir_corte',
      metragem_risco: 4.5,
      camadas: 6,
      perdas: 5,
      materia_prima_id: materia.body.id,
    });
    expect(conclusao.status).toBe(200);
    expect(conclusao.body.consumo_real).toBeCloseTo(28.35);

    const saldo = await api.get('/api/estoque').query({ tipo: 'materia' });
    const item = (
      saldo.body.data as Array<{ materia_prima_id: number; quantidade: number }>
    ).find((row) => row.materia_prima_id === materia.body.id);
    expect(item?.quantidade).toBeCloseTo(21.65);
  });

  it('finaliza o enfesto com estoque insuficiente, registra consumo e baixa uma única vez', async () => {
    const { op, materia } = await criarOpComCorte();
    await api.post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 1,
      materia_prima_id: materia.id,
    });
    await api.patch(`/api/ordens/${op.id}/ordem-corte`).send({
      modelo: 'Camiseta Ficha',
      composicao: '67% poliester 33% viscose',
      materia_prima_id: materia.id,
    });
    await api.post(`/api/ordens/${op.id}/ordem-corte/enviar-enfesto`).send({});
    await api.post(`/api/ordens/${op.id}/ordem-corte/apontamento`).send({ acao: 'iniciar_enfesto' });
    await api.post(`/api/ordens/${op.id}/ordem-corte/apontamento`).send({ acao: 'iniciar_corte' });

    const conclusao = await api.post(`/api/ordens/${op.id}/ordem-corte/apontamento`).send({
      acao: 'concluir_corte',
      consumo_real: 3.5,
      quantidade_cortada: 6,
      materia_prima_id: materia.id,
    });
    expect(conclusao.status).toBe(200);
    expect(conclusao.body.status_processo).toBe('corte_concluido');
    expect(conclusao.body.consumo_real).toBeCloseTo(3.5);

    const listaSaldo = await api.get('/api/estoque').query({ tipo: 'materia' });
    const item = (
      listaSaldo.body.data as Array<{ materia_prima_id: number; quantidade: number }>
    ).find((row) => row.materia_prima_id === materia.id);
    expect(item?.quantidade).toBeCloseTo(-2.5);

    const movimentos = await api.get('/api/estoque/movimentos').query({ materia_prima_id: materia.id });
    const saidas = (
      movimentos.body.data as Array<{ tipo: string; quantidade: number; saldo_posterior: number; observacoes: string }>
    ).filter((row) => row.tipo === 'saida');
    expect(saidas).toHaveLength(1);
    expect(saidas[0].quantidade).toBeCloseTo(3.5);
    expect(saidas[0].saldo_posterior).toBeCloseTo(-2.5);
    expect(saidas[0].observacoes).toMatch(/estoque insuficiente/i);

    const historico = await api.get(`/api/ordens/${op.id}/ordem-corte/historico`);
    expect(historico.body.data.some((item: { acao: string }) => item.acao === 'concluir_corte')).toBe(true);
    expect(historico.body.data.some((item: { acao: string }) => item.acao === 'baixa_estoque')).toBe(true);
    const baixa = (historico.body.data as Array<{ acao: string; resumo: string; usuario_nome: string | null }>).find(
      (item) => item.acao === 'baixa_estoque',
    );
    expect(baixa?.resumo).toMatch(/3\.5/);
    expect(baixa?.resumo).toMatch(/estoque insuficiente/i);
    expect(baixa?.usuario_nome).toBeTruthy();

    const segunda = await api.post(`/api/ordens/${op.id}/ordem-corte/apontamento`).send({
      acao: 'concluir_corte',
      consumo_real: 3.5,
    });
    expect(segunda.status).toBe(200);
    const saldoFinal = await api.get('/api/estoque').query({ tipo: 'materia' });
    const itemFinal = (
      saldoFinal.body.data as Array<{ materia_prima_id: number; quantidade: number }>
    ).find((row) => row.materia_prima_id === materia.id);
    expect(itemFinal?.quantidade).toBeCloseTo(-2.5);
    const movimentosDepois = await api.get('/api/estoque/movimentos').query({ materia_prima_id: materia.id });
    expect(
      (movimentosDepois.body.data as Array<{ tipo: string }>).filter((row) => row.tipo === 'saida'),
    ).toHaveLength(1);
  });
});

function cortePdf(parcial: Partial<OrdemCorte>): OrdemCorte {
  return {
    id: 10,
    empresa_id: 1,
    codigo: 'OC-10',
    ordem_id: 10,
    cliente: 'mb',
    produto: 'Camiseta Básica',
    quantidade: 80,
    prioridade: 'normal',
    data_prevista: null,
    responsavel: null,
    observacoes: null,
    cliente_id: null,
    produto_id: null,
    criado_em: '',
    modelo: 'Camiseta Básica',
    composicao: '',
    referencia: 'CAM-001',
    informacoes_oficina: '',
    data_retirada: null,
    informacoes_costureiros: '',
    informacoes_acabamento: '',
    atualizado_em: '',
    status_processo: 'encaminhado',
    ordem_codigo: 'OP-0010',
    ordem_status: 'costura',
    tecido_nome: null,
    tecido_unidade: null,
    materia_prima_id: null,
    enviado_enfesto_em: null,
    enviado_enfesto_por: null,
    enviado_por_nome: null,
    iniciado_enfesto_em: null,
    iniciado_enfesto_por: null,
    iniciado_enfesto_por_nome: null,
    iniciado_corte_em: null,
    iniciado_corte_por: null,
    iniciado_corte_por_nome: null,
    concluido_corte_em: null,
    concluido_corte_por: null,
    concluido_corte_por_nome: null,
    consumo_real: null,
    consumo_unidade: null,
    quantidade_cortada: null,
    perdas: null,
    observacoes_corte: null,
    tamanhos: ['P', 'M', 'G', 'GG', 'XG'],
    linhas: [{ cor: 'Preto', detalhes: '' }],
    aviamentos: [],
    oficinas: [],
    materiais: [],
    grade: [
      { cor: 'Preto', tamanho: 'P', quantidade: 20 },
      { cor: 'Preto', tamanho: 'M', quantidade: 20 },
      { cor: 'Preto', tamanho: 'G', quantidade: 20 },
      { cor: 'Preto', tamanho: 'GG', quantidade: 20 },
    ],
    ...parcial,
  };
}

function textoPdfLocal(buf: Buffer) {
  return [...buf.toString('latin1').matchAll(/<([0-9a-fA-F]+)>/g)]
    .map((item) => Buffer.from(item[1], 'hex').toString('latin1'))
    .join('');
}

describe('composição e costureiro no PDF da ficha', () => {
  it('usa a composição completa cadastrada do tecido, com todos os percentuais', () => {
    expect(
      composicaoImpressaoOc({
        composicao: '48 % ALGODAO',
        tecido_composicao: '48 % ALGODAO',
        tecido_nome: 'SUEDINE PA PENTEADO RAMADO (2F) 48 % ALGODAO , 52 % POLIESTER',
      }),
    ).toBe('48 % ALGODAO , 52 % POLIESTER');
    expect(
      composicaoImpressaoOc({
        composicao: '48% algodão',
        tecido_composicao: '48% algodão',
        tecido_nome: 'Malha 48% algodão e 52% poliéster',
      }),
    ).toBe('48% algodão e 52% poliéster');
    expect(
      composicaoImpressaoOc({
        composicao: '48% algodão e 52% poliéster',
        tecido_composicao: '48% algodão e 52% poliéster',
        tecido_nome: 'Malha PV',
      }),
    ).toBe('48% algodão e 52% poliéster');
  });

  it('imprime composição completa, oficina, costureiro e o layout da ficha de produção', async () => {
    const extras: ExtraImpressaoOc = {
      costureiro: 'Bruno',
      oficina: 'Oficina Norte',
      valor_peca: 3.5,
      data_liberacao: '2026-11-08',
      codigo_oc: 'OC-10',
    };
    const pdf = await pdfImpressaoOrdemCorte(
      cortePdf({
        composicao: '48 % ALGODAO',
        tecido_composicao: '48 % ALGODAO',
        tecido_nome: 'SUEDINE PA PENTEADO RAMADO (2F) 48 % ALGODAO , 52 % POLIESTER',
        informacoes_costureiros: '',
      }),
      extras,
    );
    const pdfTexto = textoPdfLocal(pdf);
    expect(pdfTexto).toContain('48 % ALGODAO , 52 % POLIESTER');
    expect(pdfTexto).toContain('52 %');
    expect(pdfTexto).toContain('POLIESTER');
    expect(pdfTexto).toContain('Bruno');
    expect(pdfTexto).toContain('R$ 3,50');
    expect(pdfTexto).toContain('08/11/2026');
    expect(pdfTexto).toContain('AVIAMENTOS');
    expect(pdfTexto).toMatch(/OFICINA.{1,5}COSTUREIRO/);
    expect(pdfTexto).toContain('Oficina Norte');
    expect(pdfTexto).toContain('XG');
  });
});
