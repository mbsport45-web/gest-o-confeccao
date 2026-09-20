import {
  EVENTO_ASSINATURA_LABEL,
  formatarDataHora,
  type EventoAssinatura,
} from './api';

function rotuloPlano(evento: EventoAssinatura): string {
  const de = evento.de_plano_nome ?? evento.de_plano;
  const para = evento.para_plano_nome ?? evento.para_plano;
  if (de && para && de !== para) return `${de} → ${para}`;
  return para || de || '—';
}

function rotuloStatus(evento: EventoAssinatura): string {
  const de = evento.de_status_label ?? evento.de_status;
  const para = evento.para_status_label ?? evento.para_status;
  if (de && para && de !== para) return `${de} → ${para}`;
  return para || de || '—';
}

export function HistoricoComercial({ eventos }: { eventos: EventoAssinatura[] }) {
  return (
    <div className="plano__eventos">
      <h3>Histórico comercial</h3>
      <p className="dica">
        Auditoria permanente da empresa: criação, trial, troca de plano e mudanças de status.
        O histórico não pode ser editado.
      </p>
      {eventos.length === 0 ? (
        <p className="vazio">Nenhum evento comercial registrado ainda.</p>
      ) : (
        <div className="plano__eventos-tabela-wrap">
          <table className="plano__eventos-tabela">
            <thead>
              <tr>
                <th>Data e hora</th>
                <th>Evento</th>
                <th>Responsável</th>
                <th>Plano</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((evento) => (
                <tr key={evento.id}>
                  <td>{formatarDataHora(evento.criado_em)}</td>
                  <td>
                    <strong>{evento.tipo_label ?? EVENTO_ASSINATURA_LABEL[evento.tipo] ?? evento.tipo}</strong>
                  </td>
                  <td>{evento.usuario?.nome ?? 'Sistema'}</td>
                  <td>{rotuloPlano(evento)}</td>
                  <td>{rotuloStatus(evento)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
