import { createApp } from './app.js';
import { createDatabase } from './db.js';
import { statusConfiguracaoAsaas } from './pagamentos/config.js';

const PORT = Number(process.env.PORT ?? 3001);
const DB_PATH = process.env.DB_PATH ?? 'data/gestao-confeccao.sqlite';

const db = createDatabase(DB_PATH);
const app = createApp(db);

app.listen(PORT, () => {
  const asaas = statusConfiguracaoAsaas();
  console.log(`[gestao-confeccao] API ouvindo em http://localhost:${PORT}`);
  console.log(`[gestao-confeccao] Banco de dados: ${DB_PATH}`);
  console.log(
    `[gestao-confeccao] Asaas sandbox host=${asaas.host} configurado=${asaas.configurado} origem_key=${asaas.origem_api_key ?? 'ausente'} origem_url=${asaas.origem_base_url} cobranca_real=${asaas.cobranca_real}`,
  );
});
