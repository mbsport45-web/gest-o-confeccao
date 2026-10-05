import { useCallback, useEffect, useState } from 'react';
import {
  abrirEnfesto,
  cancelarEnfesto,
  finalizarEnfesto,
  listarEnfestoOrdem,
  listarOrdensPaginado,
  listarTecidos,
  temPermissao,
  type CorEnfesto,
  type Enfesto,
  type OrdemProducao,
  type PermissoesSessao,
  type Tecido,
  type UnidadeTecido,
} from './api';

const STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente',
  em_enfesto: 'Em enfesto',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
};

export function EnfestoPage({ permissoes }: { permissoes: PermissoesSessao }) {
  const [ordens, setOrdens] = useState<OrdemProducao[]>([]);
  const [tecidos, setTecidos] = useState<Tecido[]>([]);
  const [ordemId, setOrdemId] = useState<number | null>(null);
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

  const carregarCores = useCallback(async (id: number) => {
    const painel = await listarEnfestoOrdem(id);
    setCores(painel.cores);
  }, []);

  useEffect(() => {
    listarOrdensPaginado({ por_pagina: 30, pagina: 1 })
      .then((lista) => setOrdens(lista.data))
      .catch((err: Error) => setErro(err.message));
    listarTecidos({ por_pagina: 100, status: 'ativo' })
      .then((lista) => setTecidos(lista.data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!ordemId) return;
    carregarCores(ordemId).catch((err: Error) => setErro(err.message));
  }, [ordemId, carregarCores]);

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
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main className="app__main">
      <section className="card card--wide">
        <h2>Enfesto</h2>
        <p className="dica">
          Cada cor da OP é enfestada à parte. Ao finalizar, o estoque do tecido baixa na unidade cadastrada.
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
            {ordens.map((ordem) => (
              <option key={ordem.id} value={ordem.id}>
                {ordem.codigo ?? `OP ${ordem.id}`}
                {ordem.referencia ? ` · ${ordem.referencia}` : ''} — {ordem.produto} · {ordem.quantidade} pç
              </option>
            ))}
          </select>
        </label>
        {erro && <p className="erro">{erro}</p>}
        {ordemId && (
          <table className="tabela">
            <thead>
              <tr>
                <th>Cor</th>
                <th>Quantidade da OP</th>
                <th>Tamanhos</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cores.map((cor) => (
                <tr key={cor.cor}>
                  <td>{cor.cor}</td>
                  <td>{cor.quantidade_pecas}</td>
                  <td>{cor.tamanhos.map((item) => `${item.tamanho}: ${item.quantidade}`).join(' · ') || '—'}</td>
                  <td>{STATUS_LABEL[cor.status] ?? cor.status}</td>
                  <td>
                    <button type="button" onClick={() => void abrirCor(cor.cor)}>
                      {cor.status === 'pendente' ? 'Enfestar' : 'Abrir'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {enfesto && (
        <section className="card">
          <h2>
            {enfesto.cor} · {enfesto.quantidade_pecas} peças
          </h2>
          <p className="dica">
            {enfesto.referencia ? `${enfesto.referencia} — ` : ''}
            {enfesto.produto_nome}. O consumo desta cor não se mistura com as outras.
          </p>
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
                {tecidos.map((item) => (
                  <option key={item.id} value={item.id}>
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
              <input
                disabled={travado}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
              />
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
