import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';
import { autenticar, autenticarNovaEmpresa, type TestApi } from './httpTest.js';

describe('corte e infesto', () => {
  let db: AppDatabase;
  let api: TestApi;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    api = await autenticar(createApp(db));
  });

  afterEach(() => {
    db.close();
  });

  async function tecido(dados: { nome: string; unidade?: string; tipo?: string }) {
    const materia = await api.post('/api/materias-primas').send({
      nome: dados.nome,
      tipo: dados.tipo ?? 'tecido',
      unidade: dados.unidade ?? 'KG',
    });
    expect(materia.status).toBe(201);
    return materia.body as { id: number; unidade: string };
  }

  async function ordem(quantidade = 10, cor = 'Preto') {
    const criada = await api.post('/api/ordens').send({
      cliente: 'Loja Corte',
      produto: 'Bermuda',
      quantidade,
      status: 'planejada',
      grade: [
        { cor, tamanho: 'M', quantidade },
        { cor: 'Branco', tamanho: 'M', quantidade: 0 },
      ],
    });
    expect(criada.status).toBe(201);
    return criada.body as { id: number; codigo: string };
  }

  async function saldo(materiaId: number) {
    const lista = await api.get('/api/estoque').query({ tipo: 'materia' });
    const item = (lista.body.data as Array<{ materia_prima_id: number; quantidade: number }>).find(
      (saldoItem) => saldoItem.materia_prima_id === materiaId,
    );
    return item?.quantidade ?? 0;
  }

  function corteBody(dados: {
    materia_prima_id: number;
    cor: string;
    quantidade: number;
    tamanho?: string;
    camadas: number;
    metragem?: number;
    peso_real?: number;
    itens?: Array<{ tamanho: string; quantidade: number }>;
    autorizar_excedente?: boolean;
  }) {
    return {
      materia_prima_id: dados.materia_prima_id,
      cor: dados.cor,
      camadas: dados.camadas,
      ...(dados.metragem !== undefined ? { metragem: dados.metragem } : {}),
      ...(dados.peso_real !== undefined ? { peso_real: dados.peso_real } : {}),
      itens: dados.itens ?? [{ tamanho: dados.tamanho ?? 'M', quantidade: dados.quantidade }],
      ...(dados.autorizar_excedente ? { autorizar_excedente: true } : {}),
    };
  }

  it('baixa o peso real do tecido em KG, grava o histórico e segue para costura', async () => {
    const malha = await tecido({ nome: 'Malha dry' });
    const linha = await tecido({ nome: 'Linha reta', tipo: 'linha' });
    await api.post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 10,
      materia_prima_id: malha.id,
    });
    const criada = await api.post('/api/ordens').send({
      cliente: 'Loja Corte',
      produto: 'Bermuda',
      quantidade: 10,
      status: 'planejada',
      requisitos: [{ materia_prima_id: malha.id, quantidade: 0.4 }],
      grade: [{ cor: 'Preto', tamanho: 'M', quantidade: 10 }],
    });
    expect(criada.status).toBe(201);
    const op = criada.body as { id: number; codigo: string };
    await api.post('/api/etapas/fluxo').send({ ordem_id: op.id });

    const invalido = await api.post(`/api/ordens/${op.id}/corte-infesto`).send(
      corteBody({
        materia_prima_id: linha.id,
        cor: 'Preto',
        quantidade: 10,
        camadas: 20,
        metragem: 12,
        peso_real: 1.5,
      }),
    );
    expect(invalido.status).toBe(400);

    const acima = await api.post(`/api/ordens/${op.id}/corte-infesto`).send(
      corteBody({
        materia_prima_id: malha.id,
        cor: 'Preto',
        quantidade: 11,
        camadas: 20,
        metragem: 12,
        peso_real: 1.5,
      }),
    );
    expect(acima.status).toBe(409);
    expect(acima.body.erro).toContain('M');

    const corte = await api.post(`/api/ordens/${op.id}/corte-infesto`).send(
      corteBody({
        materia_prima_id: malha.id,
        cor: ' preto ',
        quantidade: 10,
        camadas: 20,
        metragem: 12.5,
        peso_real: 1.5,
      }),
    );
    expect(corte.status).toBe(201);
    expect(corte.body.cor).toBe('Preto');
    expect(corte.body.camadas).toBe(20);
    expect(corte.body.metragem).toBe(12.5);
    expect(corte.body.peso_real).toBe(1.5);
    expect(corte.body.quantidade_pecas).toBe(10);
    expect(corte.body.itens).toEqual([{ cor: 'Preto', tamanho: 'M', quantidade: 10 }]);
    expect(corte.body.quantidade_baixada).toBe(1.5);
    expect(corte.body.avancou).toBe(true);
    expect(corte.body.ordem.status).toBe('costura');
    expect(await saldo(malha.id)).toBe(8.5);

    const movimentos = await api.get('/api/estoque/movimentos').query({ materia_prima_id: malha.id });
    const saida = (movimentos.body.data as Array<{ tipo: string; quantidade: number; motivo: string }>).find(
      (item) => item.tipo === 'saida',
    );
    expect(saida?.quantidade).toBe(1.5);
    expect(saida?.motivo).toContain(op.codigo);

    const repetido = await api.post(`/api/ordens/${op.id}/corte-infesto`).send(
      corteBody({
        materia_prima_id: malha.id,
        cor: 'Preto',
        quantidade: 10,
        camadas: 20,
        metragem: 12.5,
        peso_real: 1.5,
      }),
    );
    expect(repetido.status).toBe(409);
    expect(await saldo(malha.id)).toBe(8.5);

    const etapas = await api.get('/api/etapas').query({ ordem_id: op.id });
    const tipos = etapas.body.data as Array<{ tipo: string; status: string }>;
    expect(tipos.find((etapa) => etapa.tipo === 'corte')?.status).toBe('concluida');
    expect(tipos.find((etapa) => etapa.tipo === 'costura')?.status).toBe('em_andamento');

    const cancelar = await api.patch(`/api/ordens/${op.id}`).send({ status: 'cancelada' });
    expect(cancelar.status).toBe(200);
    expect(await saldo(malha.id)).toBe(10);
  });

  it('não baixa de novo quando o estoque já saiu ao entrar em corte e isola a empresa', async () => {
    const malha = await tecido({ nome: 'Malha já cortada' });
    await api.post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 10,
      materia_prima_id: malha.id,
    });
    const op = await api.post('/api/ordens').send({
      cliente: 'Loja Já',
      produto: 'Camisa',
      quantidade: 4,
      status: 'planejada',
      requisitos: [{ materia_prima_id: malha.id, quantidade: 1 }],
      grade: [{ cor: 'Azul', tamanho: 'M', quantidade: 4 }],
    });
    const emCorte = await api.patch(`/api/ordens/${op.body.id}`).send({ status: 'corte' });
    expect(emCorte.status).toBe(200);
    expect(await saldo(malha.id)).toBe(6);

    const corte = await api.post(`/api/ordens/${op.body.id}/corte-infesto`).send(
      corteBody({
        materia_prima_id: malha.id,
        cor: 'Azul',
        quantidade: 4,
        camadas: 8,
        metragem: 6,
        peso_real: 2,
      }),
    );
    expect(corte.status).toBe(201);
    expect(corte.body.quantidade_baixada).toBe(0);
    expect(corte.body.ordem.status).toBe('costura');
    expect(await saldo(malha.id)).toBe(6);

    const app = createApp(db);
    const { api: outra } = await autenticarNovaEmpresa(app);
    const alheio = await outra.post(`/api/ordens/${op.body.id}/corte-infesto`).send(
      corteBody({
        materia_prima_id: malha.id,
        cor: 'Azul',
        quantidade: 4,
        camadas: 8,
        metragem: 6,
        peso_real: 2,
      }),
    );
    expect(alheio.status).toBe(404);
    const listaOutra = await outra.get('/api/ordens/corte-infesto');
    expect(listaOutra.body).toEqual([]);
  });

  it('recusa a saída quando o tecido não cobre o peso e baixa metragem quando a unidade é MT', async () => {
    const malha = await tecido({ nome: 'Malha curta' });
    const op = await ordem(2);
    const semSaldo = await api.post(`/api/ordens/${op.id}/corte-infesto`).send(
      corteBody({
        materia_prima_id: malha.id,
        cor: 'Preto',
        quantidade: 2,
        camadas: 4,
        metragem: 3,
        peso_real: 1,
      }),
    );
    expect(semSaldo.status).toBe(409);
    expect(semSaldo.body.erro).toBe('Estoque insuficiente para a saída');
    const ordemDepois = await api.get(`/api/ordens/${op.id}`);
    expect(ordemDepois.body.status).toBe('planejada');
    expect(await api.get('/api/ordens/corte-infesto')).toMatchObject({ body: [] });

    const metro = await tecido({ nome: 'Tela metro', unidade: 'MT' });
    await api.post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 20,
      materia_prima_id: metro.id,
    });
    const segunda = await ordem(2, 'Verde');
    const corte = await api.post(`/api/ordens/${segunda.id}/corte-infesto`).send(
      corteBody({
        materia_prima_id: metro.id,
        cor: 'Verde',
        quantidade: 2,
        camadas: 3,
        metragem: 7.25,
        peso_real: 0.4,
      }),
    );
    expect(corte.status).toBe(201);
    expect(corte.body.quantidade_baixada).toBe(7.25);
    expect(await saldo(metro.id)).toBe(12.75);
  });

  it('usa a grade salva, corta por cor e só conclui a ordem quando não há saldo', async () => {
    const malha = await tecido({ nome: 'Malha grade' });
    const linha = await tecido({ nome: 'Linha da grade', tipo: 'linha' });
    await api.post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 20,
      materia_prima_id: malha.id,
    });
    await api.post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 5,
      materia_prima_id: linha.id,
    });
    const antiga = await api.post('/api/ordens').send({
      cliente: 'Loja Antiga',
      produto: 'Regata',
      tamanho: 'M',
      quantidade: 2,
      status: 'planejada',
    });
    expect(antiga.status).toBe(201);
    const semGrade = await api.post(`/api/ordens/${antiga.body.id}/corte-infesto`).send(
      corteBody({
        materia_prima_id: malha.id,
        cor: 'Preto',
        quantidade: 2,
        camadas: 2,
        metragem: 1,
        peso_real: 0.2,
      }),
    );
    expect(semGrade.status).toBe(400);
    expect(semGrade.body.erro).toBe('Esta OP não tem grade de cores e tamanhos');
    expect((await api.get(`/api/ordens/${antiga.body.id}`)).body.status).toBe('planejada');
    expect(await saldo(malha.id)).toBe(20);

    const criada = await api.post('/api/ordens').send({
      cliente: 'Loja Grade',
      produto: 'Camisa',
      quantidade: 10,
      status: 'planejada',
      requisitos: [
        { materia_prima_id: malha.id, quantidade: 0.4 },
        { materia_prima_id: linha.id, quantidade: 0.1 },
      ],
      grade: [
        { cor: 'Preto', tamanho: 'M', quantidade: 6 },
        { cor: 'Preto', tamanho: 'G', quantidade: 0 },
        { cor: 'Branco', tamanho: 'M', quantidade: 4 },
        { cor: 'Branco', tamanho: 'G', quantidade: 0 },
      ],
    });
    expect(criada.status).toBe(201);
    const op = criada.body as { id: number };
    await api.post('/api/etapas/fluxo').send({ ordem_id: op.id });

    const resumo = await api.get(`/api/ordens/${op.id}/corte-infesto`);
    expect(resumo.status).toBe(200);
    expect(resumo.body.concluido).toBe(false);
    expect(resumo.body.grade).toEqual([
      { cor: 'Preto', tamanho: 'M', quantidade: 6 },
      { cor: 'Preto', tamanho: 'G', quantidade: 0 },
      { cor: 'Branco', tamanho: 'M', quantidade: 4 },
      { cor: 'Branco', tamanho: 'G', quantidade: 0 },
    ]);
    expect(resumo.body.saldos).toEqual([
      { cor: 'Preto', tamanho: 'M', planejado: 6, cortado: 0, restante: 6 },
      { cor: 'Preto', tamanho: 'G', planejado: 0, cortado: 0, restante: 0 },
      { cor: 'Branco', tamanho: 'M', planejado: 4, cortado: 0, restante: 4 },
      { cor: 'Branco', tamanho: 'G', planejado: 0, cortado: 0, restante: 0 },
    ]);

    const acima = await api.post(`/api/ordens/${op.id}/corte-infesto`).send(
      corteBody({
        materia_prima_id: malha.id,
        cor: 'Preto',
        quantidade: 7,
        camadas: 8,
        metragem: 4,
        peso_real: 1.5,
      }),
    );
    expect(acima.status).toBe(409);
    expect(acima.body.erro).toContain('ultrapassa o planejado (6)');
    expect(await saldo(malha.id)).toBe(20);

    const parcial = await api.post(`/api/ordens/${op.id}/corte-infesto`).send(
      corteBody({
        materia_prima_id: malha.id,
        cor: 'preto',
        quantidade: 2,
        camadas: 8,
        metragem: 4,
        peso_real: 1.5,
        itens: [
          { tamanho: 'M', quantidade: 2 },
          { tamanho: 'G', quantidade: 0 },
        ],
      }),
    );
    expect(parcial.status).toBe(201);
    expect(parcial.body.cor).toBe('Preto');
    expect(parcial.body.avancou).toBe(false);
    expect(parcial.body.quantidade_pecas).toBe(2);
    expect(parcial.body.quantidade_baixada).toBe(1.5);
    expect(parcial.body.ordem.status).toBe('planejada');
    expect(await saldo(malha.id)).toBe(18.5);
    expect(await saldo(linha.id)).toBe(5);
    const etapasParciais = await api.get('/api/etapas').query({ ordem_id: op.id });
    expect(
      (etapasParciais.body.data as Array<{ tipo: string; status: string }>).find(
        (etapa) => etapa.tipo === 'corte',
      )?.status,
    ).toBe('pendente');

    const meio = await api.get(`/api/ordens/${op.id}/corte-infesto`);
    expect(meio.body.concluido).toBe(false);
    expect(meio.body.saldos[0]).toEqual({
      cor: 'Preto',
      tamanho: 'M',
      planejado: 6,
      cortado: 2,
      restante: 4,
    });

    const semAutorizacao = await api.post(`/api/ordens/${op.id}/corte-infesto`).send(
      corteBody({
        materia_prima_id: malha.id,
        cor: 'Preto',
        quantidade: 5,
        camadas: 4,
        metragem: 2,
        peso_real: 0.4,
      }),
    );
    expect(semAutorizacao.status).toBe(409);
    expect(await saldo(malha.id)).toBe(18.5);

    const autorizado = await api.post(`/api/ordens/${op.id}/corte-infesto`).send(
      corteBody({
        materia_prima_id: malha.id,
        cor: 'Preto',
        quantidade: 5,
        camadas: 4,
        metragem: 2,
        peso_real: 0.4,
        autorizar_excedente: true,
      }),
    );
    expect(autorizado.status).toBe(201);
    expect(autorizado.body.avancou).toBe(false);
    expect(autorizado.body.quantidade_baixada).toBe(0);
    expect(autorizado.body.ordem.status).toBe('planejada');
    expect(await saldo(malha.id)).toBe(18.5);
    expect(await saldo(linha.id)).toBe(5);

    const branco = await api.post(`/api/ordens/${op.id}/corte-infesto`).send(
      corteBody({
        materia_prima_id: malha.id,
        cor: 'Branco',
        quantidade: 4,
        camadas: 6,
        metragem: 3,
        peso_real: 0.8,
      }),
    );
    expect(branco.status).toBe(201);
    expect(branco.body.avancou).toBe(true);
    expect(branco.body.quantidade_baixada).toBe(0);
    expect(branco.body.ordem.status).toBe('costura');
    expect(await saldo(malha.id)).toBe(18.5);
    expect(await saldo(linha.id)).toBe(4);

    const fim = await api.get(`/api/ordens/${op.id}/corte-infesto`);
    expect(fim.body.concluido).toBe(true);
    expect(fim.body.saldos).toEqual([
      { cor: 'Preto', tamanho: 'M', planejado: 6, cortado: 7, restante: -1 },
      { cor: 'Preto', tamanho: 'G', planejado: 0, cortado: 0, restante: 0 },
      { cor: 'Branco', tamanho: 'M', planejado: 4, cortado: 4, restante: 0 },
      { cor: 'Branco', tamanho: 'G', planejado: 0, cortado: 0, restante: 0 },
    ]);
    const etapas = await api.get('/api/etapas').query({ ordem_id: op.id });
    const tipos = etapas.body.data as Array<{ tipo: string; status: string }>;
    expect(tipos.find((etapa) => etapa.tipo === 'corte')?.status).toBe('concluida');
    expect(tipos.find((etapa) => etapa.tipo === 'costura')?.status).toBe('em_andamento');

    const movimentos = await api.get('/api/estoque/movimentos');
    const saidasMalha = (
      movimentos.body.data as Array<{ tipo: string; quantidade: number; materia_prima_id?: number; motivo: string }>
    ).filter((item) => item.tipo === 'saida' && item.motivo.startsWith('Corte'));
    expect(saidasMalha).toHaveLength(1);
    expect(saidasMalha[0]?.quantidade).toBe(1.5);
  });

  it('exige só o consumo da unidade cadastrada e baixa KG ou metro', async () => {
    const quilo = await tecido({ nome: 'Malha quilo', unidade: 'KG' });
    const metro = await tecido({ nome: 'Tela importada', unidade: 'METRO' });
    const mt = await tecido({ nome: 'Tela cadastro', unidade: 'MT' });
    for (const materia of [quilo, metro, mt]) {
      const entrada = await api.post('/api/estoque/movimentos').send({
        tipo: 'entrada',
        quantidade: 10,
        materia_prima_id: materia.id,
      });
      expect(entrada.status).toBe(201);
    }

    const opQuilo = await ordem(4, 'Preto');
    const semPeso = await api.post(`/api/ordens/${opQuilo.id}/corte-infesto`).send(
      corteBody({
        materia_prima_id: quilo.id,
        cor: 'Preto',
        quantidade: 4,
        camadas: 3,
        metragem: 9,
      }),
    );
    expect(semPeso.status).toBe(400);
    expect(semPeso.body.erro).toBe('Informe o peso real consumido');
    expect(await saldo(quilo.id)).toBe(10);
    expect((await api.get(`/api/ordens/${opQuilo.id}`)).body.status).toBe('planejada');

    const corteQuilo = await api.post(`/api/ordens/${opQuilo.id}/corte-infesto`).send(
      corteBody({
        materia_prima_id: quilo.id,
        cor: 'Preto',
        quantidade: 4,
        camadas: 3,
        peso_real: 1.25,
      }),
    );
    expect(corteQuilo.status).toBe(201);
    expect(corteQuilo.body.peso_real).toBe(1.25);
    expect(corteQuilo.body.metragem).toBe(0);
    expect(corteQuilo.body.quantidade_baixada).toBe(1.25);
    expect(corteQuilo.body.unidade_baixa).toBe('KG');
    expect(await saldo(quilo.id)).toBe(8.75);

    const opMetro = await ordem(3, 'Azul');
    const semMetragem = await api.post(`/api/ordens/${opMetro.id}/corte-infesto`).send(
      corteBody({
        materia_prima_id: metro.id,
        cor: 'Azul',
        quantidade: 3,
        camadas: 2,
        peso_real: 0.8,
      }),
    );
    expect(semMetragem.status).toBe(400);
    expect(semMetragem.body.erro).toBe('Informe a metragem consumida');
    expect(await saldo(metro.id)).toBe(10);

    const corteMetro = await api.post(`/api/ordens/${opMetro.id}/corte-infesto`).send(
      corteBody({
        materia_prima_id: metro.id,
        cor: 'Azul',
        quantidade: 3,
        camadas: 2,
        metragem: 4.5,
      }),
    );
    expect(corteMetro.status).toBe(201);
    expect(corteMetro.body.metragem).toBe(4.5);
    expect(corteMetro.body.peso_real).toBe(0);
    expect(corteMetro.body.quantidade_baixada).toBe(4.5);
    expect(corteMetro.body.unidade_baixa).toBe('METRO');
    expect(await saldo(metro.id)).toBe(5.5);
    const movimentos = await api.get('/api/estoque/movimentos');
    const saidaMetro = (
      movimentos.body.data as Array<{ tipo: string; quantidade: number; motivo: string; observacoes: string | null }>
    ).find((item) => item.tipo === 'saida' && item.motivo.includes(opMetro.codigo));
    expect(saidaMetro?.quantidade).toBe(4.5);
    expect(saidaMetro?.observacoes).toContain('4.5 METRO');

    const opMt = await ordem(2, 'Verde');
    const corteMt = await api.post(`/api/ordens/${opMt.id}/corte-infesto`).send(
      corteBody({
        materia_prima_id: mt.id,
        cor: 'Verde',
        quantidade: 2,
        camadas: 5,
        metragem: 3,
      }),
    );
    expect(corteMt.status).toBe(201);
    expect(corteMt.body.quantidade_baixada).toBe(3);
    expect(corteMt.body.peso_real).toBe(0);
    expect(corteMt.body.unidade_baixa).toBe('MT');
    expect(await saldo(mt.id)).toBe(7);
  });

  it('usa o saldo da compra confirmada e recusa corte sem estoque', async () => {
    const malha = await tecido({ nome: 'Malha nota', unidade: 'KG' });
    const fornecedor = await api.post('/api/fornecedores').send({
      nome: 'Malharia Corte',
      cidade: 'Brusque',
      estado: 'SC',
    });
    expect(fornecedor.status).toBe(201);
    const op = await ordem(6, 'Preto');
    const semSaldo = await api.post(`/api/ordens/${op.id}/corte-infesto`).send(
      corteBody({
        materia_prima_id: malha.id,
        cor: 'Preto',
        quantidade: 6,
        camadas: 4,
        peso_real: 2,
      }),
    );
    expect(semSaldo.status).toBe(409);
    expect(semSaldo.body.erro).toBe('Estoque insuficiente para a saída');

    const compra = await api.post('/api/compras').send({
      fornecedor_id: fornecedor.body.id,
      confirmar: true,
      itens: [
        {
          materia_prima_id: malha.id,
          quantidade: 5,
          custo_unitario: 18,
          unidade: 'KG',
          cor: 'Preto',
        },
      ],
    });
    expect(compra.status).toBe(201);
    expect(compra.body.status).toBe('recebida');
    expect(await saldo(malha.id)).toBe(5);

    const acima = await api.post(`/api/ordens/${op.id}/corte-infesto`).send(
      corteBody({
        materia_prima_id: malha.id,
        cor: 'Preto',
        quantidade: 6,
        camadas: 4,
        peso_real: 8,
      }),
    );
    expect(acima.status).toBe(409);
    expect(acima.body.erro).toBe('Estoque insuficiente para a saída');
    expect(await saldo(malha.id)).toBe(5);

    const corte = await api.post(`/api/ordens/${op.id}/corte-infesto`).send(
      corteBody({
        materia_prima_id: malha.id,
        cor: 'Preto',
        quantidade: 6,
        camadas: 4,
        peso_real: 2,
      }),
    );
    expect(corte.status).toBe(201);
    expect(corte.body.quantidade_baixada).toBe(2);
    expect(await saldo(malha.id)).toBe(3);
  });
});
