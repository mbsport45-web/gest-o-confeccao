import { useEffect, useState, type FormEvent } from 'react';
import {
  entrar,
  obterConvitePublico,
  registrarUsuario,
  type ConvitePublico,
  type SessaoAtual,
} from './api';

type Modo = 'entrar' | 'criar';

export function LoginPage({ onEntrou }: { onEntrou: (sessao: SessaoAtual) => void }) {
  const [modo, setModo] = useState<Modo>('entrar');
  const [nome, setNome] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [tokenConvite, setTokenConvite] = useState<string | null>(null);
  const [convite, setConvite] = useState<ConvitePublico | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('convite')?.trim() || null;
    if (!token) return;
    setTokenConvite(token);
    setModo('criar');
    void obterConvitePublico(token)
      .then((info) => {
        setConvite(info);
        setEmail(info.email);
        setErro(null);
      })
      .catch((err) => setErro((err as Error).message));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      const sessao =
        modo === 'criar'
          ? await registrarUsuario({
              nome,
              email,
              senha,
              empresa: tokenConvite ? undefined : empresa || undefined,
              convite: tokenConvite || undefined,
            })
          : await entrar({ email, senha });
      if (tokenConvite) {
        const url = new URL(window.location.href);
        url.searchParams.delete('convite');
        window.history.replaceState({}, '', url.pathname + url.search);
      }
      onEntrou(sessao);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="login">
      <section className="card login__card">
        <div className="login__marca">
          <strong>Gestão de Confecção</strong>
          <p>Entre para acessar o chão de fábrica</p>
        </div>
        <div className="nav" aria-label="Acesso">
          <button
            type="button"
            className={modo === 'entrar' ? 'nav__item nav__item--ativo' : 'nav__item'}
            onClick={() => {
              setModo('entrar');
              setErro(null);
            }}
          >
            Entrar
          </button>
          <button
            type="button"
            className={modo === 'criar' ? 'nav__item nav__item--ativo' : 'nav__item'}
            onClick={() => {
              setModo('criar');
              setErro(null);
            }}
          >
            Criar conta
          </button>
        </div>
        <form className="form" onSubmit={(e) => void handleSubmit(e)}>
          {modo === 'criar' && convite && (
            <p className="login__dica">
              Convite para <strong>{convite.empresa.nome}</strong> como{' '}
              {convite.papel === 'admin'
                ? 'administrador'
                : convite.papel === 'consulta'
                  ? 'consulta'
                  : 'operador'}
              . Você entra nesta empresa, sem criar outra.
            </p>
          )}
          {modo === 'criar' && (
            <>
              <label>
                Seu nome
                <input value={nome} onChange={(e) => setNome(e.target.value)} required autoComplete="name" />
              </label>
              {!tokenConvite && (
                <>
                  <label>
                    Nome da empresa
                    <input
                      value={empresa}
                      onChange={(e) => setEmpresa(e.target.value)}
                      placeholder="Sua confecção"
                      autoComplete="organization"
                    />
                  </label>
                  <p className="login__dica">Cada nova conta cria uma empresa separada.</p>
                </>
              )}
            </>
          )}
          <label>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              readOnly={Boolean(tokenConvite && modo === 'criar')}
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
              minLength={8}
              autoComplete={modo === 'criar' ? 'new-password' : 'current-password'}
            />
          </label>
          {erro && <p className="erro">{erro}</p>}
          <button type="submit" disabled={salvando}>
            {salvando ? 'Entrando…' : modo === 'criar' ? 'Criar conta' : 'Entrar'}
          </button>
        </form>
      </section>
    </div>
  );
}
