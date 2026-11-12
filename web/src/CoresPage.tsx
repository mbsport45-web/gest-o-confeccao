import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  atualizarCor,
  criarCor,
  listarCores,
  removerCor,
  type CorCadastro,
} from './api';

type FormCor = {
  nome: string;
  codigo: string;
  hex: string;
  usarHex: boolean;
};

const FORM_VAZIO: FormCor = {
  nome: '',
  codigo: '',
  hex: '#6366F1',
  usarHex: false,
};

function formDaCor(cor: CorCadastro): FormCor {
  return {
    nome: cor.nome,
    codigo: cor.codigo ?? '',
    hex: cor.hex ?? '#6366F1',
    usarHex: Boolean(cor.hex),
  };
}

function payload(form: FormCor) {
  return {
    nome: form.nome.trim(),
    codigo: form.codigo.trim() || null,
    hex: form.usarHex ? form.hex : null,
  };
}

export function CoresPage() {
  const [cores, setCores] = useState<CorCadastro[]>([]);
  const [q, setQ] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState<FormCor>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [excluindoId, setExcluindoId] = useState<number | null>(null);

  async function carregar() {
    try {
      setCarregando(true);
      const lista = await listarCores();
      setCores(lista.filter((cor) => cor.id != null));
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  const termo = q.trim().toLocaleLowerCase('pt-BR');
  const visiveis = useMemo(
    () =>
      cores.filter((cor) => {
        if (!termo) return true;
        return (
          cor.nome.toLocaleLowerCase('pt-BR').includes(termo) ||
          (cor.codigo ?? '').toLocaleLowerCase('pt-BR').includes(termo)
        );
      }),
    [cores, termo],
  );

  function abrirNova() {
    setEditandoId(null);
    setForm(FORM_VAZIO);
    setFormAberto(true);
    setErro(null);
  }

  function abrirEdicao(cor: CorCadastro) {
    if (cor.id == null) return;
    setEditandoId(cor.id);
    setForm(formDaCor(cor));
    setFormAberto(true);
    setExcluindoId(null);
    setErro(null);
  }

  async function salvar(event: FormEvent) {
    event.preventDefault();
    if (!form.nome.trim()) {
      setErro('Informe o nome da cor');
      return;
    }
    setSalvando(true);
    try {
      if (editandoId == null) await criarCor(payload(form));
      else await atualizarCor(editandoId, payload(form));
      setFormAberto(false);
      setEditandoId(null);
      setForm(FORM_VAZIO);
      setErro(null);
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(id: number) {
    setSalvando(true);
    try {
      await removerCor(id);
      setExcluindoId(null);
      if (editandoId === id) {
        setFormAberto(false);
        setEditandoId(null);
      }
      setErro(null);
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
      setExcluindoId(null);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="card">
      <div className="card__head">
        <h2>Cadastro de cores</h2>
        <button type="button" className="btn-primario" onClick={abrirNova}>
          Nova cor
        </button>
      </div>
      <p className="dica">
        Cadastre as cores usadas na fábrica. O nome é obrigatório. Código e identificação visual são opcionais.
        As cores ficam disponíveis na ordem de produção.
      </p>
      <label className="cores-busca">
        Pesquisar
        <input
          aria-label="Pesquisar cores"
          placeholder="Nome ou código"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      {formAberto && (
        <form className="form form--cor" onSubmit={(e) => void salvar(e)}>
          <h3>{editandoId == null ? 'Nova cor' : 'Editar cor'}</h3>
          <label>
            Nome
            <input
              aria-label="Nome da cor"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
          </label>
          <label>
            Código
            <input
              aria-label="Código da cor"
              value={form.codigo}
              placeholder="Opcional"
              onChange={(e) => setForm({ ...form, codigo: e.target.value })}
            />
          </label>
          <label className="grade-op__opcao">
            <input
              type="checkbox"
              aria-label="Usar identificação visual"
              checked={form.usarHex}
              onChange={(e) => setForm({ ...form, usarHex: e.target.checked })}
            />
            Identificação visual
          </label>
          {form.usarHex && (
            <label>
              Cor visual
              <input
                type="color"
                aria-label="Cor visual"
                value={form.hex}
                onChange={(e) => setForm({ ...form, hex: e.target.value })}
              />
            </label>
          )}
          <div className="cores-acoes">
            <button type="submit" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar cor'}
            </button>
            <button
              type="button"
              className="btn-secundario"
              onClick={() => {
                setFormAberto(false);
                setEditandoId(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
      {erro && <p className="erro">{erro}</p>}
      {carregando ? (
        <p className="vazio">Carregando cores…</p>
      ) : visiveis.length === 0 ? (
        <p className="vazio">
          {termo
            ? 'Nenhuma cor corresponde à pesquisa.'
            : 'Nenhuma cor cadastrada. Inclua as cores usadas na fábrica.'}
        </p>
      ) : (
        <table className="tabela">
          <thead>
            <tr>
              <th>Cor</th>
              <th>Nome</th>
              <th>Código</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((cor) => (
              <tr key={cor.id ?? cor.nome}>
                <td>
                  {cor.hex ? (
                    <span className="cor-amostra" style={{ background: cor.hex }} aria-hidden="true" />
                  ) : (
                    '—'
                  )}
                </td>
                <td>{cor.nome}</td>
                <td>{cor.codigo || '—'}</td>
                <td className="acoes">
                  <button type="button" className="btn-secundario" onClick={() => abrirEdicao(cor)}>
                    Editar
                  </button>
                  {excluindoId === cor.id ? (
                    <button
                      type="button"
                      className="btn-remover-texto"
                      disabled={salvando}
                      onClick={() => cor.id != null && void excluir(cor.id)}
                    >
                      Confirmar exclusão
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-remover-texto"
                      onClick={() => cor.id != null && setExcluindoId(cor.id)}
                    >
                      Excluir
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
