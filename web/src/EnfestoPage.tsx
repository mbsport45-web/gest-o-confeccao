import { useCallback, useEffect, useState } from 'react';
import {
  abrirEnfesto,
  cancelarEnfesto,
  finalizarEnfesto,
  listarEnfestoOrdem,
  listarOrdensPaginado,
  listarTecidos,
  obterOrdem,
  temPermissao,
  type CorEnfesto,
  type Enfesto,
  type OrdemProducao,
  type PermissoesSessao,
  type Tecido,
  type UnidadeTecido,
} from './api';
import { colunasDaGrade, somaQuantidades } from './DistribuicaoCorte';

const STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente',
  em_enfesto: 'Em enfesto',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
};

const STATUS_DESTINADOS_AO_CORTE = new Set(['planejada', 'pendente', 'corte', 'em_producao']);

function chave(valor: string): string {
  return valor.trim().toLowerCase();
}

export function EnfestoPage({ permissoes }: { permissoes: PermissoesSessao }) {
  const [ordens, setOrdens] = useState<OrdemProducao[]>([]);
  const [tecidos, setTecidos] = useState<Tecido[]>([]);
  const [ordemId, setOrdemId] = useState<number | null>(null);
  const [tecidosDaOp, setTecidosDaOp] = useState<number[]>([]);
  const [cores, setCores] = useState<CorEnfesto[]>([]);
  const [enfesto, setEnfesto] = useState<Enfesto | null>(null);
  const [tecidoId, setTecidoId] = useState('');
  const [folhas, setFolhas] = useState('');
  const [comprimento, setComprimento] = useState('');
  const [metragem, setMetragem] = useState('');
  const [peso, setPeso] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const tecido = tecidos.find((item) => String(item.id) === tecidoId);
  const unidade: UnidadeTecido | undefined = tecido?.unidade;
  const podeCancelar = temPermissao(permissoes, 'enfesto', 'excluir');
  const travado = enfesto?.status === 'finalizado' || enfesto?.status === 'cancelado';
  const ordensDeCorte = ordens.filter((ordem) => STATUS_DESTINADOS_AO_CORTE.has(ordem.status));

  const carregarCores = useCallback(async (id: number) => {
    const painel = await listarEnfestoOrdem(id);
    setCores(painel.cores);
  }, []);

  useEffect(() => {
    listarOrdensPaginado({ por_pagina: 50, pagina: 1 })
      .then((lista) => setOrdens(lista.data))
      .catch((err: Error) => setErro(err.message));
    listarTecidos({ por_pagina: 100, status: 'ativo' })
      .then((lista) => setTecidos(lista.data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!ordemId) {
      setCores([]);
      return;
    }
    carregarCores(ordemId).catch((err: Error) => setErro(err.message));
  }, [ordemId, carregarCores]);

  useEffect(() => {
    if (!ordemId) return;
    obterOrdem(ordemId)
      .then((ordem) => {
        const ids = (ordem.requisitos ?? [])
          .map((item) => item.materia_prima_id)
          .filter((id) => tecidos.some((tecidoItem) => tecidoItem.id === id));
        setTecidosDaOp(ids);
      })
      .catch(() => setTecidosDaOp([]));
  }, [ordemId, tecidos]);

  function preencher(atual: Enfesto) {
    setEnfesto(atual);
    setTecidoId(atual.tecido_id ? String(atual.tecido_id) : '');
    setFolhas(atual.folhas == null ? '' : String(atual.folhas));
    setComprimento(atual.comprimento == null ? '' : String(atual.comprimento));
    setMetragem(atual.metragem == null ? '' : String(atual.metragem));
    setPeso(atual.peso == null ? '' : String(atual.peso));
    setObservacoes(atual.observacoes ?? '');
  }

  async function abrirCor(cor: string) {
    if (!ordemId) return;
    setErro(null);
    try {
      const atual = await abrirEnfesto(ordemId, cor);
      preencher(atual);
      if (!atual.tecido_id && tecidosDaOp.length === 1) {
        setTecidoId(String(tecidosDaOp[0]));
      }
      await carregarCores(ordemId);
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function finalizar(e: React.FormEvent) {
    e.preventDefault();
    if (!enfesto || !tecido || salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      const atual = await finalizarEnfesto(enfesto.id, {
        tecido_id: tecido.id,
        folhas: Number(folhas),
        comprimento: Number(comprimento),
        metragem: metragem === '' ? null : Number(metragem),
        peso: peso === '' ? null : Number(peso),
        observacoes,
        unidade: tecido.unidade,
      });
      preencher(atual);
      if (ordemId) await carregarCores(ordemId);
      const lista = await listarTecidos({ por_pagina: 100, status: 'ativo' });
      setTecidos(lista.data);
      const ordensAtualizadas = await listarOrdensPaginado({ por_pagina: 50, pagina: 1 });
      setOrdens(ordensAtualizadas.data);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  const colunas = colunasDaGrade(cores);
  const corAberta = enfesto ? cores.find((item) => chave(item.cor) === chave(enfesto.cor)) : undefined;

  return (
    <main className="app__main app__main--enfesto">
      <section className="card card--wide">
        <h2>Enfesto</h2>
        <p className="dica">
          As quantidades vieram da ordem de produção. Cada cor é enfestada à parte, com folhas,
          comprimento e o consumo real do tecido. Ao finalizar, o estoque baixa na unidade cadastrada.
        </p>
        <label>
          Ordem de produção
          <select
            value={ordemId ?? ''}
            onChange={(e) => {
              setOrdemId(e.target.value ? Number(e.target.value) : null);
              setEnfesto(null);
            }}
          >
            <option value="">Selecione</option>
            {ordensDeCorte.map((ordem) => (
              <option key={ordem.id} value={ordem.id}>
                {ordem.codigo ?? `OP ${ordem.id}`}
                {ordem.referencia ? ` · ${ordem.referencia}` : ''} — {ordem.produto} · {ordem.quantidade} pç
              </option>
            ))}
          </select>
        </label>
        {erro && <p className="erro">{erro}</p>}
        {ordemId && (
          <div className="grade-corte">
            <table className="tabela tabela--compacta grade-corte__tabela">
              <thead>
                <tr>
                  <th>Cor</th>
                  {colunas.map((tamanho) => (
                    <th key={tamanho}>{tamanho}</th>
                  ))}
                  <th>Total</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cores.map((cor) => {
                  const ativa = enfesto ? chave(enfesto.cor) === chave(cor.cor) : false;
                  const total = cor.tamanhos.length ? somaQuantidades(cor.tamanhos) : cor.quantidade_pecas;
                  return (
                    <tr key={cor.cor} className={ativa ? 'grade-linha--ativa' : undefined}>
                      <th scope="row">{cor.cor}</th>
                      {colunas.map((tamanho) => {
                        const celula = cor.tamanhos.find((item) => chave(item.tamanho) === chave(tamanho));
                        return <td key={tamanho}>{celula ? celula.quantidade : '—'}</td>;
                      })}
                      <td className="grade-total">{total}</td>
                      <td>{STATUS_LABEL[cor.status] ?? cor.status}</td>
                      <td>
                        <button type="button" onClick={() => void abrirCor(cor.cor)}>
                          {cor.status === 'pendente' ? 'Enfestar' : 'Abrir'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {enfesto && (
        <section className="card">
          <h2>
            {enfesto.cor} — {enfesto.quantidade_pecas} peças
          </h2>
          <p className="dica">
            {enfesto.referencia ? `${enfesto.referencia} — ` : ''}
            {enfesto.produto_nome}. A grade desta cor foi definida na OP e não se mistura com as outras.
          </p>
          {corAberta && corAberta.tamanhos.length > 0 && (
            <p className="dica">
              {corAberta.tamanhos.map((item) => `${item.tamanho} ${item.quantidade}`).join(' · ')} · total{' '}
              {somaQuantidades(corAberta.tamanhos)}
            </p>
          )}
          {enfesto.status === 'finalizado' && (
            <p className="dica">
              Consumo de {enfesto.quantidade_consumida} {enfesto.unidade}. Estoque de{' '}
              {enfesto.saldo_anterior} para {enfesto.saldo_posterior}.
              {enfesto.custo_total != null ? ` Custo do tecido: R$ ${enfesto.custo_total.toFixed(2)}.` : ''}
            </p>
          )}
          <form className="form" onSubmit={(e) => void finalizar(e)}>
            <label>
              Tecido
              <select
                required
                disabled={travado}
                value={tecidoId}
                onChange={(e) => setTecidoId(e.target.value)}
              >
                <option value="">Selecione</option>
                {[...tecidos]
                  .sort((a, b) => Number(tecidosDaOp.includes(b.id)) - Number(tecidosDaOp.includes(a.id)))
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {tecidosDaOp.includes(item.id) ? 'BOM · ' : ''}
                      {item.nome} · {item.unidade} · estoque {item.estoque}
                    </option>
                  ))}
              </select>
            </label>
            <div className="form__row">
              <label>
                Folhas
                <input
                  required
                  disabled={travado}
                  type="number"
                  min={1}
                  step={1}
                  value={folhas}
                  onChange={(e) => setFolhas(e.target.value)}
                />
              </label>
              <label>
                Comprimento
                <input
                  required
                  disabled={travado}
                  type="number"
                  min={0.001}
                  step="0.001"
                  value={comprimento}
                  onChange={(e) => setComprimento(e.target.value)}
                />
              </label>
            </div>
            {unidade === 'KG' && (
              <label>
                Peso real utilizado (KG)
                <input
                  required
                  disabled={travado}
                  type="number"
                  min={0.001}
                  step="0.001"
                  value={peso}
                  onChange={(e) => setPeso(e.target.value)}
                />
              </label>
            )}
            {unidade === 'METRO' && (
              <label>
                Metragem real utilizada (METRO)
                <input
                  required
                  disabled={travado}
                  type="number"
                  min={0.001}
                  step="0.001"
                  value={metragem}
                  onChange={(e) => setMetragem(e.target.value)}
                />
              </label>
            )}
            <label>
              Observações
              <input disabled={travado} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
            </label>
            {!travado && (
              <button type="submit" disabled={salvando || !tecido}>
                {salvando ? 'Finalizando…' : 'Finalizar Enfesto'}
              </button>
            )}
          </form>
          {podeCancelar && enfesto.status === 'em_enfesto' && (
            <button
              type="button"
              onClick={() =>
                void cancelarEnfesto(enfesto.id)
                  .then((atual) => {
                    preencher(atual);
                    if (ordemId) return carregarCores(ordemId);
                  })
                  .catch((err: Error) => setErro(err.message))
              }
            >
              Cancelar enfesto
            </button>
          )}
        </section>
      )}
    </main>
  );
}
