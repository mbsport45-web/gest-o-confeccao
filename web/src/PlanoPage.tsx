import { useCallback, useEffect, useState } from 'react';
import {
  ACAO_ASSINATURA_LABEL,
  alterarAssinatura,
  formatarPrecoMensal,
  listarEventosAssinatura,
  listarPlanos,
  obterAssinatura,
  podeVerHistoricoAssinatura,
  temPermissao,
  LIMITE_LABEL,
  type AcaoAssinatura,
  type AssinaturaEmpresa,
  type ChaveLimite,
  type EventoAssinatura,
  type PlanoEmpresa,
  type SessaoAtual,
} from './api';
import { CheckoutAssinatura } from './CheckoutAssinatura';
import { HistoricoComercial } from './HistoricoComercial';
import { MSG_SANDBOX, RECURSO_LABEL, rotuloAcaoPlano } from './checkoutPagamento';

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
  const [eventos, setEventos] = useState<EventoAssinatura[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [planoCheckout, setPlanoCheckout] = useState<PlanoEmpresa | null>(null);
  const podeEditar = temPermissao(sessao.permissoes, 'assinatura', 'editar');
  const podeVer = temPermissao(sessao.permissoes, 'assinatura', 'visualizar');
  const podeHistorico = podeVerHistoricoAssinatura(sessao.usuario.papel);

  const aplicarAssinatura = useCallback(
    (proxima: AssinaturaEmpresa) => {
      setAtual(proxima);
      onAssinatura(proxima);
    },
    [onAssinatura],
  );

  const recarregar = useCallback(async () => {
    const [lista, assinatura] = await Promise.all([listarPlanos(), obterAssinatura()]);
    setPlanos(lista.data);
    setAtual(assinatura);
    if (podeHistorico) {
      const historico = await listarEventosAssinatura();
      setEventos(historico.data);
    } else {
      setEventos([]);
    }
  }, [podeHistorico]);

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

  async function executarAcao(acao: AcaoAssinatura) {
    if (!podeEditar) return;
    setErro(null);
    setSalvando(acao);
    try {
      const proxima = await alterarAssinatura({ acao });
      aplicarAssinatura(proxima);
      const historico = podeHistorico ? await listarEventosAssinatura() : { data: [] as EventoAssinatura[] };
      setEventos(historico.data);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(null);
    }
  }

  const algumAtingido = Object.values(atual.uso ?? {}).some((item) => item.atingido);
  const acoes = atual.politica?.acoes ?? [];
  const acoesPrincipais = acoes.filter((acao) => acao !== 'marcar_atraso' && acao !== 'expirar');
  const acoesSimulacao = acoes.filter((acao) => acao === 'marcar_atraso' || acao === 'expirar');

  return (
    <main className="app__main app__main--equipe">
      <section className="card card--wide">
        <div className="card__head">
          <h2>Plano da empresa</h2>
        </div>
        <p className="sandbox-selo">{MSG_SANDBOX}</p>
        <p className="dica">
          Planos comerciais mensais: Básico, Profissional e Enterprise. A assinatura usa o Asaas
          Sandbox (Pix ou boleto). O preço oficial sai do servidor — o navegador só envia o plano
          escolhido.
        </p>
        {podeVer && (
          <div className={`assinatura-status assinatura-status--${atual.status}`}>
            <p>
              Status: <strong>{atual.status_label ?? atual.status}</strong>
              {' · '}
              plano <strong>{atual.plano.nome}</strong>
              {' · '}
              {formatarPrecoMensal(
                atual.comercial?.valor_mensal ?? atual.plano.preco_mensal,
                atual.comercial?.moeda ?? atual.plano.moeda,
              )}
              {' · '}
              ciclo {atual.comercial?.ciclo ?? atual.ciclo}
              {' · '}
              cobrança {atual.cobranca === 'sandbox' ? 'sandbox (teste)' : atual.cobranca}
            </p>
            {atual.renova_em && (
              <p className="dica">Próxima renovação / validade: {atual.renova_em}</p>
            )}
            <div className="assinatura-politica">
              <div>
                <h3>Permite</h3>
                <ul>
                  {(atual.politica?.permite ?? []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Bloqueia</h3>
                <ul>
                  {(atual.politica?.bloqueia ?? []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
            {podeEditar && acoesPrincipais.length > 0 && (
              <div className="assinatura-acoes">
                {acoesPrincipais.map((acao) => (
                  <button
                    key={acao}
                    type="button"
                    disabled={salvando !== null}
                    onClick={() => void executarAcao(acao)}
                  >
                    {salvando === acao ? 'Salvando…' : ACAO_ASSINATURA_LABEL[acao]}
                  </button>
                ))}
              </div>
            )}
            {podeEditar && atual.cobranca !== 'sandbox' && acoesSimulacao.length > 0 && (
              <div className="assinatura-acoes">
                <p className="dica">Simulação interna, sem cobrança real:</p>
                {acoesSimulacao.map((acao) => (
                  <button
                    key={acao}
                    type="button"
                    className="btn-secundario"
                    disabled={salvando !== null}
                    onClick={() => void executarAcao(acao)}
                  >
                    {salvando === acao ? 'Salvando…' : ACAO_ASSINATURA_LABEL[acao]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {algumAtingido && atual.acesso?.operacional && (
          <p className="aviso-limite">
            Um ou mais limites do plano {atual.plano.nome} foram atingidos. Faça upgrade para
            continuar criando cadastros, pedidos ou usuários.
          </p>
        )}
        {!atual.acesso?.operacional && (
          <p className="aviso-limite">
            Assinatura {atual.status_label?.toLowerCase()}: a empresa está em leitura. Use as
            ações acima para voltar a operar.
          </p>
        )}
        {atual.uso && (
          <ul className="plano__uso">
            {(Object.keys(LIMITE_LABEL) as ChaveLimite[]).map((chave) => {
              const item = atual.uso[chave];
              return (
                <li
                  key={chave}
                  className={item.atingido ? 'plano__uso-item plano__uso-item--atingido' : 'plano__uso-item'}
                >
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
        ) : planoCheckout ? (
          <CheckoutAssinatura
            plano={planoCheckout}
            atual={atual}
            podeHistorico={podeHistorico}
            onAssinatura={aplicarAssinatura}
            onEventos={setEventos}
            onVoltar={() => setPlanoCheckout(null)}
          />
        ) : (
          <div className="planos">
            {planos.map((plano) => {
              const atualPlano = plano.codigo === atual.plano.codigo;
              return (
                <article
                  key={plano.codigo}
                  className={atualPlano ? 'plano plano--atual' : 'plano'}
                  data-codigo={plano.codigo}
                >
                  {atualPlano && <p className="plano__selo">Plano atual</p>}
                  <h3>{plano.nome}</h3>
                  <p className="plano__preco">{formatarPrecoMensal(plano.preco_mensal, plano.moeda)}</p>
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
                      disabled={atualPlano || !atual.acesso.trocar_plano}
                      onClick={() => setPlanoCheckout(plano)}
                    >
                      {atualPlano
                        ? 'Plano atual'
                        : !atual.acesso.trocar_plano
                          ? 'Indisponível neste status'
                          : rotuloAcaoPlano(plano, atual.plano)}
                    </button>
                  ) : (
                    atualPlano && <p className="dica">Este é o plano da sua empresa.</p>
                  )}
                </article>
              );
            })}
          </div>
        )}
        {podeHistorico && !carregando && <HistoricoComercial eventos={eventos} />}
      </section>
    </main>
  );
}
