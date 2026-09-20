import { useCallback, useEffect, useState } from 'react';
import {
  ACAO_ASSINATURA_LABEL,
  alterarAssinatura,
  alterarPlano,
  EVENTO_ASSINATURA_LABEL,
  formatarPrecoMensal,
  listarEventosAssinatura,
  listarPlanos,
  obterAssinatura,
  temPermissao,
  LIMITE_LABEL,
  type AcaoAssinatura,
  type AssinaturaEmpresa,
  type ChaveLimite,
  type EventoAssinatura,
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

function rotuloTrocaPlano(plano: PlanoEmpresa, atual: PlanoEmpresa): string {
  if (plano.codigo === atual.codigo) return 'Plano atual';
  const preco = formatarPrecoMensal(plano.preco_mensal, plano.moeda);
  return plano.ordem > atual.ordem ? `Fazer upgrade · ${preco}` : `Fazer downgrade · ${preco}`;
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
  const podeEditar = temPermissao(sessao.permissoes, 'assinatura', 'editar');
  const podeVer = temPermissao(sessao.permissoes, 'assinatura', 'visualizar');

  const recarregar = useCallback(async () => {
    const [lista, assinatura, historico] = await Promise.all([
      listarPlanos(),
      obterAssinatura(),
      listarEventosAssinatura(),
    ]);
    setPlanos(lista.data);
    setAtual(assinatura);
    setEventos(historico.data);
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
    if (!podeEditar || codigo === atual.plano.codigo || !atual.acesso.trocar_plano) return;
    setErro(null);
    setSalvando(codigo);
    try {
      const proxima = await alterarPlano(codigo);
      setAtual(proxima);
      onAssinatura(proxima);
      const historico = await listarEventosAssinatura();
      setEventos(historico.data);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(null);
    }
  }

  async function executarAcao(acao: AcaoAssinatura) {
    if (!podeEditar) return;
    setErro(null);
    setSalvando(acao);
    try {
      const proxima = await alterarAssinatura({ acao });
      setAtual(proxima);
      onAssinatura(proxima);
      const historico = await listarEventosAssinatura();
      setEventos(historico.data);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(null);
    }
  }

  const algumAtingido = Object.values(atual.uso ?? {}).some((item) => item.atingido);
  const acoes = atual.politica?.acoes ?? [];
  const acoesPrincipais = acoes.filter(
    (acao) => acao !== 'marcar_atraso' && acao !== 'expirar',
  );
  const acoesSimulacao = acoes.filter(
    (acao) => acao === 'marcar_atraso' || acao === 'expirar',
  );

  return (
    <main className="app__main app__main--equipe">
      <section className="card card--wide">
        <div className="card__head">
          <h2>Plano da empresa</h2>
        </div>
        <p className="dica">
          Preços comerciais mensais já definidos. Cobrança e gateway continuam desativados: a
          empresa pode assinar, fazer upgrade, downgrade ou cancelar — o histórico fica
          registrado para o faturamento futuro.
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
              cobrança {atual.cobranca}
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
            {podeEditar && atual.cobranca === 'desativada' && acoesSimulacao.length > 0 && (
              <div className="assinatura-acoes">
                <p className="dica">Simulação sem cobrança real:</p>
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
                  <p className="plano__preco">
                    {formatarPrecoMensal(plano.preco_mensal, plano.moeda)}
                  </p>
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
                      disabled={
                        atualPlano ||
                        salvando !== null ||
                        !atual.acesso.trocar_plano
                      }
                      onClick={() => void escolher(plano.codigo)}
                    >
                      {atualPlano
                        ? 'Plano atual'
                        : !atual.acesso.trocar_plano
                          ? 'Indisponível neste status'
                          : salvando === plano.codigo
                            ? 'Salvando…'
                            : rotuloTrocaPlano(plano, atual.plano)}
                    </button>
                  ) : (
                    atualPlano && <p className="dica">Este é o plano da sua empresa.</p>
                  )}
                </article>
              );
            })}
          </div>
        )}
        {podeVer && eventos.length > 0 && (
          <div className="plano__eventos">
            <h3>Histórico comercial</h3>
            <p className="dica">
              Eventos de assinatura mensal, upgrade, downgrade e cancelamento — sem cobrança
              real nesta etapa.
            </p>
            <ul>
              {eventos.slice(0, 8).map((evento) => (
                <li key={evento.id}>
                  <strong>{EVENTO_ASSINATURA_LABEL[evento.tipo] ?? evento.tipo}</strong>
                  {evento.de_plano && evento.para_plano && evento.de_plano !== evento.para_plano
                    ? ` · ${evento.de_plano} → ${evento.para_plano}`
                    : evento.para_plano
                      ? ` · ${evento.para_plano}`
                      : ''}
                  {evento.valor_mensal !== null
                    ? ` · ${formatarPrecoMensal(evento.valor_mensal, evento.moeda)}`
                    : ''}
                  {' · '}
                  cobrança {evento.cobranca}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
