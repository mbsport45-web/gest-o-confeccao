import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  PAPEL_LABEL,
  PAPEIS_CONVITE,
  atualizarMembro,
  cancelarConvite,
  criarConvite,
  listarConvites,
  listarMembros,
  type ConviteEmpresa,
  type MembroEmpresa,
  type PapelConvite,
  type SessaoAtual,
} from './api';

export function EquipePage({ sessao }: { sessao: SessaoAtual }) {
  const [membros, setMembros] = useState<MembroEmpresa[]>([]);
  const [convites, setConvites] = useState<ConviteEmpresa[]>([]);
  const [email, setEmail] = useState('');
  const [papel, setPapel] = useState<PapelConvite>('vendas');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const recarregar = useCallback(async () => {
    const [m, c] = await Promise.all([listarMembros(), listarConvites()]);
    setMembros(m.data);
    setConvites(c.data);
  }, []);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    recarregar()
      .catch((err) => {
        if (vivo) setErro((err as Error).message);
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, [recarregar]);

  async function convidar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    setLink(null);
    setSalvando(true);
    try {
      const criado = await criarConvite({ email, papel });
      const url = `${window.location.origin}${criado.caminho ?? `/?convite=${criado.token}`}`;
      setLink(url);
      setAviso(`Convite enviado para ${criado.email}. Copie o link — ele não aparece de novo na lista.`);
      setEmail('');
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function mudarPapel(membro: MembroEmpresa, novo: PapelConvite) {
    setErro(null);
    try {
      await atualizarMembro(membro.id, { papel: novo });
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function alternarStatus(membro: MembroEmpresa) {
    const proximo = membro.status === 'ativo' ? 'inativo' : 'ativo';
    if (
      proximo === 'inativo' &&
      !window.confirm(`Inativar ${membro.nome}? A sessão desta pessoa será encerrada.`)
    ) {
      return;
    }
    setErro(null);
    try {
      await atualizarMembro(membro.id, { status: proximo });
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function cancelar(convite: ConviteEmpresa) {
    if (!window.confirm(`Cancelar o convite de ${convite.email}?`)) return;
    setErro(null);
    try {
      await cancelarConvite(convite.id);
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function copiarLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setAviso('Link copiado.');
    } catch {
      setAviso('Copie o link manualmente.');
    }
  }

  return (
    <main className="app__main app__main--equipe">
      <section className="card card--wide">
        <div className="card__head">
          <h2>Equipe</h2>
        </div>
        <p className="dica">
          Convites entram nesta empresa, com o papel escolhido. Não criam uma confecção nova.
        </p>

        <form className="form form__row" onSubmit={(e) => void convidar(e)}>
          <label>
            E-mail do convite
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="off"
            />
          </label>
          <label>
            Papel
            <select
              value={papel}
              onChange={(e) => setPapel(e.target.value as PapelConvite)}
            >
              {PAPEIS_CONVITE.map((p) => (
                <option key={p} value={p}>
                  {PAPEL_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={salvando}>
            {salvando ? 'Enviando…' : 'Convidar'}
          </button>
        </form>

        {link && (
          <p className="equipe__link">
            <code>{link}</code>
            <button type="button" className="btn-secundario" onClick={() => void copiarLink()}>
              Copiar link
            </button>
          </p>
        )}
        {aviso && <p className="dica">{aviso}</p>}
        {erro && <p className="erro">{erro}</p>}

        {carregando ? (
          <p className="vazio">Carregando…</p>
        ) : (
          <>
            <h3>Membros</h3>
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Papel</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {membros.map((m) => {
                  const proprio = m.id === sessao.usuario.id;
                  const ehProprietario = m.papel === 'proprietario';
                  return (
                    <tr key={m.id}>
                      <td>
                        {m.nome}
                        {proprio ? ' (você)' : ''}
                      </td>
                      <td>{m.email}</td>
                      <td>
                        {ehProprietario ? (
                          <span className="pill pill--ativo">{PAPEL_LABEL.proprietario}</span>
                        ) : (
                          <select
                            aria-label={`Papel de ${m.nome}`}
                            value={m.papel}
                            onChange={(e) => void mudarPapel(m, e.target.value as PapelConvite)}
                          >
                            {PAPEIS_CONVITE.map((p) => (
                              <option key={p} value={p}>
                                {PAPEL_LABEL[p]}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td>
                        <span className={m.status === 'ativo' ? 'pill pill--ativo' : 'pill pill--inativo'}>
                          {m.status === 'ativo' ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="acoes">
                        {!ehProprietario && (
                          <button type="button" className="btn-secundario" onClick={() => void alternarStatus(m)}>
                            {m.status === 'ativo' ? 'Inativar' : 'Reativar'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <h3>Convites pendentes</h3>
            {convites.length === 0 ? (
              <p className="vazio">Nenhum convite pendente.</p>
            ) : (
              <table className="tabela">
                <thead>
                  <tr>
                    <th>E-mail</th>
                    <th>Papel</th>
                    <th>Expira</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {convites.map((c) => (
                    <tr key={c.id}>
                      <td>{c.email}</td>
                      <td>{PAPEL_LABEL[c.papel]}</td>
                      <td>{c.expira_em.slice(0, 10)}</td>
                      <td className="acoes">
                        <button type="button" className="btn-secundario" onClick={() => void cancelar(c)}>
                          Cancelar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>
    </main>
  );
}
