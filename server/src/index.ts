import cors from "cors";
import express from "express";
import { db } from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT ?? 4000);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "gestao-confeccao-api" });
});

// ---- Produtos ----
app.get("/api/produtos", (_req, res) => {
  const produtos = db
    .prepare("SELECT * FROM produtos ORDER BY criado_em DESC, id DESC")
    .all();
  res.json(produtos);
});

app.post("/api/produtos", (req, res) => {
  const { nome, sku, categoria, preco } = req.body ?? {};
  if (!nome || !sku) {
    return res.status(400).json({ erro: "nome e sku são obrigatórios" });
  }
  try {
    const info = db
      .prepare(
        "INSERT INTO produtos (nome, sku, categoria, preco) VALUES (?, ?, ?, ?)"
      )
      .run(nome, sku, categoria ?? "Geral", Number(preco) || 0);
    const produto = db
      .prepare("SELECT * FROM produtos WHERE id = ?")
      .get(info.lastInsertRowid);
    res.status(201).json(produto);
  } catch (err) {
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      return res.status(409).json({ erro: "SKU já cadastrado" });
    }
    throw err;
  }
});

app.delete("/api/produtos/:id", (req, res) => {
  const info = db
    .prepare("DELETE FROM produtos WHERE id = ?")
    .run(req.params.id);
  if (info.changes === 0) {
    return res.status(404).json({ erro: "produto não encontrado" });
  }
  res.status(204).end();
});

// ---- Ordens de produção ----
app.get("/api/ordens", (_req, res) => {
  const ordens = db
    .prepare(
      `SELECT o.*, p.nome AS produto_nome, p.sku AS produto_sku
       FROM ordens_producao o
       JOIN produtos p ON p.id = o.produto_id
       ORDER BY o.criado_em DESC, o.id DESC`
    )
    .all();
  res.json(ordens);
});

app.post("/api/ordens", (req, res) => {
  const { produto_id, quantidade, prazo, status } = req.body ?? {};
  if (!produto_id || !quantidade) {
    return res
      .status(400)
      .json({ erro: "produto_id e quantidade são obrigatórios" });
  }
  const produto = db
    .prepare("SELECT id FROM produtos WHERE id = ?")
    .get(produto_id);
  if (!produto) {
    return res.status(404).json({ erro: "produto não encontrado" });
  }
  const info = db
    .prepare(
      "INSERT INTO ordens_producao (produto_id, quantidade, prazo, status) VALUES (?, ?, ?, ?)"
    )
    .run(produto_id, Number(quantidade), prazo ?? null, status ?? "Pendente");
  const ordem = db
    .prepare(
      `SELECT o.*, p.nome AS produto_nome, p.sku AS produto_sku
       FROM ordens_producao o JOIN produtos p ON p.id = o.produto_id
       WHERE o.id = ?`
    )
    .get(info.lastInsertRowid);
  res.status(201).json(ordem);
});

app.patch("/api/ordens/:id", (req, res) => {
  const { status } = req.body ?? {};
  const permitido = ["Pendente", "Em produção", "Concluída", "Cancelada"];
  if (!permitido.includes(status)) {
    return res.status(400).json({ erro: "status inválido" });
  }
  const info = db
    .prepare("UPDATE ordens_producao SET status = ? WHERE id = ?")
    .run(status, req.params.id);
  if (info.changes === 0) {
    return res.status(404).json({ erro: "ordem não encontrada" });
  }
  const ordem = db
    .prepare(
      `SELECT o.*, p.nome AS produto_nome, p.sku AS produto_sku
       FROM ordens_producao o JOIN produtos p ON p.id = o.produto_id
       WHERE o.id = ?`
    )
    .get(req.params.id);
  res.json(ordem);
});

app.listen(PORT, () => {
  console.log(`API de gestão de confecção ouvindo em http://localhost:${PORT}`);
});
