import { useCallback, useEffect, useState } from 'react';
import { obterRelatorio, STATUS_PEDIDO, STATUS_PEDIDO_LABEL, urlRelatorioCsv } from './api';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const ABAS = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'vendas', label: 'Vendas' },
  { id: 'estoque', label: 'Estoque' },
  { id: 'compras', label: 'Compras' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'producao', label: 'Produção' },
  { id: 'custos', label: 'Custos' },
] as const;

type Aba = (typeof ABAS)[number]['id'];

function dadosCompativeis(aba: Aba, dados: Record<string, unknown> | null): boolean {
  if (!dados) return false;
  if (aba === 'resumo') return 'ordens' in dados && !('data' in dados);
  if (aba === 'custos') return 'por_material' in dados && 'totais' in dados;
  if (aba === 'vendas') {
    return Array.isArray(dados.data) && 'por_produto' in dados && 'por_cliente' in dados;
  }
  return Array.isArray(dados.data);
}

export function RelatoriosPage() {
  const [aba, setAba] = useState<Aba>('resumo');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [status, setStatus] = useState('');
  const [dados, setDados] = useState<Record<string, unknown> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    const alvo = aba;
    try {
      setCarregando(true);
      const json = await obterRelatorio(alvo, {
        de: de || undefined,
        ate: ate || undefined,
        status: alvo === 'vendas' ? status || undefined : undefined,
        pagina: 1,
        por_pagina: 20,
      });
      setDados(json);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [aba, de, ate, status]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const csv =
    aba === 'resumo'
      ? null
      : urlRelatorioCsv(aba, {
          de: de || undefined,
          ate: ate || undefined,
          status: aba === 'vendas' ? status || undefined : undefined,
        });
  const pronto = !carregando && dadosCompativeis(aba, dados);

  return (
    <main className="relatorios" data-aba={aba}>
      <div className="card__head">
        <div className="nav" aria-label="Tipos de relatório">
          {ABAS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={aba === a.id ? 'nav__item nav__item--ativo' : 'nav__item'}
              onClick={() => {
                setAba(a.id);
                setCarregando(true);
                setDados(null);
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
        {csv && (
          <a className="btn-secundario" href={csv}>
            Exportar CSV
          </a>
        )}
      </div>

      <div className={aba === 'vendas' ? 'filtros filtros--relatorios filtros--relatorios-status' : 'filtros filtros--relatorios'}>
        <input type="date" value={de} onChange={(e) => setDe(e.target.value)} aria-label="Período inicial" />
        <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Período final" />
        {aba === 'vendas' && (
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status do pedido">
            <option value="">Todos (exceto cancelados)</option>
            {STATUS_PEDIDO.map((s) => (
              <option key={s} value={s}>
                {STATUS_PEDIDO_LABEL[s]}
              </option>
            ))}
          </select>
        )}
      </div>

      {erro && <p className="erro">{erro}</p>}
      {!pronto || !dados ? (
        <p className="vazio">Carregando relatório…</p>
      ) : (
        <RelatorioConteudo aba={aba} dados={dados} />
      )}
    </main>
  );
}

function RelatorioConteudo({ aba, dados }: { aba: Aba; dados: Record<string, unknown> }) {
  if (aba === 'resumo') {
    const r = dados as {
      ordens: number;
      pecas: number;
      compras: number;
      compras_total: number;
      vendas?: number;
      vendas_total?: number;
      estoque_baixo: number;
      contas_pagar: number;
    };
    return (
      <section className="kpi-grid">
        <div className="kpi"><span className="kpi__label">Ordens</span><strong className="kpi__valor">{r.ordens}</strong></div>
        <div className="kpi"><span className="kpi__label">Peças</span><strong className="kpi__valor">{r.pecas}</strong></div>
        <div className="kpi"><span className="kpi__label">Vendas</span><strong className="kpi__valor">{r.vendas ?? 0}</strong><span className="kpi__dica">{moeda.format(r.vendas_total ?? 0)}</span></div>
        <div className="kpi"><span className="kpi__label">Compras</span><strong className="kpi__valor">{r.compras}</strong><span className="kpi__dica">{moeda.format(r.compras_total)}</span></div>
        <div className="kpi kpi--alerta"><span className="kpi__label">Estoque baixo</span><strong className="kpi__valor">{r.estoque_baixo}</strong></div>
        <div className="kpi"><span className="kpi__label">Contas a pagar</span><strong className="kpi__valor">{moeda.format(r.contas_pagar)}</strong></div>
      </section>
    );
  }

  if (aba === 'vendas') {
    const r = dados as {
      data: Array<{ codigo: string; cliente: string; data_pedido: string; status: string; total: number }>;
      totais: { pedidos: number; vendas: number; quantidade: number };
      por_periodo: Array<{ periodo: string; pedidos: number; total: number }>;
      por_produto: Array<{ nome: string; sku: string | null; quantidade: number; pedidos: number; total: number }>;
      por_cliente: Array<{ nome: string; pedidos: number; total: number }>;
    };
    return (
      <section className="card">
        <div className="kpi-grid">
          <div className="kpi">
            <span className="kpi__label">Pedidos</span>
            <strong className="kpi__valor">{r.totais.pedidos}</strong>
          </div>
          <div className="kpi">
            <span className="kpi__label">Total de vendas</span>
            <strong className="kpi__valor">{moeda.format(r.totais.vendas)}</strong>
          </div>
          <div className="kpi">
            <span className="kpi__label">Peças vendidas</span>
            <strong className="kpi__valor">{r.totais.quantidade}</strong>
          </div>
        </div>
        <h3 className="subtitulo">Faturamento por período</h3>
        <Tabela
          colunas={['Período', 'Pedidos', 'Faturamento']}
          linhas={(r.por_periodo ?? []).map((p) => [p.periodo, p.pedidos, moeda.format(p.total)])}
        />
        <h3 className="subtitulo">Vendas por produto</h3>
        <Tabela
          colunas={['Produto', 'SKU', 'Pedidos', 'Qtd.', 'Total']}
          linhas={(r.por_produto ?? []).map((p) => [p.nome, p.sku ?? '—', p.pedidos, p.quantidade, moeda.format(p.total)])}
        />
        <h3 className="subtitulo">Vendas por cliente</h3>
        <Tabela
          colunas={['Cliente', 'Pedidos', 'Total']}
          linhas={(r.por_cliente ?? []).map((c) => [c.nome, c.pedidos, moeda.format(c.total)])}
        />
        <h3 className="subtitulo">Pedidos</h3>
        <Tabela
          colunas={['Código', 'Cliente', 'Pedido', 'Status', 'Total']}
          linhas={r.data.map((d) => [d.codigo, d.cliente, d.data_pedido, d.status, moeda.format(d.total)])}
        />
      </section>
    );
  }

  if (aba === 'estoque') {
    const r = dados as {
      data: Array<{ nome: string; codigo: string; quantidade: number; unidade: string; abaixo_minimo: boolean; valor: number }>;
      totais: { quantidade: number; valor: number; abaixo_minimo: number };
    };
    return (
      <section className="card">
        <p className="dica">
          {r.totais.abaixo_minimo} abaixo do mínimo · valor {moeda.format(r.totais.valor)}
        </p>
        <Tabela
          colunas={['Item', 'Código', 'Qtd.', 'Valor', 'Alerta']}
          linhas={r.data.map((d) => [d.nome, d.codigo, `${d.quantidade} ${d.unidade ?? ''}`, moeda.format(d.valor), d.abaixo_minimo ? 'Baixo' : '—'])}
        />
      </section>
    );
  }

  if (aba === 'compras') {
    const r = dados as {
      data: Array<{ codigo: string; fornecedor: string; data_emissao: string; status: string; total: number }>;
      totais: { valor: number };
      itens: Array<{ nome: string; quantidade: number; total: number }>;
    };
    return (
      <section className="card">
        <p className="dica">Total do período: {moeda.format(r.totais.valor)}</p>
        <Tabela
          colunas={['Código', 'Fornecedor', 'Emissão', 'Status', 'Total']}
          linhas={r.data.map((d) => [d.codigo, d.fornecedor, d.data_emissao, d.status, moeda.format(d.total)])}
        />
        {r.itens?.length > 0 && (
          <>
            <h3 className="subtitulo">Por material</h3>
            <Tabela
              colunas={['Material', 'Qtd.', 'Custo']}
              linhas={r.itens.map((i) => [i.nome, i.quantidade, moeda.format(i.total)])}
            />
          </>
        )}
      </section>
    );
  }

  if (aba === 'financeiro') {
    const r = dados as {
      totais: Record<string, number>;
      data: Array<{ tipo: string; status: string; descricao: string; valor: number }>;
    };
    return (
      <section className="card">
        <div className="kpi-grid">
          {Object.entries(r.totais).map(([k, v]) => (
            <div className="kpi" key={k}>
              <span className="kpi__label">{k.replace('_', ' ')}</span>
              <strong className="kpi__valor">{moeda.format(v)}</strong>
            </div>
          ))}
        </div>
        <Tabela
          colunas={['Descrição', 'Tipo', 'Status', 'Valor']}
          linhas={r.data.map((d) => [d.descricao, d.tipo, d.status, moeda.format(d.valor)])}
        />
      </section>
    );
  }

  if (aba === 'producao') {
    const r = dados as {
      data: Array<{ codigo: string; produto: string; tamanho: string; quantidade: number; status: string }>;
      por_status: Array<{ status: string; n: number; quantidade: number }>;
      etapas: Array<{ status: string; n: number }>;
    };
    return (
      <section className="card">
        <p className="dica">
          Etapas: {(r.etapas ?? []).map((e) => `${e.status} ${e.n}`).join(' · ') || 'sem fluxo gerado'}
        </p>
        <Tabela
          colunas={['Status OP', 'Ordens', 'Peças']}
          linhas={(r.por_status ?? []).map((s) => [s.status, s.n, s.quantidade])}
        />
        <Tabela
          colunas={['OP', 'Produto', 'Qtd.', 'Status']}
          linhas={r.data.map((d) => [d.codigo, `${d.produto} ${d.tamanho}`, d.quantidade, d.status])}
        />
      </section>
    );
  }

  const r = dados as {
    totais: { compras: number; estoque_materiais: number; consumo_producao: number };
    por_material: Array<{ nome: string; codigo: string; quantidade: number; total: number }>;
  };
  return (
    <section className="card">
      <div className="kpi-grid">
        <div className="kpi"><span className="kpi__label">Compras</span><strong className="kpi__valor">{moeda.format(r.totais.compras)}</strong></div>
        <div className="kpi"><span className="kpi__label">Estoque de materiais</span><strong className="kpi__valor">{moeda.format(r.totais.estoque_materiais)}</strong></div>
        <div className="kpi"><span className="kpi__label">Consumo de produção</span><strong className="kpi__valor">{moeda.format(r.totais.consumo_producao)}</strong></div>
      </div>
      <Tabela
        colunas={['Material', 'Código', 'Qtd.', 'Custo']}
        linhas={(r.por_material ?? []).map((m) => [m.nome, m.codigo, m.quantidade, moeda.format(m.total)])}
      />
    </section>
  );
}

function Tabela({ colunas, linhas }: { colunas: string[]; linhas: Array<Array<string | number>> }) {
  if (linhas.length === 0) return <p className="vazio">Sem dados neste filtro.</p>;
  return (
    <table className="tabela">
      <thead>
        <tr>{colunas.map((c) => <th key={c}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {linhas.map((linha, i) => (
          <tr key={i}>{linha.map((cel, j) => <td key={j}>{cel}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}
