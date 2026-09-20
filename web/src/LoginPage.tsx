import { useState, type FormEvent } from 'react';
import { entrar, registrarUsuario, type SessaoAtual } from './api';

type Modo = 'entrar' | 'criar';

export function LoginPage({ onEntrou }: { onEntrou: (sessao: SessaoAtual) => void }) {
  const [modo, setModo] = useState<Modo>('entrar');
  const [nome, setNome] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

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
              empresa: empresa || undefined,
            })
          : await entrar({ email, senha });
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
            onClick={() => setModo('entrar')}
          >
            Entrar
          </button>
          <button
            type="button"
            className={modo === 'criar' ? 'nav__item nav__item--ativo' : 'nav__item'}
            onClick={() => setModo('criar')}
          >
            Criar conta
          </button>
        </div>
        <form className="form" onSubmit={(e) => void handleSubmit(e)}>
          {modo === 'criar' && (
            <>
              <label>
                Seu nome
                <input value={nome} onChange={(e) => setNome(e.target.value)} required autoComplete="name" />
              </label>
              <label>
                Nome da empresa
                <input
                  value={empresa}
                  onChange={(e) => setEmpresa(e.target.value)}
                  placeholder="Opcional — fica na Empresa 1"
                  autoComplete="organization"
                />
              </label>
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
