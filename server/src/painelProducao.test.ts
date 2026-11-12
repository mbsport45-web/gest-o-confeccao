import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';
import { autenticar, type TestApi } from './httpTest.js';

describe('painel de produção das ordens', () => {
  let db: AppDatabase;
  let api: TestApi;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    api = await autenticar(createApp(db));
  });

  afterEach(() => {
    db.close();
  });

  async function criarOp(status: string, nome: string) {
    const produto = await api.post('/api/produtos').send({ sku: `SKU-${nome}`, nome });
    const op = await api.post('/api/ordens').send({
      cliente: `Cliente ${nome}`,
      produto_id: produto.body.id,
      quantidade: 2,
      status,
      grade: [{ cor: 'Preto', tamanho: 'M', quantidade: 2 }],
    });
    return op.body as { id: number; codigo: string | null; status: string };
  }

  it('conta cada OP uma vez e não mistura planejada, andamento e entregue', async () => {
    const planejada = await criarOp('planejada', 'Planejada');
    const corte = await criarOp('corte', 'Corte');
    const costura = await criarOp('costura', 'Costura');
    const estamparia = await criarOp('qualidade', 'Estamparia');
    const acabamento = await criarOp('acabamento', 'Acabamento');
    const expedicao = await criarOp('embalagem', 'Expedicao');
    const entregue = await criarOp('concluida', 'Entregue');

    await api.post(`/api/ordens/${planejada.id}/ordem-corte`).send({});
    await api.post(`/api/ordens/${corte.id}/ordem-corte`).send({});

    const painel = await api.get('/api/ordens/producao').query({ etapa: 'corte' });
    expect(painel.status).toBe(200);
    const ids = (painel.body.andamento as Array<{ id: number }>).map((item) => item.id);
    expect(ids).toEqual([corte.id]);
    expect(ids).not.toContain(planejada.id);
    expect(ids).not.toContain(entregue.id);
    expect(ids).not.toContain(costura.id);

    expect(painel.body.totais).toEqual({
      cadastradas: 7,
      andamento: 5,
      entregues: 1,
    });
    expect(painel.body.por_etapa).toEqual({
      corte: 1,
      costura: 1,
      acabamento: 1,
      estamparia: 1,
      expedicao: 1,
    });
    const noBanco = db.prepare('SELECT COUNT(*) AS n FROM ordens_producao').get() as { n: number };
    const fichasCorte = db.prepare('SELECT COUNT(*) AS n FROM ordens_corte').get() as { n: number };
    expect(fichasCorte.n).toBe(2);
    expect(painel.body.totais.cadastradas).toBe(noBanco.n);
    expect(painel.body.totais.cadastradas).not.toBe(noBanco.n + fichasCorte.n);
  });

  it('a consulta de cada aba devolve só o setor pedido', async () => {
    const planejada = await criarOp('planejada', 'Planejada');
    const corte = await criarOp('corte', 'Corte');
    const costura = await criarOp('costura', 'Costura');
    const estampa = await criarOp('qualidade', 'Estampa');
    const acabamento = await criarOp('acabamento', 'Acabamento');
    const expedicao = await criarOp('embalagem', 'Expedicao');

    const semAba = await api.get('/api/ordens/producao');
    expect(semAba.status).toBe(200);
    expect(semAba.body.andamento).toEqual([]);
    expect(semAba.body.etapa).toBeNull();
    expect(semAba.body.totais.andamento).toBe(5);

    const consultas = [
      ['corte', corte.id],
      ['costura', costura.id],
      ['acabamento', acabamento.id],
      ['estampa', estampa.id],
      ['expedicao', expedicao.id],
    ] as const;

    for (const [etapa, idEsperado] of consultas) {
      const res = await api.get('/api/ordens/producao').query({ etapa });
      expect(res.status).toBe(200);
      const ids = (res.body.andamento as Array<{ id: number; etapa_linha: string }>).map((item) => item.id);
      expect(ids).toEqual([idEsperado]);
      expect(ids).not.toContain(planejada.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(
        (res.body.andamento as Array<{ etapa_linha: string }>).every(
          (item) => item.etapa_linha === res.body.etapa,
        ),
      ).toBe(true);
    }
  });

  it('não mistura setores ao sair de uma aba e recusar etapa inválida', async () => {
    await criarOp('corte', 'Corte');
    await criarOp('costura', 'Costura');

    const corte = await api.get('/api/ordens/producao').query({ etapa: 'corte' });
    const costura = await api.get('/api/ordens/producao').query({ etapa: 'costura' });
    const acabamento = await api.get('/api/ordens/producao').query({ etapa: 'acabamento' });

    expect((corte.body.andamento as Array<{ etapa_linha: string }>).map((item) => item.etapa_linha)).toEqual([
      'corte',
    ]);
    expect((costura.body.andamento as Array<{ etapa_linha: string }>).map((item) => item.etapa_linha)).toEqual([
      'costura',
    ]);
    expect(acabamento.body.andamento).toEqual([]);
    expect(corte.body.andamento).not.toEqual(costura.body.andamento);

    const invalida = await api.get('/api/ordens/producao').query({ etapa: 'planejada' });
    expect(invalida.status).toBe(400);
    expect(invalida.body.erro).toBe('Etapa inválida');
  });

  it('não duplica a OP quando existe ficha de corte enviada ao enfesto', async () => {
    const materia = await api.post('/api/materias-primas').send({
      codigo: 'MALHA-PAINEL',
      nome: 'Malha Painel',
      tipo: 'tecido',
      unidade: 'KG',
    });
    const produto = await api.post('/api/produtos').send({ sku: 'CAM-PAINEL', nome: 'Camiseta Painel' });
    const op = await api.post('/api/ordens').send({
      cliente: 'Loja Painel',
      produto_id: produto.body.id,
      quantidade: 4,
      status: 'planejada',
      requisitos: [{ materia_prima_id: materia.body.id, quantidade: 0.2 }],
      grade: [
        { cor: 'Preto', tamanho: 'M', quantidade: 2 },
        { cor: 'Preto', tamanho: 'G', quantidade: 2 },
      ],
    });
    await api.post(`/api/ordens/${op.body.id}/ordem-corte`).send({});
    await api.patch(`/api/ordens/${op.body.id}/ordem-corte`).send({
      modelo: 'Camiseta Painel',
      composicao: 'algodão',
      grade: [
        { cor: 'Preto', tamanho: 'M', quantidade: 2 },
        { cor: 'Preto', tamanho: 'G', quantidade: 2 },
      ],
    });

    const antes = await api.get('/api/ordens/producao').query({ etapa: 'corte' });
    expect((antes.body.andamento as Array<{ id: number }>).filter((item) => item.id === op.body.id)).toHaveLength(
      0,
    );

    const enviada = await api.post(`/api/ordens/${op.body.id}/ordem-corte/enviar-enfesto`).send({});
    expect(enviada.body.status_processo).toBe('aguardando_enfesto');

    const depois = await api.get('/api/ordens/producao').query({ etapa: 'corte' });
    const naLinha = (depois.body.andamento as Array<{ id: number; etapa_linha: string }>).filter(
      (item) => item.id === op.body.id,
    );
    expect(naLinha).toHaveLength(1);
    expect(naLinha[0].etapa_linha).toBe('corte');
    expect(depois.body.totais.andamento).toBe(1);
    expect(depois.body.totais.cadastradas).toBe(1);
    expect(depois.body.totais.entregues).toBe(0);
    expect(depois.body.por_etapa.corte).toBe(1);
    expect(depois.body.por_etapa.costura).toBe(0);

    const costura = await api.get('/api/ordens/producao').query({ etapa: 'costura' });
    expect((costura.body.andamento as Array<{ id: number }>).filter((item) => item.id === op.body.id)).toHaveLength(
      0,
    );
  });

  it('tira da Costura a OP com entrega confirmada e mantém planejada só no total', async () => {
    const planejada = await criarOp('planejada', 'AindaPlanejada');
    const costura = await criarOp('costura', 'CosturaEntregue');
    await api.post(`/api/ordens/${costura.id}/ordem-corte`).send({});
    db.prepare(
      `INSERT INTO ordem_corte_liberacoes (
         empresa_id, ordem_corte_id, ordem_id, costureiro, valor_peca,
         referencia, tipo_peca, oficina, data_liberacao, codigo_oc,
         liberado_em, entregue_em
       )
       SELECT empresa_id, id, ordem_id, 'Ana', 3, 'REF-ENT', 'camiseta', 'Oficina Norte',
              '2026-11-01', codigo, datetime('now'), '2026-11-01 10:00:00'
         FROM ordens_corte WHERE ordem_id = ?`,
    ).run(costura.id);
    db.prepare(`UPDATE ordens_corte SET status_processo = 'encaminhado' WHERE ordem_id = ?`).run(costura.id);

    const painel = await api.get('/api/ordens/producao').query({ etapa: 'costura' });
    expect(painel.status).toBe(200);
    expect(painel.body.totais).toEqual({ cadastradas: 2, andamento: 0, entregues: 1 });
    expect(painel.body.por_etapa.costura).toBe(0);
    const ids = (painel.body.andamento as Array<{ id: number }>).map((item) => item.id);
    expect(ids).not.toContain(costura.id);
    expect(ids).not.toContain(planejada.id);
  });
});
