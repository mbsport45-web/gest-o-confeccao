import { useCallback, useEffect, useState } from 'react';
import {
  alterarPlano,
  listarPlanos,
  obterAssinatura,
  temPermissao,
  LIMITE_LABEL,
  type AssinaturaEmpresa,
  type ChaveLimite,
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

function formatarLimite(valor: number | null): string {
  return valor === null ? 'Ilimitado' : String(valor);
}

function formatarUso(atual: number, maximo: number | null): string {
  return maximo === null ? `${atual} · ilimitado` : `${atual} de ${maximo}`;
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
    const [lista, assinatura] = await Promise.all([listarPlanos(), obterAssinatura()]);
    setPlanos(lista.data);
    setAtual(assinatura);
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

  const algumAtingido = Object.values(atual.uso ?? {}).some((item) => item.atingido);

  return (
    <main className="app__main app__main--equipe">
      <section className="card card--wide">
        <div className="card__head">
          <h2>Plano da empresa</h2>
        </div>
        <p className="dica">
          Cobrança desativada. Nenhum pagamento é processado nesta etapa. Os limites do plano
          valem na API e na interface — ultrapassar exige upgrade.
        </p>
        <p>
          Plano atual: <strong>{atual.plano.nome}</strong> · cobrança {atual.cobranca}
        </p>
        {algumAtingido && (
          <p className="aviso-limite">
            Um ou mais limites do plano {atual.plano.nome} foram atingidos. Faça upgrade para
            continuar criando cadastros, pedidos ou usuários.
          </p>
        )}
        {atual.uso && (
          <ul className="plano__uso">
            {(Object.keys(LIMITE_LABEL) as ChaveLimite[]).map((chave) => {
              const item = atual.uso[chave];
              return (
                <li key={chave} className={item.atingido ? 'plano__uso-item plano__uso-item--atingido' : 'plano__uso-item'}>
                  {LIMITE_LABEL[chave]}: {formatarUso(item.atual, item.maximo)}
                  {item.atingido ? ' — limite atingido' : ''}
                </li>
              );
            })}
          </ul>
        )}
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
                    {(Object.keys(plano.limites) as ChaveLimite[]).map((chave) => (
                      <li key={chave}>
                        {LIMITE_LABEL[chave]}: {formatarLimite(plano.limites[chave])}
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
