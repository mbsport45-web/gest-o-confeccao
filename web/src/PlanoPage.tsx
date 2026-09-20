import { useCallback, useEffect, useState } from 'react';
import {
  alterarPlano,
  listarPlanos,
  temPermissao,
  type AssinaturaEmpresa,
  type PlanoEmpresa,
  type SessaoAtual,
} from './api';

const RECURSO_LABEL: Record<string, string> = {
  expedicao: 'Expedição',
  financeiro: 'Financeiro',
  relatorios_avancados: 'Relatórios avançados',
  api_externa: 'API externa',
  suporte_prioritario: 'Suporte prioritário',
};

const LIMITE_LABEL: Record<string, string> = {
  usuarios: 'Usuários',
  clientes: 'Clientes',
  produtos: 'Produtos',
  materiais: 'Materiais',
  pedidos_mes: 'Pedidos / mês',
  ordens_mes: 'Ordens / mês',
};

function formatarLimite(valor: number | null): string {
  return valor === null ? 'Ilimitado' : String(valor);
}

export function PlanoPage({
  sessao,
  onAssinatura,
}: {
  sessao: SessaoAtual;
  onAssinatura: (assinatura: AssinaturaEmpresa) => void;
}) {
  const [planos, setPlanos] = useState<PlanoEmpresa[]>([]);
  const [atual, setAtual] = useState<AssinaturaEmpresa>(sessao.assinatura);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);
  const podeEditar = temPermissao(sessao.permissoes, 'assinatura', 'editar');

  const recarregar = useCallback(async () => {
    const lista = await listarPlanos();
    setPlanos(lista.data);
  }, []);

  useEffect(() => {
    let vivo = true;
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

  async function escolher(codigo: string) {
    if (!podeEditar || codigo === atual.plano.codigo) return;
    setErro(null);
    setSalvando(codigo);
    try {
      const proxima = await alterarPlano(codigo);
      setAtual(proxima);
      onAssinatura(proxima);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(null);
    }
  }

  return (
    <main className="app__main app__main--equipe">
      <section className="card card--wide">
        <div className="card__head">
          <h2>Plano da empresa</h2>
        </div>
        <p className="dica">
          Cobrança desativada. Nenhum pagamento é processado nesta etapa — o plano só define
          limites e recursos para o futuro.
        </p>
        <p>
          Plano atual: <strong>{atual.plano.nome}</strong> · cobrança {atual.cobranca}
        </p>
        {erro && <p className="erro">{erro}</p>}
        {carregando ? (
          <p className="vazio">Carregando planos…</p>
        ) : (
          <div className="planos">
            {planos.map((plano) => {
              const atualPlano = plano.codigo === atual.plano.codigo;
              return (
                <article
                  key={plano.codigo}
                  className={atualPlano ? 'plano plano--atual' : 'plano'}
                >
                  <h3>{plano.nome}</h3>
                  <p className="dica">{plano.descricao}</p>
                  <ul className="plano__lista">
                    {Object.entries(plano.limites).map(([chave, valor]) => (
                      <li key={chave}>
                        {LIMITE_LABEL[chave] ?? chave}: {formatarLimite(valor)}
                      </li>
                    ))}
                  </ul>
                  <ul className="plano__lista">
                    {Object.entries(plano.recursos).map(([chave, ligado]) => (
                      <li key={chave}>
                        {ligado ? 'Inclui' : 'Não inclui'} {RECURSO_LABEL[chave] ?? chave}
                      </li>
                    ))}
                  </ul>
                  {podeEditar ? (
                    <button
                      type="button"
                      disabled={atualPlano || salvando !== null}
                      onClick={() => void escolher(plano.codigo)}
                    >
                      {atualPlano
                        ? 'Plano atual'
                        : salvando === plano.codigo
                          ? 'Salvando…'
                          : 'Usar este plano'}
                    </button>
                  ) : (
                    atualPlano && <p className="dica">Este é o plano da sua empresa.</p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
