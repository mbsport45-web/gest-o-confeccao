import { useEffect, useState } from 'react';
import {
  formatarPrecoMensal,
  iniciarPagamentoSandbox,
  listarEventosAssinatura,
  obterAssinatura,
  obterCheckoutPagamento,
  type AssinaturaEmpresa,
  type EventoAssinatura,
  type MeioPagamentoSandbox,
  type PlanoEmpresa,
} from './api';
import {
  MSG_CANCELADA,
  MSG_CONFIRMADO,
  MSG_ERRO,
  MSG_FALHOU,
  MSG_PENDENTE,
  MSG_SANDBOX,
  rotuloMeio,
} from './checkoutPagamento';

export type EtapaCheckout =
  | 'revisao'
  | 'iniciando'
  | 'pendente'
  | 'confirmado'
  | 'falhou'
  | 'cancelada'
  | 'erro';

export function CheckoutAssinatura({
  plano,
  atual,
  podeHistorico,
  onAssinatura,
  onEventos,
  onVoltar,
}: {
  plano: PlanoEmpresa;
  atual: AssinaturaEmpresa;
  podeHistorico: boolean;
  onAssinatura: (assinatura: AssinaturaEmpresa) => void;
  onEventos: (eventos: EventoAssinatura[]) => void;
  onVoltar: () => void;
}) {
  const [etapa, setEtapa] = useState<EtapaCheckout>('revisao');
  const [meio, setMeio] = useState<MeioPagamentoSandbox>('PIX');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (etapa !== 'pendente') return undefined;
    let vivo = true;
    const tick = async () => {
      try {
        const [assinatura, checkout] = await Promise.all([obterAssinatura(), obterCheckoutPagamento()]);
        if (!vivo) return;
        onAssinatura(assinatura);
        if (podeHistorico) {
          const historico = await listarEventosAssinatura();
          if (vivo) onEventos(historico.data);
        }
        if (checkout.estado === 'confirmado' || assinatura.status === 'ativa') {
          setEtapa('confirmado');
        } else if (checkout.estado === 'falhou') {
          setEtapa('falhou');
        } else if (checkout.estado === 'cancelada' || assinatura.status === 'cancelada') {
          setEtapa('cancelada');
        }
      } catch {
        if (vivo) {
          setErro(MSG_ERRO);
          setEtapa('erro');
        }
      }
    };
    const id = window.setInterval(() => void tick(), 4000);
    return () => {
      vivo = false;
      window.clearInterval(id);
    };
  }, [etapa, onAssinatura, onEventos, podeHistorico]);

  async function iniciar() {
    setErro(null);
    setEtapa('iniciando');
    try {
      const iniciado = await iniciarPagamentoSandbox({
        plano: plano.codigo,
        billingType: meio,
      });
      onAssinatura(iniciado);
      if (podeHistorico) {
        const historico = await listarEventosAssinatura();
        onEventos(historico.data);
      }
      if (iniciado.checkout?.confirmado) {
        setEtapa('confirmado');
        return;
      }
      setEtapa('pendente');
    } catch (err) {
      setErro((err as Error).message || MSG_ERRO);
      setEtapa('erro');
    }
  }

  async function atualizarStatus() {
    setErro(null);
    try {
      const [assinatura, checkout] = await Promise.all([obterAssinatura(), obterCheckoutPagamento()]);
      onAssinatura(assinatura);
      if (podeHistorico) {
        const historico = await listarEventosAssinatura();
        onEventos(historico.data);
      }
      if (checkout.estado === 'confirmado' || assinatura.status === 'ativa') setEtapa('confirmado');
      else if (checkout.estado === 'falhou') setEtapa('falhou');
      else if (checkout.estado === 'cancelada') setEtapa('cancelada');
      else setEtapa('pendente');
    } catch {
      setErro(MSG_ERRO);
      setEtapa('erro');
    }
  }

  const titulo =
    etapa === 'revisao'
      ? 'Revisar plano e preço'
      : etapa === 'iniciando'
        ? 'Iniciando pagamento'
        : etapa === 'pendente'
          ? 'Aguardando confirmação'
          : etapa === 'confirmado'
            ? 'Pagamento confirmado'
            : etapa === 'falhou'
              ? 'Pagamento recusado'
              : etapa === 'cancelada'
                ? 'Assinatura cancelada'
                : 'Erro de comunicação';

  return (
    <section className={`checkout checkout--${etapa}`} aria-live="polite">
      <p className="sandbox-selo">{MSG_SANDBOX}</p>
      <h3>{titulo}</h3>
      <dl className="checkout__resumo">
        <div>
          <dt>Plano</dt>
          <dd>{plano.nome}</dd>
        </div>
        <div>
          <dt>Valor mensal</dt>
          <dd>{formatarPrecoMensal(plano.preco_mensal, plano.moeda)}</dd>
        </div>
        <div>
          <dt>Meio</dt>
          <dd>{rotuloMeio(meio)}</dd>
        </div>
      </dl>

      {etapa === 'revisao' && (
        <>
          <p className="dica">
            O valor acima vem do catálogo do servidor. O navegador não envia preço nem empresa.
          </p>
          <fieldset className="checkout__meios">
            <legend>Meio de pagamento (sandbox)</legend>
            <label>
              <input
                type="radio"
                name="meio-pagamento"
                value="PIX"
                checked={meio === 'PIX'}
                onChange={() => setMeio('PIX')}
              />
              Pix
            </label>
            <label>
              <input
                type="radio"
                name="meio-pagamento"
                value="BOLETO"
                checked={meio === 'BOLETO'}
                onChange={() => setMeio('BOLETO')}
              />
              Boleto
            </label>
          </fieldset>
          <div className="checkout__acoes">
            <button type="button" onClick={() => void iniciar()}>
              Iniciar pagamento
            </button>
            <button type="button" className="btn-secundario" onClick={onVoltar}>
              Voltar aos planos
            </button>
          </div>
        </>
      )}

      {etapa === 'iniciando' && <p className="vazio">Carregando… iniciando pagamento de teste.</p>}

      {etapa === 'pendente' && (
        <>
          <p className="checkout__msg checkout__msg--pendente">{MSG_PENDENTE}</p>
          <p className="dica">
            A confirmação definitiva chega pelo backend/webhook do Asaas Sandbox. Criar a
            cobrança ainda não significa pagamento aprovado.
          </p>
          <div className="checkout__acoes">
            <button type="button" onClick={() => void atualizarStatus()}>
              Atualizar status
            </button>
            <button type="button" className="btn-secundario" onClick={onVoltar}>
              Voltar aos planos
            </button>
          </div>
        </>
      )}

      {etapa === 'confirmado' && (
        <>
          <p className="checkout__msg checkout__msg--ok">{MSG_CONFIRMADO}</p>
          <p className="dica">
            Plano atual: {atual.plano.nome} · {formatarPrecoMensal(atual.plano.preco_mensal, atual.plano.moeda)}
          </p>
          <div className="checkout__acoes">
            <button type="button" onClick={onVoltar}>
              Ver planos
            </button>
          </div>
        </>
      )}

      {etapa === 'falhou' && (
        <>
          <p className="checkout__msg checkout__msg--erro">{MSG_FALHOU}</p>
          <div className="checkout__acoes">
            <button type="button" onClick={() => setEtapa('revisao')}>
              Tentar de novo
            </button>
            <button type="button" className="btn-secundario" onClick={onVoltar}>
              Voltar aos planos
            </button>
          </div>
        </>
      )}

      {etapa === 'cancelada' && (
        <>
          <p className="checkout__msg checkout__msg--erro">{MSG_CANCELADA}</p>
          <div className="checkout__acoes">
            <button type="button" onClick={onVoltar}>
              Voltar aos planos
            </button>
          </div>
        </>
      )}

      {etapa === 'erro' && (
        <>
          <p className="checkout__msg checkout__msg--erro">{erro ?? MSG_ERRO}</p>
          <div className="checkout__acoes">
            <button type="button" onClick={() => setEtapa('revisao')}>
              Tentar de novo
            </button>
            <button type="button" className="btn-secundario" onClick={onVoltar}>
              Voltar aos planos
            </button>
          </div>
        </>
      )}
    </section>
  );
}
