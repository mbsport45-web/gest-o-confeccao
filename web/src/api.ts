export interface Produto {
  id: number;
  nome: string;
  sku: string;
  categoria: string;
  preco: number;
  criado_em: string;
}

export interface Ordem {
  id: number;
  produto_id: number;
  produto_nome: string;
  produto_sku: string;
  quantidade: number;
  status: "Pendente" | "Em produção" | "Concluída" | "Cancelada";
  prazo: string | null;
  criado_em: string;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { erro?: string };
    throw new Error(body.erro ?? `Erro ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  listProdutos: () => fetch("/api/produtos").then((r) => handle<Produto[]>(r)),
  criarProduto: (data: {
    nome: string;
    sku: string;
    categoria: string;
    preco: number;
  }) =>
    fetch("/api/produtos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((r) => handle<Produto>(r)),
  removerProduto: (id: number) =>
    fetch(`/api/produtos/${id}`, { method: "DELETE" }).then((r) =>
      handle<void>(r)
    ),
  listOrdens: () => fetch("/api/ordens").then((r) => handle<Ordem[]>(r)),
  criarOrdem: (data: {
    produto_id: number;
    quantidade: number;
    prazo: string | null;
  }) =>
    fetch("/api/ordens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((r) => handle<Ordem>(r)),
  atualizarStatus: (id: number, status: Ordem["status"]) =>
    fetch(`/api/ordens/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).then((r) => handle<Ordem>(r)),
};
