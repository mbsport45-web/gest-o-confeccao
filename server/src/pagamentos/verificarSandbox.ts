import { statusConfiguracaoAsaas } from './config.js';
import { verificarAutenticacaoSandbox } from './asaas.js';

const config = statusConfiguracaoAsaas();
const conectividade = await verificarAutenticacaoSandbox();

console.log(
  JSON.stringify(
    {
      config,
      conectividade,
    },
    null,
    2,
  ),
);

process.exit(conectividade.ok ? 0 : 1);
