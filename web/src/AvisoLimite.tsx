import {
  limiteAtingido,
  mensagemLimitePlano,
  type AssinaturaEmpresa,
  type ChaveLimite,
} from './api';

export function AvisoLimite({
  assinatura,
  chave,
}: {
  assinatura: AssinaturaEmpresa;
  chave: ChaveLimite;
}) {
  const msg = mensagemLimitePlano(assinatura, chave);
  if (!msg) return null;
  return <p className="aviso-limite">{msg}</p>;
}

export function podeCriarNoPlano(assinatura: AssinaturaEmpresa, chave: ChaveLimite): boolean {
  return !limiteAtingido(assinatura, chave);
}
