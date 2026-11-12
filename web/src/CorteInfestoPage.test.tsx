import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    listarFilaEnfestoCorte: vi.fn(),
    listarCortesInfesto: vi.fn(),
    listarMateriasPrimas: vi.fn(),
    atualizarOrdemCorte: vi.fn(),
    concluirCorteInfesto: vi.fn(),
    registrarApontamentoOrdemCorte: vi.fn(),
    obterResumoCorteInfesto: vi.fn(),
    listarHistoricoOrdemCorte: vi.fn(),
    confirmarCorOrdemCorte: vi.fn(),
  };
});

import {
  atualizarOrdemCorte,
  concluirCorteInfesto,
  confirmarCorOrdemCorte,
  listarCortesInfesto,
  listarFilaEnfestoCorte,
  listarHistoricoOrdemCorte,
  listarMateriasPrimas,
  obterResumoCorteInfesto,
  registrarApontamentoOrdemCorte,
  type CorteInfesto,
  type OrdemCorte,
  type OrdemCorteHistorico,
} from './api';
import { CorteInfestoPage } from './CorteInfestoPage';

const fila = vi.mocked(listarFilaEnfestoCorte);
const cortes = vi.mocked(listarCortesInfesto);
const materias = vi.mocked(listarMateriasPrimas);
const atualizar = vi.mocked(atualizarOrdemCorte);
const concluir = vi.mocked(concluirCorteInfesto);
const apontar = vi.mocked(registrarApontamentoOrdemCorte);
const resumo = vi.mocked(obterResumoCorteInfesto);
const historicoFicha = vi.mocked(listarHistoricoOrdemCorte);
const confirmarCor = vi.mocked(confirmarCorOrdemCorte);

let historicoConfirmacoes: OrdemCorteHistorico[] = [];

async function confirmarCores() {
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar PRETO' }));
  expect(await screen.findByLabelText('Status Preto')).toHaveProperty('textContent', 'Status: PRETO OK');
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar BRANCO' }));
  expect(await screen.findByLabelText('Status Branco')).toHaveProperty('textContent', 'Status: BRANCO OK');
}

function preencherPeso(cor: string, peso: string) {
  fireEvent.change(screen.getByLabelText(`Peso por folha ${cor}`), { target: { value: peso } });
}

function chave(cor: string, tamanho: string) {
  return `${cor}|${tamanho}`;
}

async function resumoDaFicha(ordemId: number) {
  const fichas = await fila();
  const ficha = fichas.find((item) => item.ordem_id === ordemId) ?? fichas[0];
  const execucoes = ((await cortes()) as CorteInfesto[]).filter((item) => item.ordem_id === ordemId);
  const mapa: Record<string, number> = {};
  for (const execucao of execucoes) {
    for (const item of execucao.itens ?? []) {
      const id = chave(item.cor, item.tamanho);
      mapa[id] = (mapa[id] ?? 0) + item.quantidade;
    }
  }
  return {
    grade: ficha.grade,
    execucoes,
    saldos: ficha.grade.map((celula) => ({
      cor: celula.cor,
      tamanho: celula.tamanho,
      planejado: celula.quantidade,
      cortado: mapa[chave(celula.cor, celula.tamanho)] ?? 0,
      restante: celula.quantidade - (mapa[chave(celula.cor, celula.tamanho)] ?? 0),
    })),
    concluido: false,
  };
}

const fichaFila: OrdemCorte = {
  id: 1,
  codigo: 'OC-01',
  ordem_id: 4,
  cliente: 'Loja Norte',
  produto: 'Bermuda',
  quantidade: 6,
  prioridade: 'normal',
  data_prevista: null,
  responsavel: null,
  observacoes: null,
  cliente_id: null,
  produto_id: null,
  criado_em: '',
  modelo: 'Bermuda',
  composicao: 'Malha dry',
  referencia: 'BER-01',
  status_processo: 'aguardando_enfesto',
  ordem_codigo: 'OP-0004',
  ordem_status: 'planejada',
  tecido_nome: 'Malha dry',
  tecido_unidade: 'KG',
  materia_prima_id: 2,
  enviado_enfesto_em: '2026-11-07 12:00:00',
  enviado_por_nome: 'Marcos',
  tamanhos: ['M', 'G'],
  linhas: [
    { cor: 'Preto', detalhes: '' },
    { cor: 'Branco', detalhes: '' },
  ],
  aviamentos: [],
  oficinas: [],
  materiais: [],
  grade: [
    { cor: 'Preto', tamanho: 'P', quantidade: 0 },
    { cor: 'Preto', tamanho: 'M', quantidade: 3 },
    { cor: 'Preto', tamanho: 'G', quantidade: 1 },
    { cor: 'Preto', tamanho: 'GG', quantidade: 0 },
    { cor: 'Preto', tamanho: 'XG', quantidade: 0 },
    { cor: 'Branco', tamanho: 'P', quantidade: 0 },
    { cor: 'Branco', tamanho: 'M', quantidade: 2 },
    { cor: 'Branco', tamanho: 'G', quantidade: 0 },
    { cor: 'Branco', tamanho: 'GG', quantidade: 0 },
    { cor: 'Branco', tamanho: 'XG', quantidade: 0 },
  ],
};

const tecidoMalha = {
  id: 2,
  codigo: 'MALHA',
  nome: 'Malha dry',
  descricao: null,
  tipo: 'tecido' as const,
  categoria: null,
  cor: 'Preto',
  composicao: 'Malha dry 100%',
  largura_cm: 160,
  gramatura: 180,
  unidade: 'KG',
  custo: 0,
  estoque_minimo: 0,
  estoque_atual: 100,
  fornecedor: null,
  referencia_fornecedor: null,
  ncm: null,
  status: 'ativo' as const,
  observacoes: null,
  criado_em: '',
  atualizado_em: '',
};

describe('tela Enfesto e Corte', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    concluir.mockReset();
    apontar.mockReset();
    atualizar.mockReset();
    confirmarCor.mockReset();
    atualizar.mockImplementation(async (_id, dados) => ({ ...fichaFila, ...dados }));
    apontar.mockImplementation(async (_id, dados) => ({
      ...fichaFila,
      status_processo:
        dados.acao === 'iniciar_enfesto' ? 'em_enfesto' : dados.acao === 'iniciar_corte' ? 'em_corte' : 'corte_concluido',
    }));
    concluir.mockResolvedValue({ id: 1, ordem_id: 4, cor: 'Preto', avancou: false });
    fila.mockResolvedValue([fichaFila]);
    cortes.mockResolvedValue([]);
    resumo.mockImplementation(resumoDaFicha);
    historicoConfirmacoes = [];
    historicoFicha.mockImplementation(async () => historicoConfirmacoes);
    confirmarCor.mockImplementation(async (_id, cor) => {
      historicoConfirmacoes = [
        {
          id: historicoConfirmacoes.length + 1,
          usuario_id: 1,
          usuario_nome: 'Marcos',
          acao: 'confirmar_cor',
          resumo: `${cor} OK`,
          payload: { cor },
          criado_em: '2026-11-08 17:40:00',
        },
        ...historicoConfirmacoes,
      ];
      return historicoConfirmacoes;
    });
    materias.mockResolvedValue({
      data: [tecidoMalha],
      pagina: 1,
      por_pagina: 100,
      total: 1,
      total_paginas: 1,
    });
  });

  it('lista a ficha recebida, abre os dados salvos e oferece o PDF daquela OC', async () => {
    render(<CorteInfestoPage />);
    expect(await screen.findByText('OC-01')).toBeTruthy();
    expect(screen.getByText('OP-0004')).toBeTruthy();
    expect(screen.getByText('Aguardando enfesto e corte')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir ficha' }));
    expect(await screen.findByText(/REF BER-01/)).toBeTruthy();
    expect(screen.getAllByText('Malha dry').length).toBeGreaterThan(0);
    expect((screen.getByRole('link', { name: 'BAIXAR PDF DA FICHA' }) as HTMLAnchorElement).getAttribute('href')).toBe(
      '/api/ordens/4/ordem-corte/pdf',
    );
    expect(screen.getByLabelText('Cores do enfesto')).toBeTruthy();
    expect(screen.getByLabelText('Status Preto').textContent).toBe('Status: PENDENTE');
    expect(screen.getByRole('button', { name: 'Confirmar PRETO' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'FINALIZAR ENFESTO' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Registrar corte da cor' })).toBeNull();
    expect(screen.queryByLabelText('Número do rolo')).toBeNull();
  });

  it('separa fichas pendentes e finalizadas nos dois indicadores, sem duplicar', async () => {
    fila.mockResolvedValue([
      fichaFila,
      { ...fichaFila, id: 2, codigo: 'OC-02', ordem_id: 5, ordem_codigo: 'OP-0005', status_processo: 'em_corte' },
      { ...fichaFila, id: 3, codigo: 'OC-03', ordem_id: 6, ordem_codigo: 'OP-0006', status_processo: 'corte_concluido' },
      { ...fichaFila, id: 4, codigo: 'OC-04', ordem_id: 7, ordem_codigo: 'OP-0007', status_processo: 'encaminhado' },
      { ...fichaFila, id: 5, codigo: 'OC-01', ordem_id: 4, ordem_codigo: 'OP-0004', status_processo: 'aguardando_enfesto' },
    ]);
    render(<CorteInfestoPage />);
    expect(await screen.findByText('OC-01')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enfesto e corte' }).querySelector('.kpi__valor')?.textContent).toBe('2');
    expect(screen.getByRole('button', { name: 'Finalizados' }).querySelector('.kpi__valor')?.textContent).toBe('2');
    expect(screen.getByText('OC-02')).toBeTruthy();
    expect(screen.queryByText('OC-03')).toBeNull();
    expect(screen.queryByText('OC-04')).toBeNull();
    expect(screen.getAllByText('OC-01')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Finalizados' }));
    expect(await screen.findByText('OC-03')).toBeTruthy();
    expect(screen.getByText('OC-04')).toBeTruthy();
    expect(screen.queryByText('OC-01')).toBeNull();
    expect(screen.queryByText('OC-02')).toBeNull();
    expect(screen.queryByRole('tab', { name: /Liberar fichas/i })).toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: 'Abrir ficha' })[0]);
    expect(await screen.findByRole('link', { name: 'BAIXAR PDF DA FICHA' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'FINALIZAR ENFESTO' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Enfesto e corte' }));
    expect(await screen.findByText('OC-01')).toBeTruthy();
    expect(screen.queryByText('OC-03')).toBeNull();
    expect(screen.queryByRole('link', { name: 'BAIXAR PDF DA FICHA' })).toBeNull();
  });

  it('mostra cada cor no formato da ficha e finaliza todas de uma vez', async () => {
    render(<CorteInfestoPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir ficha' }));
    await screen.findByLabelText('Cores do enfesto');

    expect(screen.getByRole('heading', { name: 'PRETO' })).toBeTruthy();
    expect(screen.getByLabelText('Preto M')).toHaveProperty('value', '3');
    expect(screen.getByLabelText('Preto G')).toHaveProperty('value', '1');
    expect(screen.getByLabelText('Total da cor Preto').textContent).toBe('Total: 4 peças');
    expect(screen.getByLabelText('Status Preto').textContent).toBe('Status: PENDENTE');
    expect(screen.getByRole('heading', { name: 'BRANCO' })).toBeTruthy();
    expect(screen.getByLabelText('Branco M')).toHaveProperty('value', '2');
    expect(screen.getByLabelText('Total da cor Branco').textContent).toBe('Total: 2 peças');
    expect(screen.getByLabelText('Status Branco').textContent).toBe('Status: PENDENTE');
    expect(screen.queryByLabelText('Preto P')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Registrar corte da cor' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Registrar início do enfesto' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Concluir corte' })).toBeNull();

    fireEvent.change(screen.getByLabelText('Preto M'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Preto G'), { target: { value: '20' } });
    expect(screen.getByLabelText('Total da cor Preto').textContent).toBe('Total: 30 peças');
    expect(screen.getByLabelText('Camadas Preto')).toHaveProperty('value', '10');
    expect(screen.getByLabelText('Camadas Branco')).toHaveProperty('value', '2');
    expect(screen.queryByLabelText('Peso real consumido')).toBeNull();
    expect(screen.queryByLabelText('Camadas do enfesto')).toBeNull();
    expect(screen.queryByLabelText('Metragem do risco')).toBeNull();
    expect(screen.getByLabelText('Cálculo de consumo')).toBeTruthy();
    expect((screen.getByLabelText('Nome do tecido') as HTMLInputElement).value).toBe('Malha dry');
    expect((screen.getByLabelText('Largura do tecido') as HTMLInputElement).value).toBe('160');
    expect((screen.getByLabelText('Gramatura do tecido') as HTMLInputElement).value).toBe('180');
    preencherPeso('Preto', '1,200');
    preencherPeso('Branco', '0,8');
    expect(screen.getByLabelText('Consumo total Preto').textContent).toBe('Consumo total: 12 KG');
    expect(screen.getByLabelText('Consumo total Branco').textContent).toBe('Consumo total: 1,6 KG');
    expect(screen.getByLabelText('Status Preto').textContent).toBe('Status: PENDENTE');
    await confirmarCores();
    expect(screen.getByLabelText('Confirmação Preto').textContent).toMatch(/Marcos/);
    expect(screen.getByLabelText('Confirmação Branco').textContent).toMatch(/Marcos/);
    fireEvent.click(screen.getByRole('button', { name: 'FINALIZAR ENFESTO' }));

    await waitFor(() => expect(apontar).toHaveBeenCalledWith(4, { acao: 'iniciar_enfesto' }));
    expect(apontar).toHaveBeenCalledWith(4, { acao: 'iniciar_corte' });
    expect(concluir).toHaveBeenCalledWith(4, {
      materia_prima_id: 2,
      cor: 'Preto',
      camadas: 10,
      peso_folha: 1.2,
      peso_real: 12,
      itens: [
        { tamanho: 'M', quantidade: 10 },
        { tamanho: 'G', quantidade: 20 },
      ],
    });
    expect(concluir).toHaveBeenCalledWith(4, {
      materia_prima_id: 2,
      cor: 'Branco',
      camadas: 2,
      peso_folha: 0.8,
      peso_real: 1.6,
      itens: [{ tamanho: 'M', quantidade: 2 }],
    });
    expect(apontar).toHaveBeenCalledWith(
      4,
      expect.objectContaining({
        acao: 'concluir_corte',
        materia_prima_id: 2,
        quantidade_cortada: 32,
        consumo_real: 13.6,
        consumos_cores: expect.arrayContaining([
          expect.objectContaining({ cor: 'Preto', camadas: 10, peso_folha: 1.2, consumo_total: 12 }),
          expect.objectContaining({ cor: 'Branco', camadas: 2, peso_folha: 0.8, consumo_total: 1.6 }),
        ]),
      }),
    );
  });

  it('pede autorização explícita para cortar acima do planejado', async () => {
    render(<CorteInfestoPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir ficha' }));
    await screen.findByLabelText('Cores do enfesto');
    fireEvent.change(screen.getByLabelText('Preto M'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'FINALIZAR ENFESTO' }));

    expect(await screen.findByText(/ultrapassa o planejado/)).toBeTruthy();
    expect(concluir).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Autorizar quantidade acima do planejado' }));
    await confirmarCores();
    preencherPeso('Preto', '1,2');
    preencherPeso('Branco', '0,8');
    fireEvent.click(screen.getByRole('button', { name: 'FINALIZAR ENFESTO' }));
    await waitFor(() =>
      expect(concluir).toHaveBeenCalledWith(
        4,
        expect.objectContaining({
          cor: 'Preto',
          autorizar_excedente: true,
          itens: [
            { tamanho: 'M', quantidade: 9 },
            { tamanho: 'G', quantidade: 1 },
          ],
        }),
      ),
    );
  });

  it('pede a metragem e dispensa o peso quando o tecido é controlado em metros', async () => {
    materias.mockResolvedValue({
      data: [
        {
          ...tecidoMalha,
          id: 8,
          codigo: 'TELA',
          nome: 'Tela metro',
          unidade: 'MT',
        },
      ],
      pagina: 1,
      por_pagina: 100,
      total: 1,
      total_paginas: 1,
    });
    fila.mockResolvedValue([{ ...fichaFila, materia_prima_id: 8, tecido_nome: 'Tela metro', tecido_unidade: 'MT' }]);
    render(<CorteInfestoPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir ficha' }));
    await screen.findByLabelText('Cores do enfesto');
    expect(screen.queryByLabelText('Peso real consumido')).toBeNull();
    expect(screen.getByText(/Tecido controlado em MT/)).toBeTruthy();
    expect(screen.getByLabelText('Camadas Preto')).toHaveProperty('value', '1');
    fireEvent.change(screen.getByLabelText('Camadas Preto'), { target: { value: '6' } });
    preencherPeso('Preto', '4,5');
    preencherPeso('Branco', '1');
    expect(screen.getByLabelText('Consumo total Preto').textContent).toBe('Consumo total: 27 MT');
    await confirmarCores();
    fireEvent.click(screen.getByRole('button', { name: 'FINALIZAR ENFESTO' }));
    await waitFor(() =>
      expect(concluir).toHaveBeenCalledWith(
        4,
        expect.objectContaining({
          materia_prima_id: 8,
          cor: 'Preto',
          camadas: 6,
          peso_folha: 4.5,
          peso_real: 27,
        }),
      ),
    );
    expect((screen.getByLabelText('Nome do tecido') as HTMLInputElement).value).toBe('Tela metro');
    expect((screen.getByLabelText('Unidade de controle do tecido') as HTMLSelectElement).value).toBe('MT');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('informa largura e gramatura faltantes no cadastro em KG', async () => {
    materias.mockResolvedValue({
      data: [{ ...tecidoMalha, largura_cm: null, gramatura: null }],
      pagina: 1,
      por_pagina: 100,
      total: 1,
      total_paginas: 1,
    });
    render(<CorteInfestoPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir ficha' }));
    await screen.findByLabelText('Cores do enfesto');
    expect(screen.queryByLabelText('Metragem do risco')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Falta largura e gramatura no cadastro do tecido');
    preencherPeso('Preto', '1,2');
    expect(screen.getByLabelText('Consumo total Preto').textContent).toBe('Consumo total: 1,2 KG');
  });

  it('permite editar cor, largura 1.60 e gramatura só na ficha e grava no autosave', async () => {
    render(<CorteInfestoPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir ficha' }));
    await screen.findByLabelText('Cores do enfesto');

    const cor = screen.getByLabelText('Cor do tecido') as HTMLInputElement;
    const largura = screen.getByLabelText('Largura do tecido') as HTMLInputElement;
    const gramatura = screen.getByLabelText('Gramatura do tecido') as HTMLInputElement;
    expect(cor.readOnly).toBe(false);
    expect(largura.readOnly).toBe(false);
    expect(gramatura.readOnly).toBe(false);
    expect(screen.queryByLabelText('Número do rolo')).toBeNull();

    fireEvent.change(cor, { target: { value: 'Verde bandeira' } });
    fireEvent.change(screen.getByLabelText('Unidade da largura'), { target: { value: 'm' } });
    fireEvent.focus(largura);
    fireEvent.change(largura, { target: { value: '1.60' } });
    expect(largura.value).toBe('1.60');
    fireEvent.blur(largura);
    fireEvent.focus(gramatura);
    fireEvent.change(gramatura, { target: { value: '180,5' } });

    expect(cor.value).toBe('Verde bandeira');
    expect(largura.value).toBe('1,60');
    expect(gramatura.value).toBe('180,5');

    await waitFor(() => expect(atualizar).toHaveBeenCalled(), { timeout: 3000 });
    const payload = atualizar.mock.calls.at(-1)?.[1];
    expect(payload?.tecido_cor).toBe('Verde bandeira');
    expect(payload?.tecido_largura_cm).toBe(1.6);
    expect(payload?.tecido_largura_unidade).toBe('m');
    expect(payload?.tecido_gramatura).toBe(180.5);
    expect(payload?.tecido_nome).toBe('Malha dry');
  });

  it('aceita largura 1,60 e 160 cm e mantém os valores ao reabrir a ficha', async () => {
    render(<CorteInfestoPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir ficha' }));
    await screen.findByLabelText('Cores do enfesto');
    fireEvent.change(screen.getByLabelText('Unidade da largura'), { target: { value: 'm' } });
    fireEvent.change(screen.getByLabelText('Largura do tecido'), { target: { value: '1,60' } });
    expect((screen.getByLabelText('Largura do tecido') as HTMLInputElement).value).toBe('1,60');
    await waitFor(() => expect(atualizar.mock.calls.at(-1)?.[1]?.tecido_largura_cm).toBe(1.6), { timeout: 3000 });

    cleanup();
    fila.mockResolvedValue([
      {
        ...fichaFila,
        tecido_cor: 'Verde bandeira',
        tecido_largura_cm: 1.6,
        tecido_largura_unidade: 'm',
        tecido_gramatura: 180.5,
        tecido_numero_rolo: 'R-12A',
      },
    ]);
    render(<CorteInfestoPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir ficha' }));
    await screen.findByLabelText('Cores do enfesto');
    expect((screen.getByLabelText('Cor do tecido') as HTMLInputElement).value).toBe('Verde bandeira');
    expect((screen.getByLabelText('Largura do tecido') as HTMLInputElement).value).toBe('1,60');
    expect((screen.getByLabelText('Unidade da largura') as HTMLSelectElement).value).toBe('m');
    expect((screen.getByLabelText('Gramatura do tecido') as HTMLInputElement).value).toBe('180,5');
    expect(screen.queryByLabelText('Número do rolo')).toBeNull();
  });

  it('preenche os dados do cadastro ao selecionar o tecido, sem alterar o material original', async () => {
    const telaNota = {
      ...tecidoMalha,
      id: 9,
      codigo: 'TELA-NF',
      nome: 'Tela NF',
      cor: 'Azul',
      composicao: null,
      largura_cm: null,
      gramatura: null,
      descricao: 'Tela largura 160 cm gramatura 180 g/m² 100% poliéster',
      unidade: 'KG',
    };
    materias.mockResolvedValue({
      data: [tecidoMalha, telaNota],
      pagina: 1,
      por_pagina: 100,
      total: 2,
      total_paginas: 1,
    });
    render(<CorteInfestoPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir ficha' }));
    await screen.findByLabelText('Cores do enfesto');
    fireEvent.change(screen.getByLabelText('Tecido'), { target: { value: '9' } });
    expect((screen.getByLabelText('Nome do tecido') as HTMLInputElement).value).toBe('Tela NF');
    expect((screen.getByLabelText('Cor do tecido') as HTMLInputElement).value).toBe('Azul');
    expect((screen.getByLabelText('Largura do tecido') as HTMLInputElement).value).toBe('160');
    expect((screen.getByLabelText('Gramatura do tecido') as HTMLInputElement).value).toBe('180');
    expect((screen.getByLabelText('Composição do tecido') as HTMLTextAreaElement).value).toContain('100% poliéster');
    await waitFor(() => expect(atualizar).toHaveBeenCalled(), { timeout: 3000 });
    expect(atualizar.mock.calls.at(-1)?.[1]?.materia_prima_id).toBe(9);
    expect(atualizar.mock.calls.at(-1)?.[1]?.tecido_largura_cm).toBe(160);
  });

  it('informa quando a ordem não tem grade e não inventa tamanhos', async () => {
    fila.mockResolvedValue([{ ...fichaFila, grade: [], linhas: [] }]);
    render(<CorteInfestoPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir ficha' }));
    expect(await screen.findByText(/não tem grade de cores e tamanhos/)).toBeTruthy();
    expect(screen.queryByLabelText('Cores do enfesto')).toBeNull();
    expect(screen.queryByRole('button', { name: 'FINALIZAR ENFESTO' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Registrar corte da cor' })).toBeNull();
    expect(concluir).not.toHaveBeenCalled();
  });

  it('não confirma a cor pelo preenchimento da quantidade; o clique registra data e responsável', async () => {
    render(<CorteInfestoPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir ficha' }));
    await screen.findByLabelText('Cores do enfesto');
    fireEvent.change(screen.getByLabelText('Preto M'), { target: { value: '3' } });
    expect(screen.getByLabelText('Status Preto').textContent).toBe('Status: PENDENTE');
    expect(screen.getByLabelText('Status Branco').textContent).toBe('Status: PENDENTE');

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar PRETO' }));
    expect(await screen.findByLabelText('Status Preto')).toHaveProperty('textContent', 'Status: PRETO OK');
    expect(screen.getByLabelText('Confirmação Preto').textContent).toMatch(/08\/11\/2026/);
    expect(screen.getByLabelText('Confirmação Preto').textContent).toMatch(/Marcos/);
    expect(screen.getByLabelText('Status Branco').textContent).toBe('Status: PENDENTE');
    expect(confirmarCor).toHaveBeenCalledWith(4, 'Preto');
    expect(screen.getByRole('button', { name: 'FINALIZAR ENFESTO' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirmar PRETO' })).toBeNull();
  });

  it('só finaliza o enfesto depois de confirmar todas as cores', async () => {
    render(<CorteInfestoPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir ficha' }));
    await screen.findByLabelText('Cores do enfesto');
    fireEvent.click(screen.getByRole('button', { name: 'FINALIZAR ENFESTO' }));
    expect(await screen.findByText(/Confirme a conferência das cores/)).toBeTruthy();
    expect(concluir).not.toHaveBeenCalled();
    await confirmarCores();
    preencherPeso('Preto', '1,2');
    preencherPeso('Branco', '0,8');
    fireEvent.click(screen.getByRole('button', { name: 'FINALIZAR ENFESTO' }));
    await waitFor(() => expect(concluir).toHaveBeenCalled());
  });

  it('mostra a composição integral 48% algodão e 52% poliéster sem truncar', async () => {
    materias.mockResolvedValue({
      data: [
        {
          ...tecidoMalha,
          composicao: '48% algodão',
          descricao: 'Malha 48% algodão, 52% poliéster largura 160 cm gramatura 180 g/m²',
        },
      ],
      pagina: 1,
      por_pagina: 100,
      total: 1,
      total_paginas: 1,
    });
    fila.mockResolvedValue([{ ...fichaFila, tecido_composicao: '48% algodão' }]);
    render(<CorteInfestoPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir ficha' }));
    await screen.findByLabelText('Cores do enfesto');
    const composicao = screen.getByLabelText('Composição do tecido') as HTMLTextAreaElement;
    expect(composicao.tagName).toBe('TEXTAREA');
    expect(composicao.value).toBe('48% algodão e 52% poliéster');
    expect(screen.getAllByText('48% algodão e 52% poliéster').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Número do rolo')).toBeNull();
  });

  it('alerta estoque insuficiente, pede confirmação e finaliza o enfesto mesmo assim', async () => {
    materias.mockResolvedValue({
      data: [{ ...tecidoMalha, estoque_atual: 1 }],
      pagina: 1,
      por_pagina: 100,
      total: 1,
      total_paginas: 1,
    });
    render(<CorteInfestoPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir ficha' }));
    await screen.findByLabelText('Cores do enfesto');
    preencherPeso('Preto', '1,2');
    preencherPeso('Branco', '0,8');
    await confirmarCores();
    fireEvent.click(screen.getByRole('button', { name: 'FINALIZAR ENFESTO' }));

    expect((await screen.findAllByText(/Estoque insuficiente para a saída/)).length).toBeGreaterThan(0);
    expect(apontar).not.toHaveBeenCalled();
    expect(concluir).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Confirmar finalização com estoque insuficiente' }));
    fireEvent.click(screen.getByRole('button', { name: 'FINALIZAR ENFESTO' }));
    await waitFor(() => expect(apontar).toHaveBeenCalledWith(4, { acao: 'iniciar_enfesto' }));
    expect(apontar).toHaveBeenCalledWith(
      4,
      expect.objectContaining({
        acao: 'concluir_corte',
        materia_prima_id: 2,
        consumo_real: 2.8,
      }),
    );
  });
});
