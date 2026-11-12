import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';
import { sincronizarContasPagarOficinasEntregues } from './financeiro.js';
import { sincronizarOrdensEntreguesOficina } from './liberacaoFichas.js';
import { autenticar, autenticarNovaEmpresa, autenticarPapel, type TestApi } from './httpTest.js';
import type { Express } from 'express';

describe('liberação de ficha para oficina', () => {
  let db: AppDatabase;
  let app: Express;
  let api: TestApi;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    app = createApp(db);
    api = await autenticar(app);
  });

  afterEach(() => {
    db.close();
  });

  async function criarFichaPronta(dados?: { referencia?: string; modelo?: string; cliente?: string }) {
    const materia = await api.post('/api/materias-primas').send({
      codigo: `MALHA-${Math.random().toString(16).slice(2, 6)}`,
      nome: 'Malha PV',
      tipo: 'tecido',
      unidade: 'KG',
      composicao: '67% poliester 33% viscose',
    });
    expect(materia.status).toBe(201);
    await api.post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 20,
      materia_prima_id: materia.body.id,
    });
    const produto = await api.post('/api/produtos').send({
      sku: `CAM-LIB-${Math.random().toString(16).slice(2, 8)}`,
      nome: dados?.modelo ?? 'Camiseta Liberação',
    });
    const op = await api.post('/api/ordens').send({
      cliente: dados?.cliente ?? 'Loja Oficina',
      produto_id: produto.body.id,
      quantidade: 6,
      observacoes: 'Ficha original da OC',
      requisitos: [{ materia_prima_id: materia.body.id, quantidade: 0.2 }],
      grade: [
        { cor: 'Preto', tamanho: 'M', quantidade: 4 },
        { cor: 'Preto', tamanho: 'G', quantidade: 2 },
      ],
      status: 'planejada',
    });
    expect(op.status).toBe(201);
    await api.post('/api/etapas/fluxo').send({ ordem_id: op.body.id });
    const corte = await api.post(`/api/ordens/${op.body.id}/ordem-corte`).send({});
    expect([200, 201]).toContain(corte.status);
    await api.patch(`/api/ordens/${op.body.id}/ordem-corte`).send({
      modelo: dados?.modelo ?? 'Camiseta Liberação',
      referencia: dados?.referencia ?? 'CAM-LIB',
      informacoes_costureiros: 'Costura 4 fios',
      oficinas: [{ oficina: 'Oficina Norte', costureiro: 'Ana Souza' }],
    });
    await api.post(`/api/ordens/${op.body.id}/ordem-corte/enviar-enfesto`).send({});
    await api.post(`/api/ordens/${op.body.id}/ordem-corte/apontamento`).send({ acao: 'iniciar_enfesto' });
    await api.post(`/api/ordens/${op.body.id}/ordem-corte/apontamento`).send({ acao: 'iniciar_corte' });
    const conclusao = await api.post(`/api/ordens/${op.body.id}/ordem-corte/apontamento`).send({
      acao: 'concluir_corte',
      consumo_real: 1.2,
      quantidade_cortada: 6,
      materia_prima_id: materia.body.id,
    });
    expect(conclusao.status).toBe(200);
    expect(conclusao.body.status_processo).toBe('corte_concluido');
    return {
      op: op.body as { id: number; codigo: string },
      corte: corte.body as { id: number; codigo: string },
      materia: materia.body as { id: number },
    };
  }

  async function saldoTecido(materiaId: number) {
    const lista = await api.get('/api/estoque').query({ tipo: 'materia' });
    return (
      (lista.body.data as Array<{ materia_prima_id: number; quantidade: number }>).find(
        (item) => item.materia_prima_id === materiaId,
      )?.quantidade ?? 0
    );
  }

  function textoPdf(corpo: Buffer | string) {
    const pdfBuf = Buffer.isBuffer(corpo) ? corpo : Buffer.from(corpo);
    const pdfBruto = pdfBuf.toString('latin1');
    const pdfTexto = [...pdfBruto.matchAll(/<([0-9a-fA-F]+)>/g)]
      .map((item) => Buffer.from(item[1], 'hex').toString('latin1'))
      .join('');
    return { pdfBruto, pdfTexto };
  }

  it('lista a ficha original, libera para costura sem duplicar OP/OC/estoque e some da fila', async () => {
    const { op, corte, materia } = await criarFichaPronta();
    const opsAntes = (db.prepare('SELECT COUNT(*) AS n FROM ordens_producao').get() as { n: number }).n;
    const ocsAntes = (db.prepare('SELECT COUNT(*) AS n FROM ordens_corte').get() as { n: number }).n;
    const pecasAntes = (db.prepare('SELECT SUM(quantidade) AS n FROM ordem_corte_grade').get() as { n: number }).n;
    const estoqueAntes = await saldoTecido(materia.id);

    const pendentes = await api.get('/api/etapas/liberacao');
    expect(pendentes.status).toBe(200);
    expect(pendentes.body.data).toHaveLength(1);
    expect(pendentes.body.data[0]).toEqual(
      expect.objectContaining({
        codigo: corte.codigo,
        ordem_id: op.id,
        cliente: 'Loja Oficina',
        modelo: 'Camiseta Liberação',
        referencia: 'CAM-LIB',
        quantidade: 6,
      }),
    );
    expect(pendentes.body.data[0].grade).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cor: 'Preto', tamanho: 'M', quantidade: 4 }),
        expect.objectContaining({ cor: 'Preto', tamanho: 'G', quantidade: 2 }),
      ]),
    );
    expect(pendentes.body.data[0].costureiros).toContain('Ana Souza');
    expect(pendentes.body.data[0].oficinas_opcoes).toContain('Oficina Norte');
    expect(pendentes.body.data[0].valor_peca_sugerido).toBeNull();
    expect(pendentes.body.data[0].liberacao).toBeNull();

    const html = await api.get(`/api/etapas/liberacao/${op.id}/impressao`);
    expect(html.status).toBe(200);
    expect(html.text).toContain('Loja Oficina');
    expect(html.text).toContain(corte.codigo);
    expect(html.text).toContain('Camiseta Liberação');
    expect(html.text).toContain('CAM-LIB');

    const semCostureiro = await api.post(`/api/etapas/liberacao/${op.id}`).send({ valor_peca: 2.5 });
    expect(semCostureiro.status).toBe(400);
    const semOficina = await api.post(`/api/etapas/liberacao/${op.id}`).send({
      costureiro: 'Ana Souza',
      valor_peca: 2.5,
      data_liberacao: '2026-11-03',
    });
    expect(semOficina.status).toBe(400);
    const semData = await api.post(`/api/etapas/liberacao/${op.id}`).send({
      costureiro: 'Ana Souza',
      valor_peca: 2.5,
      oficina: 'Oficina Norte',
    });
    expect(semData.status).toBe(400);

    const liberada = await api.post(`/api/etapas/liberacao/${op.id}`).send({
      costureiro: 'Ana Souza',
      valor_peca: '2,50',
      oficina: 'Oficina Norte',
      data_liberacao: '2026-11-03',
    });
    expect(liberada.status).toBe(200);
    expect(liberada.body.status_processo).toBe('encaminhado');
    expect(liberada.body.liberacao).toEqual(
      expect.objectContaining({
        costureiro: 'Ana Souza',
        valor_peca: 2.5,
        referencia: 'CAM-LIB',
        tipo_peca: 'Camiseta Liberação',
        oficina: 'Oficina Norte',
        data_liberacao: '2026-11-03',
        codigo_oc: corte.codigo,
      }),
    );
    expect(liberada.body.liberacao.liberado_em).toBeTruthy();

    const opDepois = await api.get(`/api/ordens/${op.id}`);
    expect(opDepois.body.status).toBe('costura');
    const etapas = await api.get('/api/etapas').query({ ordem_id: op.id, por_pagina: 20 });
    const costura = (etapas.body.data as Array<{ tipo: string; status: string }>).find((item) => item.tipo === 'costura');
    expect(costura?.status).toBe('em_andamento');

    const historico = await api.get(`/api/ordens/${op.id}/ordem-corte/historico`);
    expect(historico.body.data.some((item: { acao: string }) => item.acao === 'liberar_oficina')).toBe(true);
    expect(historico.body.data.some((item: { acao: string }) => item.acao === 'encaminhar')).toBe(true);
    const liberacaoHist = (historico.body.data as Array<{ acao: string; payload: { costureiro: string; valor_peca: number } }>).find(
      (item) => item.acao === 'liberar_oficina',
    );
    expect(liberacaoHist?.payload).toEqual(
      expect.objectContaining({
        costureiro: 'Ana Souza',
        valor_peca: 2.5,
        oficina: 'Oficina Norte',
        data_liberacao: '2026-11-03',
        codigo_oc: corte.codigo,
      }),
    );

    expect((db.prepare('SELECT COUNT(*) AS n FROM ordens_producao').get() as { n: number }).n).toBe(opsAntes);
    expect((db.prepare('SELECT COUNT(*) AS n FROM ordens_corte').get() as { n: number }).n).toBe(ocsAntes);
    expect((db.prepare('SELECT SUM(quantidade) AS n FROM ordem_corte_grade').get() as { n: number }).n).toBe(pecasAntes);
    expect(await saldoTecido(materia.id)).toBe(estoqueAntes);

    const filaDepois = await api.get('/api/etapas/liberacao');
    expect(filaDepois.body.data).toHaveLength(0);
    expect(filaDepois.body.liberadas).toHaveLength(1);
    expect(filaDepois.body.liberadas[0]).toEqual(
      expect.objectContaining({
        ordem_id: op.id,
        oficinas: expect.arrayContaining([
          expect.objectContaining({ oficina: 'Oficina Norte', costureiro: 'Ana Souza' }),
        ]),
        informacoes_costureiros: 'Costura 4 fios',
        liberacao: expect.objectContaining({
          oficina: 'Oficina Norte',
          costureiro: 'Ana Souza',
          valor_peca: 2.5,
          data_liberacao: '2026-11-03',
        }),
      }),
    );

    const repetida = await api.post(`/api/etapas/liberacao/${op.id}`).send({
      costureiro: 'Ana Souza',
      valor_peca: 3,
      oficina: 'Oficina Norte',
      data_liberacao: '2026-11-03',
    });
    expect(repetida.status).toBe(409);

    const pdf = await api.get(`/api/etapas/liberacao/${op.id}/pdf`).buffer(true);
    expect(pdf.status).toBe(200);
    expect(String(pdf.headers['content-type'])).toContain('application/pdf');
    const { pdfBruto, pdfTexto } = textoPdf(pdf.body);
    expect(pdfBruto.startsWith('%PDF')).toBe(true);
    expect(pdfTexto).toContain(corte.codigo);
    expect(pdfTexto).toContain('Camiseta Liberação');
    expect(pdfTexto).toContain('CAM-LIB');
    expect(pdfTexto).toContain('Ana Souza');
    expect(pdfTexto).toContain('AVIAMENTOS');
    expect(pdfTexto).toMatch(/OFICINA.{1,5}COSTUREIRO/);
    expect(pdfTexto).toContain('Oficina Norte');
    expect(pdfTexto).toContain('03/11/2026');
    expect(pdfTexto).toMatch(/R\$\s*2,50|2,50/);

    const htmlLiberada = await api.get(`/api/etapas/liberacao/${op.id}/impressao`);
    expect(htmlLiberada.text).toContain('Oficina Norte');
    expect(htmlLiberada.text).toContain('03/11/2026');
    expect(htmlLiberada.text).toContain('Ana Souza');
    expect(htmlLiberada.text).toContain(corte.codigo);
    expect(htmlLiberada.text).toContain('Valor por peça');
    expect(htmlLiberada.text).toContain('R$ 2,50');
    expect(htmlLiberada.text).toMatch(
      /Aviamentos[\s\S]*Oficina — Costureiro[\s\S]*Data de liberação[\s\S]*Valor por peça[\s\S]*Informações para oficina/,
    );
    expect(htmlLiberada.text).toContain('Informações dos costureiros');
    expect(htmlLiberada.text).toContain('Costura 4 fios');
    expect(htmlLiberada.text).not.toContain('<div class="lab">Tecido</div>');
  });

  it('persiste oficina, costureiro, valor e datas na ficha e reabre preenchida no PDF', async () => {
    const { op, corte } = await criarFichaPronta();
    const liberada = await api.post(`/api/etapas/liberacao/${op.id}`).send({
      costureiro: 'Ana Souza',
      valor_peca: 3,
      oficina: 'Oficina Norte',
      data_liberacao: '2026-11-03',
      data_retirada: '2026-11-10',
    });
    expect(liberada.status).toBe(200);
    expect(liberada.body.oficinas).toEqual(
      expect.arrayContaining([expect.objectContaining({ oficina: 'Oficina Norte', costureiro: 'Ana Souza' })]),
    );
    expect(liberada.body.data_retirada).toBe('2026-11-10');
    expect(liberada.body.informacoes_costureiros).toBe('Costura 4 fios');
    expect(liberada.body.liberacao).toEqual(
      expect.objectContaining({
        oficina: 'Oficina Norte',
        oficina_id: expect.any(Number),
        costureiro: 'Ana Souza',
        valor_peca: 3,
        data_liberacao: '2026-11-03',
        data_retirada: '2026-11-10',
        codigo_oc: corte.codigo,
      }),
    );
    expect(liberada.body.liberacao.oficina_id).toBeGreaterThan(0);

    const lista = await api.get('/api/etapas/liberacao');
    expect(lista.body.data).toHaveLength(0);
    expect(lista.body.liberadas).toHaveLength(1);
    expect(lista.body.liberadas[0].liberacao).toEqual(
      expect.objectContaining({
        oficina: 'Oficina Norte',
        costureiro: 'Ana Souza',
        valor_peca: 3,
        data_liberacao: '2026-11-03',
        data_retirada: '2026-11-10',
      }),
    );
    expect(lista.body.liberadas[0].oficinas).toEqual(
      expect.arrayContaining([expect.objectContaining({ oficina: 'Oficina Norte', costureiro: 'Ana Souza' })]),
    );
    expect(lista.body.liberadas[0].data_retirada).toBe('2026-11-10');

    const ficha = await api.get(`/api/ordens/${op.id}/ordem-corte`);
    expect(ficha.status).toBe(200);
    expect(ficha.body.oficinas).toEqual(
      expect.arrayContaining([expect.objectContaining({ oficina: 'Oficina Norte', costureiro: 'Ana Souza' })]),
    );
    expect(ficha.body.data_retirada).toBe('2026-11-10');
    expect(ficha.body.informacoes_costureiros).toBe('Costura 4 fios');

    const pdf = await api.get(`/api/etapas/liberacao/${op.id}/pdf`).buffer(true);
    expect(pdf.status).toBe(200);
    const { pdfTexto } = textoPdf(pdf.body);
    expect(pdfTexto).toContain('Ana Souza');
    expect(pdfTexto).toContain('AVIAMENTOS');
    expect(pdfTexto).toMatch(/OFICINA.{1,5}COSTUREIRO/);
    expect(pdfTexto).toContain('Oficina Norte');
    expect(pdfTexto).toMatch(/R\$\s*3,00|3,00/);
    expect(pdfTexto).toContain('03/11/2026');
    expect(pdfTexto).toContain('10/11/2026');
    expect(pdfTexto).toContain('Costura 4 fios');

    const html = await api.get(`/api/etapas/liberacao/${op.id}/impressao`);
    expect(html.text).toContain('Oficina Norte');
    expect(html.text).toContain('Ana Souza');
    expect(html.text).toContain('R$ 3,00');
    expect(html.text).toContain('03/11/2026');
    expect(html.text).toContain('10/11/2026');
    expect(html.text).toContain('Costura 4 fios');
    expect(html.text).toContain('Data de retirada');
    expect(html.text).toContain('Informações dos costureiros');
  });

  it('reaproveita o valor por peça da mesma referência e tipo e isola por empresa', async () => {
    const primeira = await criarFichaPronta();
    await api.post(`/api/etapas/liberacao/${primeira.op.id}`).send({
      costureiro: 'Paulo Lima',
      valor_peca: 4.75,
      oficina: 'Oficina Norte',
      data_liberacao: '2026-11-04',
    });

    const segunda = await criarFichaPronta({ cliente: 'Loja Sul' });
    const pendentes = await api.get('/api/etapas/liberacao');
    expect(pendentes.body.data).toHaveLength(1);
    expect(pendentes.body.data[0].ordem_id).toBe(segunda.op.id);
    expect(pendentes.body.data[0].valor_peca_sugerido).toBeCloseTo(4.75);
    expect(pendentes.body.data[0].costureiros).toEqual(expect.arrayContaining(['Ana Souza', 'Paulo Lima']));

    const alterada = await api.post(`/api/etapas/liberacao/${segunda.op.id}`).send({
      costureiro: 'Paulo Lima',
      valor_peca: 5,
      oficina: 'Oficina Sul',
      data_liberacao: '08/11/2026',
    });
    expect(alterada.body.liberacao.oficina).toBe('Oficina Sul');
    expect(alterada.body.liberacao.data_liberacao).toBe('2026-11-08');
    expect(alterada.body.liberacao.valor_peca).toBe(5);

    const { api: empresa2 } = await autenticarNovaEmpresa(app, {
      nome: 'Outra Confecção',
      email: 'outra@teste.com',
    });
    const lista2 = await empresa2.get('/api/etapas/liberacao');
    expect(lista2.status).toBe(200);
    expect(lista2.body.data).toHaveLength(0);
    const tentativa = await empresa2.post(`/api/etapas/liberacao/${segunda.op.id}`).send({
      costureiro: 'Invasor',
      valor_peca: 1,
      oficina: 'Oficina X',
      data_liberacao: '2026-11-08',
    });
    expect(tentativa.status).toBe(404);
  });

  it('cadastra oficina nova, reaproveita a existente e imprime oficina e data na ficha', async () => {
    const { op, corte } = await criarFichaPronta();
    const criada = await api.post('/api/etapas/liberacao/oficinas').send({ nome: 'Oficina Leste' });
    expect(criada.status).toBe(201);
    expect(criada.body).toEqual({ nome: 'Oficina Leste', ja_existia: false });
    const repetida = await api.post('/api/etapas/liberacao/oficinas').send({ nome: 'oficina leste' });
    expect(repetida.status).toBe(200);
    expect(repetida.body.ja_existia).toBe(true);

    const pendentes = await api.get('/api/etapas/liberacao');
    expect(pendentes.body.oficinas).toEqual(expect.arrayContaining(['Oficina Norte', 'Oficina Leste']));
    expect(pendentes.body.data[0].oficinas_opcoes).toEqual(
      expect.arrayContaining(['Oficina Norte', 'Oficina Leste']),
    );

    const liberada = await api.post(`/api/etapas/liberacao/${op.id}`).send({
      costureiro: 'Ana Souza',
      valor_peca: 2,
      oficina: 'Oficina Leste',
      data_liberacao: '2026-11-01',
    });
    expect(liberada.status).toBe(200);
    expect(liberada.body.liberacao.oficina).toBe('Oficina Leste');
    expect(liberada.body.liberacao.data_liberacao).toBe('2026-11-01');
    expect(liberada.body.liberacao.codigo_oc).toBe(corte.codigo);
    expect((db.prepare('SELECT COUNT(*) AS n FROM ordens_corte').get() as { n: number }).n).toBe(1);

    const pdf = await api.get(`/api/etapas/liberacao/${op.id}/pdf`).buffer(true);
    const { pdfTexto } = textoPdf(pdf.body);
    expect(pdfTexto).toContain('01/11/2026');
    expect(pdfTexto).toContain(corte.codigo);
    expect(pdfTexto).toContain('Ana Souza');
    expect(pdfTexto).toContain('AVIAMENTOS');
    expect(pdfTexto).toMatch(/OFICINA.{1,5}COSTUREIRO/);
    expect(pdfTexto).toContain('Oficina Leste');
  });

  it('grava oficina, costureiro, R$ 8,00 e data e imprime na OC correta, inclusive na reimpressão', async () => {
    const primeira = await criarFichaPronta({ cliente: 'Loja A', referencia: 'REF-A', modelo: 'Modelo A' });
    const segunda = await criarFichaPronta({ cliente: 'Loja B', referencia: 'REF-B', modelo: 'Modelo B' });

    const confirmada = await api.post(`/api/etapas/liberacao/${primeira.op.id}`).send({
      costureiro: 'Carlos Silva',
      valor_peca: 8,
      oficina: 'Oficina Centro',
      data_liberacao: '2026-11-05',
    });
    expect(confirmada.status).toBe(200);
    await api.post(`/api/etapas/liberacao/${segunda.op.id}`).send({
      costureiro: 'Maria Lima',
      valor_peca: 12.5,
      oficina: 'Oficina Sul',
      data_liberacao: '2026-11-06',
    });

    const salvo = db
      .prepare(
        `SELECT oficina, costureiro, valor_peca, data_liberacao, codigo_oc, ordem_corte_id
           FROM ordem_corte_liberacoes WHERE ordem_id = ?`,
      )
      .get(primeira.op.id) as {
      oficina: string;
      costureiro: string;
      valor_peca: number;
      data_liberacao: string;
      codigo_oc: string;
      ordem_corte_id: number;
    };
    expect(salvo).toEqual(
      expect.objectContaining({
        oficina: 'Oficina Centro',
        costureiro: 'Carlos Silva',
        valor_peca: 8,
        data_liberacao: '2026-11-05',
        codigo_oc: primeira.corte.codigo,
        ordem_corte_id: primeira.corte.id,
      }),
    );

    const html = await api.get(`/api/etapas/liberacao/${primeira.op.id}/impressao`);
    expect(html.status).toBe(200);
    expect(html.text).toMatch(/Oficina<\/th>[\s\S]*Oficina Centro/);
    expect(html.text).toContain('Carlos Silva');
    expect(html.text).toContain('R$ 8,00');
    expect(html.text).toContain('05/11/2026');
    expect(html.text).not.toContain('Oficina Sul');

    const pdf = await api.get(`/api/etapas/liberacao/${primeira.op.id}/pdf`).buffer(true);
    const { pdfTexto } = textoPdf(pdf.body);
    expect(pdfTexto).toContain('Carlos Silva');
    expect(pdfTexto).toContain('R$ 8,00');
    expect(pdfTexto).toContain('05/11/2026');
    expect(pdfTexto).toContain(primeira.corte.codigo);
    expect(pdfTexto).toContain('AVIAMENTOS');
    expect(pdfTexto).toMatch(/OFICINA.{1,5}COSTUREIRO/);
    expect(pdfTexto).toContain('Oficina Centro');
    expect(pdfTexto).not.toContain('Maria Lima');

    const reimpressao = await api.get(`/api/etapas/liberacao/${primeira.op.id}/pdf`).buffer(true);
    expect(textoPdf(reimpressao.body).pdfTexto).toContain('R$ 8,00');
    expect(textoPdf(reimpressao.body).pdfTexto).toContain('Carlos Silva');

    const pdfFicha = await api.get(`/api/ordens/${primeira.op.id}/ordem-corte/pdf`).buffer(true);
    const textoFicha = textoPdf(pdfFicha.body).pdfTexto;
    expect(textoFicha).toContain('Carlos Silva');
    expect(textoFicha).toContain('R$ 8,00');
    expect(textoFicha).toContain('05/11/2026');

    const pdfOutra = await api.get(`/api/etapas/liberacao/${segunda.op.id}/pdf`).buffer(true);
    const textoOutra = textoPdf(pdfOutra.body).pdfTexto;
    expect(textoOutra).toContain('Maria Lima');
    expect(textoOutra).toContain('R$ 12,50');
    expect(textoOutra).toContain('06/11/2026');
    expect(textoOutra).not.toContain('Carlos Silva');
    expect(textoOutra).not.toContain('R$ 8,00');
  });

  it('grava aviamentos na ficha, reabre preenchidos e imprime no quadro do PDF', async () => {
    const primeira = await criarFichaPronta({ cliente: 'Loja A', referencia: 'REF-AV', modelo: 'Modelo Avia' });
    const segunda = await criarFichaPronta({ cliente: 'Loja B', referencia: 'REF-B', modelo: 'Modelo B' });
    const salvo = await api.put(`/api/etapas/liberacao/${primeira.op.id}/aviamentos`).send({
      aviamentos: [
        { descricao: 'Elastico 3 cm', quantidade: 2, unidade: 'METRO' },
        { descricao: 'Botao 18L', quantidade: '12', unidade: 'UN' },
        { descricao: '   ', quantidade: 9, unidade: 'PAR' },
      ],
    });
    expect(salvo.status).toBe(200);
    expect(salvo.body.aviamentos).toEqual([
      expect.objectContaining({ descricao: 'Elastico 3 cm', quantidade: 2, unidade: 'METRO' }),
      expect.objectContaining({ descricao: 'Botao 18L', quantidade: 12, unidade: 'UN' }),
    ]);
    expect(salvo.body.oficinas).toEqual(
      expect.arrayContaining([expect.objectContaining({ oficina: 'Oficina Norte', costureiro: 'Ana Souza' })]),
    );

    const lista = await api.get('/api/etapas/liberacao');
    const fichaLista = (lista.body.data as Array<{ ordem_id: number; aviamentos: unknown[] }>).find(
      (item) => item.ordem_id === primeira.op.id,
    );
    expect(fichaLista?.aviamentos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ descricao: 'Elastico 3 cm', quantidade: 2, unidade: 'METRO' }),
        expect.objectContaining({ descricao: 'Botao 18L', quantidade: 12, unidade: 'UN' }),
      ]),
    );
    const outraLista = (lista.body.data as Array<{ ordem_id: number; aviamentos: unknown[] }>).find(
      (item) => item.ordem_id === segunda.op.id,
    );
    expect(outraLista?.aviamentos ?? []).toHaveLength(0);

    const pdf = await api.get(`/api/etapas/liberacao/${primeira.op.id}/pdf`).buffer(true);
    expect(pdf.status).toBe(200);
    const { pdfTexto } = textoPdf(pdf.body);
    expect(pdfTexto).toContain('AVIAMENTOS');
    expect(pdfTexto).toContain('Elastico 3 cm');
    expect(pdfTexto).toContain('Botao 18L');
    expect(pdfTexto).toContain('METRO');
    expect(pdfTexto).toMatch(/OFICINA.{1,5}COSTUREIRO/);
    expect(pdfTexto).toContain('Oficina Norte');
    expect(pdfTexto).toContain('Ana Souza');

    const pdfOutra = await api.get(`/api/etapas/liberacao/${segunda.op.id}/pdf`).buffer(true);
    expect(textoPdf(pdfOutra.body).pdfTexto).not.toContain('Elastico 3 cm');

    const liberada = await api.post(`/api/etapas/liberacao/${primeira.op.id}`).send({
      costureiro: 'Ana Souza',
      valor_peca: 3,
      oficina: 'Oficina Norte',
      data_liberacao: '2026-11-03',
    });
    expect(liberada.status).toBe(200);
    expect(liberada.body.aviamentos).toEqual(
      expect.arrayContaining([expect.objectContaining({ descricao: 'Elastico 3 cm' })]),
    );
    expect(liberada.body.liberacao.oficina).toBe('Oficina Norte');

    const depois = await api.put(`/api/etapas/liberacao/${primeira.op.id}/aviamentos`).send({
      aviamentos: [
        { descricao: 'Elastico 3 cm', quantidade: 2.5, unidade: 'METRO' },
        { descricao: 'Etiqueta tecido', quantidade: 6, unidade: 'UN' },
      ],
    });
    expect(depois.status).toBe(200);
    expect(depois.body.aviamentos).toEqual([
      expect.objectContaining({ descricao: 'Elastico 3 cm', quantidade: 2.5, unidade: 'METRO' }),
      expect.objectContaining({ descricao: 'Etiqueta tecido', quantidade: 6, unidade: 'UN' }),
    ]);
    expect(depois.body.oficinas).toEqual(
      expect.arrayContaining([expect.objectContaining({ oficina: 'Oficina Norte', costureiro: 'Ana Souza' })]),
    );

    const reaberta = await api.get('/api/etapas/liberacao');
    expect(reaberta.body.liberadas[0].aviamentos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ descricao: 'Etiqueta tecido', quantidade: 6, unidade: 'UN' }),
      ]),
    );

    const pdfLiberada = await api.get(`/api/etapas/liberacao/${primeira.op.id}/pdf`).buffer(true);
    const textoLiberada = textoPdf(pdfLiberada.body).pdfTexto;
    expect(textoLiberada).toContain('Etiqueta tecido');
    expect(textoLiberada).toContain('Elastico 3 cm');
    expect(textoLiberada).toContain('Oficina Norte');
    expect(textoLiberada).toContain('Ana Souza');
    expect(textoLiberada).toMatch(/R\$\s*3,00|3,00/);

    const { api: empresa2 } = await autenticarNovaEmpresa(app, {
      nome: 'Outra Confecção',
      email: 'avia-outra@teste.com',
    });
    const tentativa = await empresa2.put(`/api/etapas/liberacao/${primeira.op.id}/aviamentos`).send({
      aviamentos: [{ descricao: 'Invasor', quantidade: 1, unidade: 'UN' }],
    });
    expect(tentativa.status).toBe(404);
  });

  it('confirma entrega da oficina com data e hora reais, persiste e impede confirmar duas vezes', async () => {
    const { op } = await criarFichaPronta();
    const liberada = await api.post(`/api/etapas/liberacao/${op.id}`).send({
      costureiro: 'Ana Souza',
      valor_peca: 3,
      oficina: 'Oficina Norte',
      data_liberacao: '2026-10-01',
    });
    expect(liberada.status).toBe(200);
    expect(liberada.body.liberacao.entregue_em).toBeNull();
    expect(liberada.body.status_processo).toBe('encaminhado');

    const listaAntes = await api.get('/api/etapas/liberacao');
    const fichaAntes = (listaAntes.body.liberadas as Array<{ ordem_id: number; liberacao: { entregue_em: string | null } }>).find(
      (item) => item.ordem_id === op.id,
    );
    expect(fichaAntes?.liberacao.entregue_em).toBeNull();

    const entrega = await api.post(`/api/etapas/liberacao/${op.id}/entrega`).send({});
    expect(entrega.status).toBe(200);
    expect(entrega.body.liberacao.entregue_em).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(entrega.body.liberacao.entregue_por).toBeTruthy();
    expect(entrega.body.status_processo).toBe('entregue');

    const row = db
      .prepare(`SELECT entregue_em, entregue_por, oficina FROM ordem_corte_liberacoes WHERE ordem_id = ?`)
      .get(op.id) as { entregue_em: string; entregue_por: number; oficina: string };
    expect(row.entregue_em).toBe(entrega.body.liberacao.entregue_em);
    expect(row.entregue_por).toBe(entrega.body.liberacao.entregue_por);
    expect(row.oficina).toBe('Oficina Norte');

    const opDepois = await api.get(`/api/ordens/${op.id}`);
    expect(opDepois.status).toBe(200);
    expect(opDepois.body.status).toBe('concluida');
    expect(opDepois.body.ordem_corte.status_processo).toBe('entregue');

    const painel = await api.get('/api/ordens/producao').query({ etapa: 'costura' });
    expect(painel.status).toBe(200);
    expect(painel.body.totais).toEqual({ cadastradas: 1, andamento: 0, entregues: 1 });
    expect(painel.body.por_etapa.costura).toBe(0);
    expect((painel.body.andamento as Array<{ id: number }>).map((item) => item.id)).not.toContain(op.id);

    const listaDepois = await api.get('/api/etapas/liberacao');
    const fichaDepois = (listaDepois.body.liberadas as Array<{ ordem_id: number; liberacao: { entregue_em: string | null } }>).find(
      (item) => item.ordem_id === op.id,
    );
    expect(fichaDepois?.liberacao.entregue_em).toBe(row.entregue_em);

    const duplicada = await api.post(`/api/etapas/liberacao/${op.id}/entrega`).send({});
    expect(duplicada.status).toBe(409);
    expect(duplicada.body.erro).toMatch(/já foi confirmada/i);

    const resumo = await api.get('/api/financeiro/resumo');
    expect(resumo.body.a_pagar.costureiros).toEqual(expect.objectContaining({ valor: 18, quantidade: 1 }));
    const contas = await api.get('/api/financeiro/lancamentos').query({
      tipo: 'pagar',
      status: 'aberto',
      categoria_id: resumo.body.a_pagar.costureiros.categoria_id,
      por_pagina: 100,
    });
    expect(contas.body.total).toBe(1);
    expect(contas.body.data[0].descricao).toMatch(/Oficina Norte/);
    expect(contas.body.data[0].descricao).toMatch(/Ana Souza/);
    expect(contas.body.data[0].descricao).toMatch(/6 pç/);
    expect(contas.body.data[0].valor).toBe(18);
    expect(contas.body.data[0].status).toBe('pendente');
    expect(contas.body.data[0].ordem_corte_id).toBeTruthy();

    const semOc = await api.post('/api/etapas/liberacao/99999/entrega').send({});
    expect(semOc.status).toBe(404);

    const outra = await criarFichaPronta({ cliente: 'Loja B' });
    const semLiberar = await api.post(`/api/etapas/liberacao/${outra.op.id}/entrega`).send({});
    expect(semLiberar.status).toBe(409);

    const { api: empresa2 } = await autenticarNovaEmpresa(app, {
      nome: 'Outra Confecção',
      email: 'entrega-outra@teste.com',
    });
    const tentativa = await empresa2.post(`/api/etapas/liberacao/${op.id}/entrega`).send({});
    expect(tentativa.status).toBe(404);
  });

  it('grava a chave Pix da oficina e não marca pagamento', async () => {
    const { op } = await criarFichaPronta();
    await api.post(`/api/etapas/liberacao/${op.id}`).send({
      costureiro: 'Ana Souza',
      valor_peca: 3.5,
      oficina: 'Oficina Norte',
      data_liberacao: '2026-11-01',
    });
    await api.post(`/api/etapas/liberacao/${op.id}/entrega`).send({});

    const pix = await api.put('/api/etapas/liberacao/oficinas/pix').send({
      nome: 'Oficina Norte',
      chave_pix: '11988887777',
    });
    expect(pix.status).toBe(200);
    expect(pix.body).toEqual(expect.objectContaining({ nome: 'Oficina Norte', chave_pix: '11988887777' }));

    const lista = await api.get('/api/etapas/liberacao');
    expect(lista.body.oficinas_pix).toEqual(
      expect.arrayContaining([expect.objectContaining({ nome: 'Oficina Norte', chave_pix: '11988887777' })]),
    );
    expect(lista.body.liberadas[0].liberacao.valor_peca).toBe(3.5);
    expect(lista.body.liberadas[0].liberacao.entregue_em).toBeTruthy();

    const row = db
      .prepare(`SELECT chave_pix, nome FROM oficinas_cadastro WHERE lower(nome) = lower(?)`)
      .get('Oficina Norte') as { chave_pix: string; nome: string };
    expect(row.chave_pix).toBe('11988887777');

    const { api: empresa2 } = await autenticarNovaEmpresa(app, {
      nome: 'Outra Confecção',
      email: 'pix-outra@teste.com',
    });
    await empresa2.put('/api/etapas/liberacao/oficinas/pix').send({
      nome: 'Oficina Norte',
      chave_pix: 'chave-invasora',
    });
    const original = db
      .prepare(
        `SELECT chave_pix FROM oficinas_cadastro
          WHERE lower(nome) = lower(?) AND chave_pix = ?`,
      )
      .get('Oficina Norte', '11988887777') as { chave_pix: string } | undefined;
    expect(original?.chave_pix).toBe('11988887777');
  });

  it('lança Costureiros a pagar só na entrega confirmada, sem duplicar, e baixa ao pagar', async () => {
    const primeira = await criarFichaPronta();
    await api.post(`/api/etapas/liberacao/${primeira.op.id}`).send({
      costureiro: 'Ana Souza',
      valor_peca: 3,
      oficina: 'Oficina Norte',
      data_liberacao: '2026-10-01',
    });
    const antes = await api.get('/api/financeiro/resumo');
    expect(antes.body.a_pagar.costureiros).toEqual(expect.objectContaining({ valor: 0, quantidade: 0 }));

    await api.post(`/api/etapas/liberacao/${primeira.op.id}/entrega`).send({});
    const depoisEntrega = await api.get('/api/financeiro/resumo');
    expect(depoisEntrega.body.a_pagar.costureiros).toEqual(expect.objectContaining({ valor: 18, quantidade: 1 }));

    const segunda = await criarFichaPronta({ cliente: 'Loja C', referencia: 'CAM-LIB-2' });
    await api.post(`/api/etapas/liberacao/${segunda.op.id}`).send({
      costureiro: 'Rita',
      valor_peca: 4,
      oficina: 'Oficina Leste',
      data_liberacao: '2026-10-02',
    });
    await api.post(`/api/etapas/liberacao/${segunda.op.id}/entrega`).send({});
    const duas = await api.get('/api/financeiro/resumo');
    expect(duas.body.a_pagar.costureiros).toEqual(expect.objectContaining({ valor: 42, quantidade: 2 }));

    sincronizarContasPagarOficinasEntregues(db);
    const aposSync = await api.get('/api/financeiro/resumo');
    expect(aposSync.body.a_pagar.costureiros).toEqual(expect.objectContaining({ valor: 42, quantidade: 2 }));

    const abertos = await api.get('/api/financeiro/lancamentos').query({
      tipo: 'pagar',
      status: 'aberto',
      categoria_id: duas.body.a_pagar.costureiros.categoria_id,
      por_pagina: 100,
    });
    expect(abertos.body.total).toBe(2);
    const primeiraConta = abertos.body.data.find((l: { descricao: string }) => l.descricao.includes('Ana Souza'));
    expect(primeiraConta.observacoes).toMatch(/Quantidade de peças: 6/);
    expect(primeiraConta.observacoes).toMatch(/Valor total:/);
    const baixar = await api.patch(`/api/financeiro/lancamentos/${primeiraConta.id}`).send({ status: 'pago' });
    expect(baixar.status).toBe(200);
    const aposPagamento = await api.get('/api/financeiro/resumo');
    expect(aposPagamento.body.a_pagar.costureiros).toEqual(expect.objectContaining({ valor: 24, quantidade: 1 }));

    const duplicada = await api.post(`/api/etapas/liberacao/${primeira.op.id}/entrega`).send({});
    expect(duplicada.status).toBe(409);
    const final = await api.get('/api/financeiro/resumo');
    expect(final.body.a_pagar.costureiros).toEqual(expect.objectContaining({ valor: 24, quantidade: 1 }));
    expect(final.body.contas_pagar).toBe(24);
  });

  it('sincroniza OCs já entregues para concluída sem criar liberação nem mudar valores', async () => {
    const entregue = await criarFichaPronta({ cliente: 'Loja Sync Entregue' });
    await api.post(`/api/etapas/liberacao/${entregue.op.id}`).send({
      costureiro: 'Ana Souza',
      valor_peca: 3,
      oficina: 'Oficina Norte',
      data_liberacao: '2026-10-01',
    });
    db.prepare(
      `UPDATE ordem_corte_liberacoes SET entregue_em = '2026-11-01 10:00:00', entregue_por = 1 WHERE ordem_id = ?`,
    ).run(entregue.op.id);
    db.prepare(`UPDATE ordens_producao SET status = 'costura' WHERE id = ?`).run(entregue.op.id);
    db.prepare(`UPDATE ordens_corte SET status_processo = 'encaminhado' WHERE ordem_id = ?`).run(entregue.op.id);

    const semLib = await criarFichaPronta({ cliente: 'Loja Sem Liberacao', referencia: 'SEM-LIB' });
    db.prepare(`UPDATE ordens_producao SET status = 'costura' WHERE id = ?`).run(semLib.op.id);
    db.prepare(`UPDATE ordens_corte SET status_processo = 'encaminhado' WHERE ordem_id = ?`).run(semLib.op.id);

    const antes = db
      .prepare(
        `SELECT valor_peca, entregue_em, data_liberacao, oficina, costureiro FROM ordem_corte_liberacoes WHERE ordem_id = ?`,
      )
      .get(entregue.op.id) as {
      valor_peca: number;
      entregue_em: string;
      data_liberacao: string;
      oficina: string;
      costureiro: string;
    };
    const libsAntes = (db.prepare(`SELECT COUNT(*) AS n FROM ordem_corte_liberacoes`).get() as { n: number }).n;

    const painelAntes = await api.get('/api/ordens/producao').query({ etapa: 'costura' });
    expect(painelAntes.body.totais.cadastradas).toBe(2);
    expect(painelAntes.body.totais.entregues).toBe(1);
    expect(painelAntes.body.totais.andamento).toBe(1);
    expect((painelAntes.body.andamento as Array<{ id: number }>).map((item) => item.id)).toEqual([semLib.op.id]);

    sincronizarOrdensEntreguesOficina(db);

    const opEnt = db.prepare(`SELECT status FROM ordens_producao WHERE id = ?`).get(entregue.op.id) as {
      status: string;
    };
    const ocEnt = db.prepare(`SELECT status_processo FROM ordens_corte WHERE ordem_id = ?`).get(entregue.op.id) as {
      status_processo: string;
    };
    expect(opEnt.status).toBe('concluida');
    expect(ocEnt.status_processo).toBe('entregue');
    expect(
      db
        .prepare(
          `SELECT valor_peca, entregue_em, data_liberacao, oficina, costureiro FROM ordem_corte_liberacoes WHERE ordem_id = ?`,
        )
        .get(entregue.op.id),
    ).toEqual(antes);
    expect((db.prepare(`SELECT COUNT(*) AS n FROM ordem_corte_liberacoes`).get() as { n: number }).n).toBe(libsAntes);
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM ordem_corte_liberacoes WHERE ordem_id = ?`).get(semLib.op.id) as { n: number })
        .n,
    ).toBe(0);

    const opSem = db.prepare(`SELECT status FROM ordens_producao WHERE id = ?`).get(semLib.op.id) as { status: string };
    const ocSem = db.prepare(`SELECT status_processo FROM ordens_corte WHERE ordem_id = ?`).get(semLib.op.id) as {
      status_processo: string;
    };
    expect(opSem.status).toBe('costura');
    expect(ocSem.status_processo).toBe('encaminhado');

    const painel = await api.get('/api/ordens/producao').query({ etapa: 'costura' });
    expect(painel.body.totais).toEqual({ cadastradas: 2, andamento: 1, entregues: 1 });
    expect((painel.body.andamento as Array<{ id: number }>).map((item) => item.id)).toEqual([semLib.op.id]);
  });

  it('encaminha OC entregue para expedição só no clique, sem duplicar pagamento nem estoque', async () => {
    const { op, corte } = await criarFichaPronta();
    await api.post(`/api/etapas/liberacao/${op.id}`).send({
      costureiro: 'Ana Souza',
      valor_peca: 3,
      oficina: 'Oficina Norte',
      data_liberacao: '2026-10-01',
    });
    const entrega = await api.post(`/api/etapas/liberacao/${op.id}/entrega`).send({});
    expect(entrega.status).toBe(200);
    expect(entrega.body.status_processo).toBe('entregue');
    expect(entrega.body.expedicao).toBeNull();

    const movimentosAntes = (db.prepare('SELECT COUNT(*) AS n FROM estoque_movimentos').get() as { n: number }).n;
    const contasAntes = (
      db.prepare(`SELECT COUNT(*) AS n, ifnull(SUM(valor), 0) AS valor FROM financeiro_lancamentos`).get() as {
        n: number;
        valor: number;
      }
    );
    const historicoEntrega = (
      db
        .prepare(`SELECT COUNT(*) AS n FROM ordem_corte_historico WHERE acao = 'confirmar_entrega_oficina'`)
        .get() as { n: number }
    ).n;

    const cedo = await api.post(`/api/etapas/liberacao/${op.id}/expedicao`).send({});
    expect(cedo.status).toBe(201);
    expect(cedo.body.status_processo).toBe('expedicao');
    expect(cedo.body.liberacao.entregue_em).toBe(entrega.body.liberacao.entregue_em);
    expect(cedo.body.liberacao.valor_peca).toBe(3);
    expect(cedo.body.expedicao).toEqual(
      expect.objectContaining({
        ordem_id: op.id,
        ordem_corte_id: corte.id,
        codigo_oc: corte.codigo,
        oficina: 'Oficina Norte',
        costureiro: 'Ana Souza',
        pecas: 6,
        status: 'pronto_envio',
      }),
    );
    expect(cedo.body.expedicao.encaminhado_em).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

    const duplicada = await api.post(`/api/etapas/liberacao/${op.id}/expedicao`).send({});
    expect(duplicada.status).toBe(409);
    expect(duplicada.body.erro).toMatch(/já foi encaminhada/i);

    const ocRows = db.prepare(`SELECT COUNT(*) AS n FROM ordem_corte_expedicoes`).get() as { n: number };
    expect(ocRows.n).toBe(1);
    expect((db.prepare(`SELECT COUNT(*) AS n FROM expedicoes`).get() as { n: number }).n).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM estoque_movimentos').get() as { n: number }).toEqual({
      n: movimentosAntes,
    });
    expect(
      db.prepare(`SELECT COUNT(*) AS n, ifnull(SUM(valor), 0) AS valor FROM financeiro_lancamentos`).get() as {
        n: number;
        valor: number;
      },
    ).toEqual(contasAntes);
    expect(
      (db.prepare(`SELECT entregue_em, valor_peca FROM ordem_corte_liberacoes WHERE ordem_id = ?`).get(op.id) as {
        entregue_em: string;
        valor_peca: number;
      }).entregue_em,
    ).toBe(entrega.body.liberacao.entregue_em);
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM ordem_corte_historico WHERE acao = 'confirmar_entrega_oficina'`).get() as {
        n: number;
      }).n,
    ).toBe(historicoEntrega);
    expect(
      (
        db
          .prepare(`SELECT COUNT(*) AS n FROM ordem_corte_historico WHERE acao = 'encaminhar_expedicao'`)
          .get() as { n: number }
      ).n,
    ).toBe(1);

    const lista = await api.get('/api/etapas/liberacao');
    const ficha = (lista.body.liberadas as Array<{ ordem_id: number; expedicao: { status: string } | null }>).find(
      (item) => item.ordem_id === op.id,
    );
    expect(ficha?.expedicao?.status).toBe('pronto_envio');

    const filaOc = await api.get('/api/expedicao/ordens-corte').query({ fila: 'prontos' });
    expect(filaOc.status).toBe(200);
    expect(filaOc.body.total).toBe(1);
    expect(filaOc.body.data[0]).toEqual(
      expect.objectContaining({
        codigo_oc: corte.codigo,
        oficina: 'Oficina Norte',
        costureiro: 'Ana Souza',
        pecas: 6,
        status: 'pronto_envio',
      }),
    );

    expect(cedo.body.expedicao.pecas_conferidas).toBeNull();
    expect(cedo.body.expedicao.pecas_expedicao).toBe(6);

    const pedidos = await api.get('/api/expedicao');
    expect(pedidos.body.total).toBe(0);

    const expedir = await api.post(`/api/expedicao/ordens-corte/${op.id}/expedir`).send({});
    expect(expedir.status).toBe(200);
    expect(expedir.body.status).toBe('expedido');
    const entregar = await api.post(`/api/expedicao/ordens-corte/${op.id}/entregar`).send({});
    expect(entregar.status).toBe(200);
    expect(entregar.body.status).toBe('entregue');
    const abertas = await api.get('/api/expedicao/ordens-corte').query({ fila: 'prontos' });
    expect(abertas.body.total).toBe(0);
    const finalizadas = await api.get('/api/expedicao/ordens-corte').query({ fila: 'entregues' });
    expect(finalizadas.body.total).toBe(1);
  });

  it('não encaminha para expedição antes da entrega da oficina', async () => {
    const { op } = await criarFichaPronta();
    await api.post(`/api/etapas/liberacao/${op.id}`).send({
      costureiro: 'Ana Souza',
      valor_peca: 3,
      oficina: 'Oficina Norte',
      data_liberacao: '2026-10-01',
    });
    const cedo = await api.post(`/api/etapas/liberacao/${op.id}/expedicao`).send({});
    expect(cedo.status).toBe(409);
    expect(cedo.body.erro).toMatch(/entrega/i);
    expect((db.prepare(`SELECT COUNT(*) AS n FROM ordem_corte_expedicoes`).get() as { n: number }).n).toBe(0);
  });

  it('grava a quantidade conferida na expedição sem sobrescrever a original nem mexer em pagamento e estoque', async () => {
    const { op, corte } = await criarFichaPronta();
    await api.post(`/api/etapas/liberacao/${op.id}`).send({
      costureiro: 'Ana Souza',
      valor_peca: 3,
      oficina: 'Oficina Norte',
      data_liberacao: '2026-10-01',
    });
    await api.post(`/api/etapas/liberacao/${op.id}/entrega`).send({});
    const cedo = await api.post(`/api/etapas/liberacao/${op.id}/conferencia`).send({ pecas_conferidas: 4 });
    expect(cedo.status).toBe(409);
    expect(cedo.body.erro).toMatch(/expedição/i);

    const envio = await api.post(`/api/etapas/liberacao/${op.id}/expedicao`).send({});
    expect(envio.status).toBe(201);
    const movimentosAntes = (db.prepare('SELECT COUNT(*) AS n FROM estoque_movimentos').get() as { n: number }).n;
    const contasAntes = (
      db.prepare(`SELECT COUNT(*) AS n, ifnull(SUM(valor), 0) AS valor FROM financeiro_lancamentos`).get() as {
        n: number;
        valor: number;
      }
    );
    const gradeAntes = (
      db.prepare(`SELECT SUM(quantidade) AS n FROM ordem_corte_grade WHERE ordem_corte_id = ?`).get(corte.id) as {
        n: number;
      }
    ).n;
    const ocAntes = db
      .prepare(`SELECT quantidade FROM ordens_corte WHERE id = ?`)
      .get(corte.id) as { quantidade: number };

    const invalida = await api.post(`/api/etapas/liberacao/${op.id}/conferencia`).send({ pecas_conferidas: -1 });
    expect(invalida.status).toBe(400);

    const conf = await api.post(`/api/etapas/liberacao/${op.id}/conferencia`).send({ pecas_conferidas: 4 });
    expect(conf.status).toBe(200);
    expect(conf.body.expedicao).toEqual(
      expect.objectContaining({
        pecas: 6,
        pecas_conferidas: 4,
        pecas_expedicao: 4,
        status: 'conferido',
        conferido_por_nome: 'Operador Teste',
      }),
    );
    expect(conf.body.expedicao.conferido_em).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

    const linha = db
      .prepare(
        `SELECT pecas, pecas_conferidas, conferido_em, conferido_por, status FROM ordem_corte_expedicoes WHERE ordem_id = ?`,
      )
      .get(op.id) as {
      pecas: number;
      pecas_conferidas: number;
      conferido_em: string;
      conferido_por: number;
      status: string;
    };
    expect(linha.pecas).toBe(6);
    expect(linha.pecas_conferidas).toBe(4);
    expect(linha.conferido_em).toBe(conf.body.expedicao.conferido_em);
    expect(linha.conferido_por).toBeTruthy();
    expect(linha.status).toBe('conferido');

    const repetida = await api.post(`/api/etapas/liberacao/${op.id}/conferencia`).send({ pecas_conferidas: 4 });
    expect(repetida.status).toBe(200);
    expect(repetida.body.expedicao.pecas_conferidas).toBe(4);
    expect(repetida.body.expedicao.conferido_em).toBe(conf.body.expedicao.conferido_em);
    expect(repetida.body.expedicao.conferido_por).toBe(conf.body.expedicao.conferido_por);

    const outra = await api.post(`/api/etapas/liberacao/${op.id}/conferencia`).send({ pecas_conferidas: 5 });
    expect(outra.status).toBe(200);
    expect(outra.body.expedicao.pecas).toBe(6);
    expect(outra.body.expedicao.pecas_conferidas).toBe(5);
    expect(outra.body.expedicao.pecas_expedicao).toBe(5);
    expect(outra.body.expedicao.conferido_em).toBe(conf.body.expedicao.conferido_em);
    expect((db.prepare(`SELECT COUNT(*) AS n FROM ordem_corte_expedicoes`).get() as { n: number }).n).toBe(1);

    expect(
      (db.prepare(`SELECT SUM(quantidade) AS n FROM ordem_corte_grade WHERE ordem_corte_id = ?`).get(corte.id) as {
        n: number;
      }).n,
    ).toBe(gradeAntes);
    expect(
      (db.prepare(`SELECT quantidade FROM ordens_corte WHERE id = ?`).get(corte.id) as { quantidade: number }).quantidade,
    ).toBe(ocAntes.quantidade);
    expect(db.prepare('SELECT COUNT(*) AS n FROM estoque_movimentos').get() as { n: number }).toEqual({
      n: movimentosAntes,
    });
    expect(
      db.prepare(`SELECT COUNT(*) AS n, ifnull(SUM(valor), 0) AS valor FROM financeiro_lancamentos`).get() as {
        n: number;
        valor: number;
      },
    ).toEqual(contasAntes);

    const lista = await api.get('/api/etapas/liberacao');
    const ficha = (
      lista.body.liberadas as Array<{
        ordem_id: number;
        grade: Array<{ quantidade: number }>;
        expedicao: { pecas: number; pecas_conferidas: number; pecas_expedicao: number };
      }>
    ).find((item) => item.ordem_id === op.id);
    expect(ficha?.expedicao).toEqual(
      expect.objectContaining({ pecas: 6, pecas_conferidas: 5, pecas_expedicao: 5, status: 'conferido' }),
    );
    expect(ficha?.grade.reduce((soma, celula) => soma + celula.quantidade, 0)).toBe(6);

    const filaOc = await api.get('/api/expedicao/ordens-corte').query({ fila: 'prontos' });
    expect(filaOc.body.data[0]).toEqual(
      expect.objectContaining({
        pecas: 6,
        pecas_conferidas: 5,
        pecas_expedicao: 5,
        status: 'conferido',
      }),
    );
    expect(
      (
        db
          .prepare(`SELECT COUNT(*) AS n FROM ordem_corte_historico WHERE acao = 'conferir_expedicao'`)
          .get() as { n: number }
      ).n,
    ).toBe(2);
  });

  it('integra pagamento da oficina na liberação: integral, parcial, estorno, sem duplicar nem backfill', async () => {
    const primeira = await criarFichaPronta({ cliente: 'Loja Norte', referencia: 'PAG-01' });
    await api.post(`/api/etapas/liberacao/${primeira.op.id}`).send({
      costureiro: 'Ana Souza',
      valor_peca: 3,
      oficina: 'Oficina Norte',
      data_liberacao: '2026-10-01',
    });
    await api.post(`/api/etapas/liberacao/${primeira.op.id}/entrega`).send({});

    const segunda = await criarFichaPronta({ cliente: 'Loja Leste', referencia: 'PAG-02', modelo: 'Calça' });
    await api.post(`/api/etapas/liberacao/${segunda.op.id}`).send({
      costureiro: 'Rita',
      valor_peca: 4,
      oficina: 'Oficina Leste',
      data_liberacao: '2026-10-02',
    });
    await api.post(`/api/etapas/liberacao/${segunda.op.id}/entrega`).send({});

    const contas = db
      .prepare(
        `SELECT id, ordem_corte_id, valor, status, ifnull(valor_pago,0) AS valor_pago
           FROM financeiro_lancamentos WHERE tipo = 'pagar' AND ordem_corte_id IS NOT NULL ORDER BY id`,
      )
      .all() as Array<{ id: number; ordem_corte_id: number; valor: number; status: string; valor_pago: number }>;
    expect(contas).toHaveLength(2);
    const norte = contas.find((item) => item.ordem_corte_id === primeira.corte.id)!;
    const leste = contas.find((item) => item.ordem_corte_id === segunda.corte.id)!;
    expect(norte.valor).toBe(18);
    expect(leste.valor).toBe(24);

    sincronizarContasPagarOficinasEntregues(db);
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM financeiro_lancamentos WHERE tipo='pagar' AND ordem_corte_id IS NOT NULL`).get() as { n: number }).n,
    ).toBe(2);
    const reentrega = await api.post(`/api/etapas/liberacao/${primeira.op.id}/entrega`).send({});
    expect(reentrega.status).toBe(409);

    const parcial = await api.patch(`/api/financeiro/lancamentos/${norte.id}`).send({ valor_pago: 10 });
    expect(parcial.status).toBe(200);
    expect(parcial.body.status).toBe('pendente');
    expect(parcial.body.status_pagamento).toBe('parcial');
    expect(parcial.body.valor_pago).toBe(10);
    expect(parcial.body.saldo).toBe(8);

    const listaParcial = await api.get('/api/etapas/liberacao');
    const fichaNorte = (listaParcial.body.liberadas as Array<{ ordem_id: number; pagamento: { status: string; valor_pago: number; saldo: number } }>).find(
      (item) => item.ordem_id === primeira.op.id,
    );
    const fichaLeste = (listaParcial.body.liberadas as Array<{ ordem_id: number; pagamento: { status: string; valor_pago: number } }>).find(
      (item) => item.ordem_id === segunda.op.id,
    );
    expect(fichaNorte?.pagamento).toEqual(expect.objectContaining({ status: 'parcial', valor_pago: 10, saldo: 8 }));
    expect(fichaLeste?.pagamento).toEqual(expect.objectContaining({ status: 'pendente', valor_pago: 0 }));

    const integral = await api.patch(`/api/financeiro/lancamentos/${leste.id}`).send({ status: 'pago' });
    expect(integral.body.status).toBe('pago');
    expect(integral.body.valor_pago).toBe(0);
    expect(integral.body.status_pagamento).toBe('pago');
    expect(integral.body.valor_pago_efetivo).toBe(24);
    const pagoColuna = db
      .prepare(`SELECT valor_pago, status FROM financeiro_lancamentos WHERE id = ?`)
      .get(leste.id) as { valor_pago: number; status: string };
    expect(pagoColuna).toEqual({ valor_pago: 0, status: 'pago' });

    const listaPaga = await api.get('/api/etapas/liberacao');
    const lestePaga = (listaPaga.body.liberadas as Array<{ ordem_id: number; pagamento: { status: string; valor_pago: number; saldo: number } }>).find(
      (item) => item.ordem_id === segunda.op.id,
    );
    expect(lestePaga?.pagamento).toEqual(expect.objectContaining({ status: 'pago', valor_pago: 24, saldo: 0 }));

    const estorno = await api.patch(`/api/financeiro/lancamentos/${leste.id}`).send({ status: 'pendente', valor_pago: 0 });
    expect(estorno.body.status_pagamento).toBe('pendente');
    expect(estorno.body.saldo).toBe(24);
    const listaEstorno = await api.get('/api/etapas/liberacao');
    const lesteEstornada = (listaEstorno.body.liberadas as Array<{ ordem_id: number; pagamento: { status: string } }>).find(
      (item) => item.ordem_id === segunda.op.id,
    );
    expect(lesteEstornada?.pagamento.status).toBe('pendente');

    const eventos = db
      .prepare(`SELECT acao FROM financeiro_lancamento_eventos WHERE lancamento_id IN (?, ?) ORDER BY id`)
      .all(norte.id, leste.id) as Array<{ acao: string }>;
    expect(eventos.map((item) => item.acao)).toEqual(
      expect.arrayContaining(['pagamento_parcial', 'pagamento_confirmado', 'pagamento_estornado']),
    );

    const producao = await autenticarPapel(app, api, 'producao');
    const tentativa = await producao.patch(`/api/financeiro/lancamentos/${norte.id}`).send({ status: 'pago' });
    expect(tentativa.status).toBe(403);

    const { api: empresa2 } = await autenticarNovaEmpresa(app, {
      nome: 'Outra Confecção Pag',
      email: 'pag-outra@teste.com',
    });
    const alheio = await empresa2.patch(`/api/financeiro/lancamentos/${norte.id}`).send({ status: 'pago' });
    expect(alheio.status).toBe(404);
    const listaAlheia = await empresa2.get('/api/etapas/liberacao');
    expect(listaAlheia.body.liberadas).toHaveLength(0);
  });

  it('não marca oficina como paga por Pix nem por boleto de compra', async () => {
    const { op, corte } = await criarFichaPronta({ cliente: 'Loja Pix Boleto' });
    await api.post(`/api/etapas/liberacao/${op.id}`).send({
      costureiro: 'Ana Souza',
      valor_peca: 3,
      oficina: 'Oficina Norte',
      data_liberacao: '2026-10-01',
    });
    await api.post(`/api/etapas/liberacao/${op.id}/entrega`).send({});
    await api.put('/api/etapas/liberacao/oficinas/pix').send({
      nome: 'Oficina Norte',
      chave_pix: '11988887777',
    });

    const forn = await api.post('/api/fornecedores').send({ nome: 'Tecido Boleto' });
    const mat = await api.post('/api/materias-primas').send({ nome: 'Linha Boleto', tipo: 'linha', custo: 4 });
    const compra = await api.post('/api/compras').send({
      fornecedor_id: forn.body.id,
      status: 'aberta',
      forma_pagamento: 'boleto',
      vencimento: '2099-01-15',
      itens: [{ materia_prima_id: mat.body.id, quantidade: 5, custo_unitario: 8 }],
    });
    expect(compra.status).toBe(201);
    const boletos = await api.get('/api/financeiro/lancamentos').query({ tipo: 'pagar', por_pagina: 100 });
    const boleto = (boletos.body.data as Array<{ id: number; compra_id: number | null; ordem_corte_id?: number | null }>).find(
      (item) => item.compra_id === compra.body.id,
    );
    expect(boleto).toBeTruthy();
    await api.patch(`/api/financeiro/lancamentos/${boleto!.id}`).send({ status: 'pago' });

    const oficina = db
      .prepare(
        `SELECT status, ifnull(valor_pago,0) AS valor_pago FROM financeiro_lancamentos
          WHERE ordem_corte_id = ? AND tipo = 'pagar'`,
      )
      .get(corte.id) as { status: string; valor_pago: number };
    expect(oficina.status).toBe('pendente');
    expect(oficina.valor_pago).toBe(0);
    const lista = await api.get('/api/etapas/liberacao');
    const ficha = (lista.body.liberadas as Array<{ ordem_id: number; pagamento: { status: string } }>).find(
      (item) => item.ordem_id === op.id,
    );
    expect(ficha?.pagamento.status).toBe('pendente');
  });
});
