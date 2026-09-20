import { useCallback, useEffect, useState } from 'react';
import {
  UFS_BRASIL,
  atualizarCliente,
  atualizarStatusCliente,
  criarCliente,
  listarClientes,
  obterCliente,
  removerCliente,
  type Cliente,
  type ClientePayload,
  type StatusCliente,
  type AssinaturaEmpresa,
} from './api';
import { AvisoLimite, podeCriarNoPlano } from './AvisoLimite';

type ModoPainel = 'criar' | 'editar' | 'detalhe' | null;

const FORM_VAZIO: ClientePayload = {
  nome: '',
  cpf_cnpj: '',
  contato: '',
  telefone: '',
  whatsapp: '',
  email: '',
  endereco: '',
  cidade: '',
  estado: '',
  cep: '',
  condicao_pagamento: '',
  limite_credito: 0,
  status: 'ativo',
  observacoes: '',
};

function clienteParaForm(c: Cliente): ClientePayload {
  return {
    nome: c.nome,
    cpf_cnpj: c.cpf_cnpj ?? '',
    contato: c.contato ?? '',
    telefone: c.telefone ?? '',
    whatsapp: c.whatsapp ?? '',
    email: c.email ?? '',
    endereco: c.endereco ?? '',
    cidade: c.cidade ?? '',
    estado: c.estado ?? '',
    cep: c.cep ?? '',
    condicao_pagamento: c.condicao_pagamento ?? '',
    limite_credito: c.limite_credito,
    status: c.status,
    observacoes: c.observacoes ?? '',
  };
}

function formatarCpfCnpj(valor: string | null): string {
  if (!valor) return '—';
  const d = valor.replace(/\D/g, '');
  if (d.length === 11) {
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (d.length === 14) {
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return valor;
}

function formatarCep(valor: string | null): string {
  if (!valor) return '—';
  const d = valor.replace(/\D/g, '');
  if (d.length === 8) return d.replace(/(\d{5})(\d{3})/, '$1-$2');
  return valor;
}

function formatarTelefone(valor: string | null): string {
  if (!valor) return '—';
  const d = valor.replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return valor;
}

const moeda = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function ClientesPage({ sessao }: { sessao: { assinatura: AssinaturaEmpresa } }) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [statusFiltro, setStatusFiltro] = useState<StatusCliente | ''>('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [cidadeFiltro, setCidadeFiltro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [modo, setModo] = useState<ModoPainel>(null);
  const [form, setForm] = useState<ClientePayload>(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [detalhe, setDetalhe] = useState<Cliente | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setQDebounced(q);
      setPagina(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPagina(1);
  }, [statusFiltro, estadoFiltro, cidadeFiltro]);

  const recarregar = useCallback(async () => {
    try {
      setCarregando(true);
      const lista = await listarClientes({
        q: qDebounced,
        status: statusFiltro,
        estado: estadoFiltro,
        cidade: cidadeFiltro,
        pagina,
        por_pagina: 8,
      });
      setClientes(lista.data);
      setTotal(lista.total);
      setTotalPaginas(lista.total_paginas);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [qDebounced, statusFiltro, estadoFiltro, cidadeFiltro, pagina]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  function abrirCriar() {
    if (!podeCriarNoPlano(sessao.assinatura, 'clientes')) return;
    setForm(FORM_VAZIO);
    setEditandoId(null);
    setDetalhe(null);
    setModo('criar');
  }

  async function abrirEditar(id: number) {
    const cliente = await obterCliente(id);
    setForm(clienteParaForm(cliente));
    setEditandoId(id);
    setDetalhe(null);
    setModo('editar');
  }

  async function abrirDetalhe(id: number) {
    const cliente = await obterCliente(id);
    setDetalhe(cliente);
    setModo('detalhe');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSalvando(true);
      const payload: ClientePayload = {
        ...form,
        limite_credito: Number(form.limite_credito) || 0,
      };
      if (modo === 'editar' && editandoId !== null) {
        await atualizarCliente(editandoId, payload);
      } else {
        await criarCliente(payload);
      }
      setModo(null);
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function alternarStatus(cliente: Cliente) {
    try {
      await atualizarStatusCliente(
        cliente.id,
        cliente.status === 'ativo' ? 'inativo' : 'ativo',
      );
      if (detalhe?.id === cliente.id) {
        setDetalhe(await obterCliente(cliente.id));
      }
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function excluir(cliente: Cliente) {
    if (!window.confirm(`Excluir o cliente "${cliente.nome}"?`)) return;
    try {
      await removerCliente(cliente.id);
      if (detalhe?.id === cliente.id || editandoId === cliente.id) {
        setModo(null);
      }
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  const podeCriar = podeCriarNoPlano(sessao.assinatura, 'clientes');

  return (
    <main className="app__main app__main--clientes">
      <section className="card card--wide">
        <div className="card__head">
          <h2>Clientes</h2>
          <button type="button" className="btn-secundario" onClick={abrirCriar} disabled={!podeCriar}>
            Novo cliente
          </button>
        </div>
        <AvisoLimite assinatura={sessao.assinatura} chave="clientes" />

        <div className="filtros">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar nome, CPF/CNPJ, contato, e-mail…"
            aria-label="Buscar clientes"
          />
          <select
            value={statusFiltro}
            onChange={(e) =>
              setStatusFiltro(e.target.value as StatusCliente | '')
            }
            aria-label="Filtrar status"
          >
            <option value="">Todos os status</option>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
          <select
            value={estadoFiltro}
            onChange={(e) => setEstadoFiltro(e.target.value)}
            aria-label="Filtrar estado"
          >
            <option value="">Todos os estados</option>
            {UFS_BRASIL.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
          <input
            value={cidadeFiltro}
            onChange={(e) => setCidadeFiltro(e.target.value)}
            placeholder="Cidade"
            aria-label="Filtrar cidade"
          />
        </div>

        {erro && <p className="erro">{erro}</p>}

        {carregando ? (
          <p className="vazio">Carregando…</p>
        ) : clientes.length === 0 ? (
          <p className="vazio">Nenhum cliente encontrado.</p>
        ) : (
          <table className="tabela">
            <thead>
              <tr>
                <th>Nome</th>
                <th>CPF/CNPJ</th>
                <th>Contato</th>
                <th>Cidade/UF</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id}>
                  <td>{c.nome}</td>
                  <td>{formatarCpfCnpj(c.cpf_cnpj)}</td>
                  <td>{c.contato ?? '—'}</td>
                  <td>
                    {c.cidade || c.estado
                      ? `${c.cidade ?? '—'} / ${c.estado ?? '—'}`
                      : '—'}
                  </td>
                  <td>
                    <span className={`pill pill--${c.status}`}>
                      {c.status === 'ativo' ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="acoes">
                    <button type="button" onClick={() => abrirDetalhe(c.id)}>
                      Ver
                    </button>
                    <button type="button" onClick={() => abrirEditar(c.id)}>
                      Editar
                    </button>
                    <button type="button" onClick={() => alternarStatus(c)}>
                      {c.status === 'ativo' ? 'Inativar' : 'Ativar'}
                    </button>
                    <button
                      type="button"
                      className="btn-remover-texto"
                      onClick={() => excluir(c)}
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="paginacao">
          <span>
            {total} cliente{total === 1 ? '' : 's'}
          </span>
          <div>
            <button
              type="button"
              disabled={pagina <= 1}
              onClick={() => setPagina((p) => p - 1)}
            >
              Anterior
            </button>
            <span>
              Página {pagina} de {totalPaginas}
            </span>
            <button
              type="button"
              disabled={pagina >= totalPaginas}
              onClick={() => setPagina((p) => p + 1)}
            >
              Próxima
            </button>
          </div>
        </div>
      </section>

      {modo && (
        <section className="card">
          <div className="card__head">
            <h2>
              {modo === 'criar' && 'Novo cliente'}
              {modo === 'editar' && 'Editar cliente'}
              {modo === 'detalhe' && 'Detalhes do cliente'}
            </h2>
            <button type="button" className="btn-fechar" onClick={() => setModo(null)}>
              ×
            </button>
          </div>

          {modo === 'detalhe' && detalhe ? (
            <dl className="detalhe">
              <div><dt>Nome</dt><dd>{detalhe.nome}</dd></div>
              <div><dt>CPF/CNPJ</dt><dd>{formatarCpfCnpj(detalhe.cpf_cnpj)}</dd></div>
              <div><dt>Contato</dt><dd>{detalhe.contato ?? '—'}</dd></div>
              <div><dt>Telefone</dt><dd>{formatarTelefone(detalhe.telefone)}</dd></div>
              <div><dt>WhatsApp</dt><dd>{formatarTelefone(detalhe.whatsapp)}</dd></div>
              <div><dt>E-mail</dt><dd>{detalhe.email ?? '—'}</dd></div>
              <div><dt>Endereço</dt><dd>{detalhe.endereco ?? '—'}</dd></div>
              <div><dt>Cidade</dt><dd>{detalhe.cidade ?? '—'}</dd></div>
              <div><dt>Estado</dt><dd>{detalhe.estado ?? '—'}</dd></div>
              <div><dt>CEP</dt><dd>{formatarCep(detalhe.cep)}</dd></div>
              <div><dt>Condição de pagamento</dt><dd>{detalhe.condicao_pagamento ?? '—'}</dd></div>
              <div><dt>Limite de crédito</dt><dd>{moeda.format(detalhe.limite_credito)}</dd></div>
              <div>
                <dt>Status</dt>
                <dd>
                  <span className={`pill pill--${detalhe.status}`}>
                    {detalhe.status === 'ativo' ? 'Ativo' : 'Inativo'}
                  </span>
                </dd>
              </div>
              <div><dt>Observações</dt><dd>{detalhe.observacoes ?? '—'}</dd></div>
              <div><dt>Criado em</dt><dd>{detalhe.criado_em}</dd></div>
              <div><dt>Atualizado em</dt><dd>{detalhe.atualizado_em}</dd></div>
              <div className="detalhe__acoes">
                <button type="button" onClick={() => abrirEditar(detalhe.id)}>
                  Editar
                </button>
                <button type="button" onClick={() => alternarStatus(detalhe)}>
                  {detalhe.status === 'ativo' ? 'Inativar' : 'Ativar'}
                </button>
                <button
                  type="button"
                  className="btn-remover-texto"
                  onClick={() => excluir(detalhe)}
                >
                  Excluir
                </button>
              </div>
            </dl>
          ) : (
            <form className="form" onSubmit={handleSubmit}>
              <label>
                Nome da empresa / pessoa
                <input
                  required
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                />
              </label>
              <label>
                CPF / CNPJ
                <input
                  value={form.cpf_cnpj}
                  onChange={(e) => setForm({ ...form, cpf_cnpj: e.target.value })}
                  placeholder="Somente números ou formatado"
                />
              </label>
              <label>
                Contato
                <input
                  value={form.contato}
                  onChange={(e) => setForm({ ...form, contato: e.target.value })}
                />
              </label>
              <div className="form__row">
                <label>
                  Telefone
                  <input
                    value={form.telefone}
                    onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                  />
                </label>
                <label>
                  WhatsApp
                  <input
                    value={form.whatsapp}
                    onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                  />
                </label>
              </div>
              <label>
                E-mail
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>
              <label>
                Endereço
                <input
                  value={form.endereco}
                  onChange={(e) => setForm({ ...form, endereco: e.target.value })}
                />
              </label>
              <div className="form__row">
                <label>
                  Cidade
                  <input
                    value={form.cidade}
                    onChange={(e) => setForm({ ...form, cidade: e.target.value })}
                  />
                </label>
                <label>
                  Estado
                  <select
                    value={form.estado}
                    onChange={(e) => setForm({ ...form, estado: e.target.value })}
                  >
                    <option value="">—</option>
                    {UFS_BRASIL.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                CEP
                <input
                  value={form.cep}
                  onChange={(e) => setForm({ ...form, cep: e.target.value })}
                  placeholder="00000-000"
                />
              </label>
              <label>
                Condição de pagamento
                <input
                  value={form.condicao_pagamento}
                  onChange={(e) =>
                    setForm({ ...form, condicao_pagamento: e.target.value })
                  }
                  placeholder="Ex.: 30 dias"
                />
              </label>
              <label>
                Limite de crédito
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.limite_credito}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      limite_credito: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Status
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      status: e.target.value as StatusCliente,
                    })
                  }
                >
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </label>
              <label>
                Observações
                <textarea
                  rows={3}
                  value={form.observacoes}
                  onChange={(e) =>
                    setForm({ ...form, observacoes: e.target.value })
                  }
                />
              </label>
              <button type="submit" disabled={salvando}>
                {salvando
                  ? 'Salvando…'
                  : modo === 'editar'
                    ? 'Salvar alterações'
                    : 'Cadastrar cliente'}
              </button>
            </form>
          )}
        </section>
      )}
    </main>
  );
}
