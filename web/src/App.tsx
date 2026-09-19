import { useEffect, useMemo, useState } from "react";
import { api, type Ordem, type Produto } from "./api";

const STATUS_ORDEM: Ordem["status"][] = [
  "Pendente",
  "Em produção",
  "Concluída",
  "Cancelada",
];

const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export default function App() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [ordens, setOrdens] = useState<Ordem[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const [novoProduto, setNovoProduto] = useState({
    nome: "",
    sku: "",
    categoria: "Geral",
    preco: "",
  });
  const [novaOrdem, setNovaOrdem] = useState({
    produto_id: "",
    quantidade: "",
    prazo: "",
  });

  async function carregar() {
    try {
      const [p, o] = await Promise.all([api.listProdutos(), api.listOrdens()]);
      setProdutos(p);
      setOrdens(o);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar dados");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function adicionarProduto(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.criarProduto({
        nome: novoProduto.nome,
        sku: novoProduto.sku,
        categoria: novoProduto.categoria || "Geral",
        preco: Number(novoProduto.preco) || 0,
      });
      setNovoProduto({ nome: "", sku: "", categoria: "Geral", preco: "" });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao criar produto");
    }
  }

  async function adicionarOrdem(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.criarOrdem({
        produto_id: Number(novaOrdem.produto_id),
        quantidade: Number(novaOrdem.quantidade),
        prazo: novaOrdem.prazo || null,
      });
      setNovaOrdem({ produto_id: "", quantidade: "", prazo: "" });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao criar ordem");
    }
  }

  const metricas = useMemo(() => {
    const emProducao = ordens.filter((o) => o.status === "Em produção").length;
    const concluidas = ordens.filter((o) => o.status === "Concluída").length;
    const pecas = ordens
      .filter((o) => o.status !== "Cancelada")
      .reduce((acc, o) => acc + o.quantidade, 0);
    return { produtos: produtos.length, emProducao, concluidas, pecas };
  }, [produtos, ordens]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">GC</span>
          <div>
            <h1>Gestão de Confecção</h1>
            <p>Controle de produtos e ordens de produção</p>
          </div>
        </div>
      </header>

      {erro && (
        <div className="alerta" role="alert">
          {erro}
          <button onClick={() => setErro(null)}>×</button>
        </div>
      )}

      <section className="metricas">
        <Card titulo="Produtos" valor={metricas.produtos} cor="azul" />
        <Card titulo="Em produção" valor={metricas.emProducao} cor="laranja" />
        <Card titulo="Concluídas" valor={metricas.concluidas} cor="verde" />
        <Card titulo="Peças ativas" valor={metricas.pecas} cor="roxo" />
      </section>

      <main className="grid">
        <div className="painel">
          <h2>Novo produto</h2>
          <form onSubmit={adicionarProduto} className="form">
            <input
              placeholder="Nome"
              value={novoProduto.nome}
              onChange={(e) =>
                setNovoProduto({ ...novoProduto, nome: e.target.value })
              }
              required
            />
            <input
              placeholder="SKU"
              value={novoProduto.sku}
              onChange={(e) =>
                setNovoProduto({ ...novoProduto, sku: e.target.value })
              }
              required
            />
            <input
              placeholder="Categoria"
              value={novoProduto.categoria}
              onChange={(e) =>
                setNovoProduto({ ...novoProduto, categoria: e.target.value })
              }
            />
            <input
              placeholder="Preço"
              type="number"
              step="0.01"
              min="0"
              value={novoProduto.preco}
              onChange={(e) =>
                setNovoProduto({ ...novoProduto, preco: e.target.value })
              }
            />
            <button type="submit" className="btn primario">
              Adicionar produto
            </button>
          </form>

          <h3>Catálogo</h3>
          <table className="tabela">
            <thead>
              <tr>
                <th>Nome</th>
                <th>SKU</th>
                <th>Categoria</th>
                <th>Preço</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {produtos.map((p) => (
                <tr key={p.id}>
                  <td>{p.nome}</td>
                  <td>
                    <code>{p.sku}</code>
                  </td>
                  <td>{p.categoria}</td>
                  <td>{moeda.format(p.preco)}</td>
                  <td>
                    <button
                      className="btn link"
                      onClick={async () => {
                        await api.removerProduto(p.id);
                        await carregar();
                      }}
                    >
                      remover
                    </button>
                  </td>
                </tr>
              ))}
              {produtos.length === 0 && !carregando && (
                <tr>
                  <td colSpan={5} className="vazio">
                    Nenhum produto cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="painel">
          <h2>Nova ordem de produção</h2>
          <form onSubmit={adicionarOrdem} className="form">
            <select
              value={novaOrdem.produto_id}
              onChange={(e) =>
                setNovaOrdem({ ...novaOrdem, produto_id: e.target.value })
              }
              required
            >
              <option value="">Selecione o produto</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} ({p.sku})
                </option>
              ))}
            </select>
            <input
              placeholder="Quantidade"
              type="number"
              min="1"
              value={novaOrdem.quantidade}
              onChange={(e) =>
                setNovaOrdem({ ...novaOrdem, quantidade: e.target.value })
              }
              required
            />
            <input
              type="date"
              value={novaOrdem.prazo}
              onChange={(e) =>
                setNovaOrdem({ ...novaOrdem, prazo: e.target.value })
              }
            />
            <button type="submit" className="btn primario">
              Criar ordem
            </button>
          </form>

          <h3>Ordens</h3>
          <table className="tabela">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Qtd.</th>
                <th>Prazo</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {ordens.map((o) => (
                <tr key={o.id}>
                  <td>
                    {o.produto_nome}
                    <br />
                    <code>{o.produto_sku}</code>
                  </td>
                  <td>{o.quantidade}</td>
                  <td>{o.prazo ?? "—"}</td>
                  <td>
                    <select
                      className={`status ${o.status
                        .toLowerCase()
                        .replace(/\s|ç|ã/g, "")}`}
                      value={o.status}
                      onChange={async (e) => {
                        await api.atualizarStatus(
                          o.id,
                          e.target.value as Ordem["status"]
                        );
                        await carregar();
                      }}
                    >
                      {STATUS_ORDEM.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              {ordens.length === 0 && !carregando && (
                <tr>
                  <td colSpan={4} className="vazio">
                    Nenhuma ordem cadastrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

function Card({
  titulo,
  valor,
  cor,
}: {
  titulo: string;
  valor: number;
  cor: string;
}) {
  return (
    <div className={`card ${cor}`}>
      <span className="card-valor">{valor}</span>
      <span className="card-titulo">{titulo}</span>
    </div>
  );
}
