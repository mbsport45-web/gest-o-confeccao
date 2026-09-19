import { createApp } from './app.js';
import { createDatabase } from './db.js';

const PORT = Number(process.env.PORT ?? 3001);
const DB_PATH = process.env.DB_PATH ?? 'data/gestao-confeccao.sqlite';

const db = createDatabase(DB_PATH);
const app = createApp(db);

app.listen(PORT, () => {
  console.log(`[gestao-confeccao] API ouvindo em http://localhost:${PORT}`);
  console.log(`[gestao-confeccao] Banco de dados: ${DB_PATH}`);
});
