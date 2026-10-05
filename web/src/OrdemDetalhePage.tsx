import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PRIORIDADE_OP_LABEL,
  STATUS_ETAPA_LABEL,
  STATUS_OP_LABEL,
  TIPOS_ETAPA,
  atualizarEtapa,
  gerarFluxoEtapas,
  listarEtapas,
  obterOrdem,
  obterProduto,
  type EtapaProducao,
  type OrdemProducao,
  type StatusEtapa,
  type TipoEtapa,
} from './api';
import { TabelaDistribuicao } from './DistribuicaoCorte';

type Props = {
  ordemId: number;
  onVoltar: () => void;
};

const FLUXO_LABEL: Record<TipoEtapa, string> = {
  corte: 'Corte',
  costura: 'Costura',
  acabamento: 'Acabamento',
  qualidade: 'Qualidade',
  embalagem: 'Embalagem',
};

function formatarData(valor: string | null): string {
  if (!valor) return '—';
  const d = valor.slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return valor;
  return `${day}/${m}/${y}`;
}

function formatarQuando(valor: string | null): string {
  if (!valor) return '—';
  const [data, hora] = valor.split(' ');
  const [y, m, d] = (data ?? '').split('-');
  if (!y || !m || !d) return valor;
  return `${d}/${m}/${y}${hora ? ` ${hora.slice(0, 5)}` : ''}`;
}

function progressoEtapa(status: StatusEtapa | 'ausente'): number {
  if (status === 'concluida') return 100;
  if (status === 'em_andamento') return 50;
  return 0;
}

export function OrdemDetalhePage({ ordemId, onVoltar }: Props) {
  const [ordem, setOrdem] = useState<OrdemProducao | null>(null);
  const [etapas, setEtapas] = useState<EtapaProducao[]>([]);
  const [variante, setVariante] = useState<string>('—');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [atualizandoId, setAtualizandoId] = useState<number | null>(null);
  const [operadores, setOperadores] = useState<Record<number, string>>({});
  const [eixosProduto, setEixosProduto] = useState<{ cores: string[]; tamanhos: string[] }>({
    cores: [],
    tamanhos: [],
  });

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [op, fluxo] = await Promise.all([
        obterOrdem(ordemId),
        listarEtapas({ ordem_id: ordemId, por_pagina: 20, pagina: 1 }),
      ]);
      setOrdem(op);
      setEtapas(fluxo.data);
      const mapa: Record<number, string> = {};
      for (const e of fluxo.data) mapa[e.id] = e.responsavel ?? '';
      setOperadores(mapa);

      if (op.produto_id) {
        try {
          const produto = await obterProduto(op.produto_id);
          setEixosProduto({ cores: produto.cores, tamanhos: produto.tamanhos });
          if (!op.distribuicao?.length && op.variante_id) {
            const v = produto.variantes.find((item) => item.id === op.variante_id);
            setVariante(v ? `${v.cor} / ${v.tamanho}` : op.tamanho);
          }
        } catch {
          setEixosProduto({ cores: [], tamanhos: [] });
          if (!op.distribuicao?.length) setVariante(op.tamanho);
        }
      } else {
        setEixosProduto({ cores: [], tamanhos: [] });
      }

      if (op.distribuicao?.length) {
        const cores: string[] = [];
        for (const item of op.distribuicao) {
          if (item.quantidade <= 0) continue;
          if (!cores.some((cor) => cor.trim().toLowerCase() === item.cor.trim().toLowerCase())) {
            cores.push(item.cor);
          }
        }
        setVariante(cores.join(', ') || '—');
      } else if (!op.produto_id || !op.variante_id) {
        setVariante(op.tamanho || '—');
      }
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [ordemId]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const passos = useMemo(() => {
    return TIPOS_ETAPA.map((tipo, indice) => {
      const etapa = etapas.find((e) => e.tipo === tipo) ?? null;
      return { tipo, indice, etapa };
    });
  }, [etapas]);

  const progressoGeral = useMemo(() => {
    if (passos.every((p) => !p.etapa)) return 0;
    const soma = passos.reduce(
      (acc, p) => acc + progressoEtapa(p.etapa?.status ?? 'ausente'),
      0,
    );
    return Math.round(soma / passos.length);
  }, [passos]);

  async function handleFluxo() {
    try {
      setGerando(true);
      await gerarFluxoEtapas(ordemId);
      setErro(null);
      await recarregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setGerando(false);
    }
  }

  async function handleStatus(etapa: EtapaProducao, status: StatusEtapa) {
    try {
      setAtualizandoId(etapa.id);
      await atualizarEtapa(etapa.id, {
        status,
        responsavel: operadores[etapa.id]?.trim() || undefined,
      });
      setErro(null);
      await recarregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setAtualizandoId(null);
    }
  }

  async function handleOperador(etapa: EtapaProducao) {
    try {
      setAtualizandoId(etapa.id);
      await atualizarEtapa(etapa.id, {
        responsavel: operadores[etapa.id]?.trim() || undefined,
      });
      setErro(null);
      await recarregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setAtualizandoId(null);
    }
  }

  if (carregando && !ordem) {
    return <p className="vazio">Carregando ordem de produção…</p>;
  }

  if (!ordem) {
    return (
      <section className="card">
        {erro && <p className="erro">{erro}</p>}
        <button type="button" className="btn-secundario" onClick={onVoltar}>
          Voltar às ordens
        </button>
      </section>
    );
  }

  const codigo = ordem.codigo ?? `OP-${ordem.id}`;

  return (
    <div className="op-detalhe">
      <div className="op-detalhe__topo">
        <button type="button" className="btn-secundario" onClick={onVoltar}>
          ← Ordens
        </button>
        <div>
          <p className="op-detalhe__kicker">Ordem de produção</p>
          <h2>{codigo}</h2>
        </div>
        <span className={`pill pill--op pill--${ordem.status}`}>
          {STATUS_OP_LABEL[ordem.status]}
        </span>
      </div>

      {erro && <p className="erro">{erro}</p>}

      <section className="card op-ficha" aria-label="Dados da OP">
        <dl>
          <div>
            <dt>Número</dt>
            <dd>{codigo}</dd>
          </div>
          <div>
            <dt>Produto</dt>
            <dd>{ordem.produto}</dd>
          </div>
          <div>
            <dt>{ordem.distribuicao?.length ? 'Cores' : 'Variante'}</dt>
            <dd>{variante}</dd>
          </div>
          <div>
            <dt>Quantidade</dt>
            <dd>{ordem.quantidade}</dd>
          </div>
          <div>
            <dt>Prioridade</dt>
            <dd>{PRIORIDADE_OP_LABEL[ordem.prioridade] ?? ordem.prioridade}</dd>
          </div>
          <div>
            <dt>Previsão</dt>
            <dd>{formatarData(ordem.data_prevista)}</dd>
          </div>
          <div>
            <dt>Cliente</dt>
            <dd>{ordem.cliente || '—'}</dd>
          </div>
          <div>
            <dt>Progresso</dt>
            <dd>{progressoGeral}%</dd>
          </div>
        </dl>
        <div className="barra barra--grande" aria-label={`Progresso ${progressoGeral}%`}>
          <span style={{ width: `${progressoGeral}%` }} />
        </div>
        {ordem.distribuicao && ordem.distribuicao.length > 0 && (
          <>
            <h3 className="subtitulo">Distribuição de corte</h3>
            <TabelaDistribuicao
              itens={ordem.distribuicao}
              coresPreferidas={eixosProduto.cores}
              tamanhosPreferidos={eixosProduto.tamanhos}
            />
          </>
        )}
      </section>

      <section className="card">
        <div className="card__head">
          <h2>Fluxo de produção</h2>
          {etapas.length === 0 && (
            <button
              type="button"
              className="btn-secundario"
              disabled={gerando}
              onClick={() => void handleFluxo()}
            >
              {gerando ? 'Gerando…' : 'Gerar fluxo'}
            </button>
          )}
        </div>
        <p className="dica fluxo-legenda">
          Corte → Costura → Acabamento → Qualidade → Embalagem
        </p>

        {etapas.length === 0 ? (
          <p className="vazio">
            Esta OP ainda não tem etapas. Gere o fluxo com a API de produção.
          </p>
        ) : (
          <ol className="fluxo" aria-label="Etapas da produção">
            {passos.map(({ tipo, etapa }, i) => {
              const status = etapa?.status ?? 'ausente';
              const pct = progressoEtapa(status);
              return (
                <li
                  key={tipo}
                  className={`fluxo__passo fluxo__passo--${status}`}
                >
                  {i > 0 && <span className="fluxo__liga" aria-hidden="true" />}
                  <div className="fluxo__bolha">{i + 1}</div>
                  <h3>{FLUXO_LABEL[tipo]}</h3>
                  <p className="fluxo__status">
                    {status === 'ausente'
                      ? 'Não gerada'
                      : STATUS_ETAPA_LABEL[status]}
                  </p>
                  {etapa ? (
                    <>
                      <label className="fluxo__operador">
                        Operador
                        <input
                          value={operadores[etapa.id] ?? ''}
                          onChange={(e) =>
                            setOperadores((atual) => ({
                              ...atual,
                              [etapa.id]: e.target.value,
                            }))
                          }
                          onBlur={() => void handleOperador(etapa)}
                          placeholder="Responsável"
                          aria-label={`Operador de ${FLUXO_LABEL[tipo]}`}
                        />
                      </label>
                      <p className="dica">
                        Início: {formatarQuando(etapa.iniciado_em)}
                        <br />
                        Fim: {formatarQuando(etapa.finalizado_em)}
                      </p>
                      <div className="barra" aria-label={`Progresso ${pct}%`}>
                        <span style={{ width: `${pct}%` }} />
                      </div>
                      <p className="fluxo__pct">{pct}%</p>
                      <div className="acoes">
                        {etapa.status === 'pendente' &&
                          (i === 0 || passos[i - 1]?.etapa?.status === 'concluida') && (
                          <button
                            type="button"
                            disabled={atualizandoId === etapa.id}
                            onClick={() => void handleStatus(etapa, 'em_andamento')}
                          >
                            Iniciar
                          </button>
                        )}
                        {etapa.status === 'em_andamento' && (
                          <button
                            type="button"
                            disabled={atualizandoId === etapa.id}
                            onClick={() => void handleStatus(etapa, 'concluida')}
                          >
                            Concluir
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="dica">Etapa ausente neste fluxo.</p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
