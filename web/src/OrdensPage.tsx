import { useEffect, useMemo, useState } from 'react';
import {
  atualizarStatus,
  criarOrdem,
  listarOrdens,
  removerOrdem,
  STATUS_VALIDOS,
  type NovaOrdem,
  type OrdemProducao,
  type Status,
} from './api';

const STATUS_LABEL: Record<Status, string> = {
  pendente: 'Pendente',
  em_producao: 'Em produção',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

const FORM_INICIAL: NovaOrdem = {
  cliente: '',
  produto: '',
  tamanho: '',
  quantidade: 1,
};

export function OrdensPage() {
  const [ordens, setOrdens] = useState<OrdemProducao[]>([]);
  const [form, setForm] = useState<NovaOrdem>(FORM_INICIAL);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function recarregar() {
    try {
      setCarregando(true);
      setOrdens(await listarOrdens());
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    recarregar();
  }, []);

  const totalPecas = useMemo(
    () => ordens.reduce((soma, o) => soma + o.quantidade, 0),
    [ordens],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSalvando(true);
      await criarOrdem({ ...form, quantidade: Number(form.quantidade) });
      setForm(FORM_INICIAL);
      setErro(null);
      await recarregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function handleStatus(id: number, status: Status) {
    await atualizarStatus(id, status);
    await recarregar();
  }

  async function handleRemover(id: number) {
    await removerOrdem(id);
    await recarregar();
  }

  return (
    <main className="app__main">
      <section className="card">
        <h2>Nova ordem de produção</h2>
        <form className="form" onSubmit={handleSubmit}>
          <label>
            Cliente
            <input
              required
              value={form.cliente}
              onChange={(e) => setForm({ ...form, cliente: e.target.value })}
              placeholder="Ex.: Loja Central"
            />
          </label>
          <label>
            Produto
            <input
              required
              value={form.produto}
              onChange={(e) => setForm({ ...form, produto: e.target.value })}
              placeholder="Ex.: Camiseta Polo"
            />
          </label>
          <div className="form__row">
            <label>
              Tamanho
              <input
                required
                value={form.tamanho}
                onChange={(e) => setForm({ ...form, tamanho: e.target.value })}
                placeholder="Ex.: M"
              />
            </label>
            <label>
              Quantidade
              <input
                required
                type="number"
                min={1}
                value={form.quantidade}
                onChange={(e) =>
                  setForm({ ...form, quantidade: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <button type="submit" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Adicionar ordem'}
          </button>
        </form>
      </section>

      <section className="card card--wide">
        <div className="card__head">
          <h2>Ordens cadastradas</h2>
          <span className="badge">
            {ordens.length} ordens · {totalPecas} peças
          </span>
        </div>

        {erro && <p className="erro">{erro}</p>}
        {carregando ? (
          <p className="vazio">Carregando…</p>
        ) : ordens.length === 0 ? (
          <p className="vazio">Nenhuma ordem cadastrada ainda.</p>
        ) : (
          <table className="tabela">
            <thead>
              <tr>
                <th>#</th>
                <th>Cliente</th>
                <th>Produto</th>
                <th>Tam.</th>
                <th>Qtd.</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {ordens.map((o) => (
                <tr key={o.id}>
                  <td>{o.id}</td>
                  <td>{o.cliente}</td>
                  <td>{o.produto}</td>
                  <td>{o.tamanho}</td>
                  <td>{o.quantidade}</td>
                  <td>
                    <select
                      className={`status status--${o.status}`}
                      value={o.status}
                      onChange={(e) =>
                        handleStatus(o.id, e.target.value as Status)
                      }
                    >
                      {STATUS_VALIDOS.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      className="btn-remover"
                      onClick={() => handleRemover(o.id)}
                      aria-label={`Remover ordem ${o.id}`}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
