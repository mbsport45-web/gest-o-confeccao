import { useEffect, useMemo, useState } from 'react';
import {
  STATUS_OP_LABEL,
  concluirCorteInfesto,
  listarCortesInfesto,
  listarMateriasPrimas,
  listarOrdens,
  obterOrdem,
  type CorteInfesto,
  type MateriaPrima,
  type OrdemProducao,
  type Status,
} from './api';

const PODE_CORTAR = new Set(['planejada', 'pendente', 'corte']);

function pecasDaCor(ordem: OrdemProducao, cor: string): number {
  const soma = (ordem.grade ?? [])
    .filter((celula) => celula.cor.toLocaleLowerCase('pt-BR') === cor.toLocaleLowerCase('pt-BR'))
    .reduce((total, celula) => total + celula.quantidade, 0);
  return soma > 0 ? soma : ordem.quantidade;
}

export function CorteInfestoPage() {
  const [ordens, setOrdens] = useState<OrdemProducao[]>([]);
  const [cortes, setCortes] = useState<CorteInfesto[]>([]);
  const [tecidos, setTecidos] = useState<MateriaPrima[]>([]);
  const [selecionada, setSelecionada] = useState<OrdemProducao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [tecidoId, setTecidoId] = useState('');
  const [cor, setCor] = useState('');
  const [pecas, setPecas] = useState(1);
  const [camadas, setCamadas] = useState(1);
  const [metragem, setMetragem] = useState('');
  const [peso, setPeso] = useState('');

  async function carregar() {
    const [lista, historico, materias] = await Promise.all([
      listarOrdens(),
      listarCortesInfesto(),
      listarMateriasPrimas({ status: 'ativo', por_pagina: 100 }),
    ]);
    setOrdens(lista.filter((ordem) => ordem.status !== 'cancelada'));
    setCortes(historico);
    setTecidos(materias.data.filter((item) => item.tipo === 'tecido' || item.tipo === 'forro'));
  }

  useEffect(() => {
    void carregar().catch((e) => setErro((e as Error).message));
  }, []);

  const cortePorOrdem = useMemo(
    () => new Map(cortes.map((corte) => [corte.ordem_id, corte])),
    [cortes],
  );
  const cores = useMemo(() => {
    const nomes = (selecionada?.grade ?? [])
      .filter((celula) => celula.quantidade > 0)
      .map((celula) => celula.cor);
    return [...new Set(nomes)];
  }, [selecionada]);
  const concluido = selecionada ? cortePorOrdem.get(selecionada.id) : undefined;
  const tecido = tecidos.find((item) => String(item.id) === tecidoId);

  async function selecionar(ordem: OrdemProducao) {
    setErro(null);
    const completa = await obterOrdem(ordem.id);
    setSelecionada(completa);
    const coresGrade = [
      ...new Set((completa.grade ?? []).filter((celula) => celula.quantidade > 0).map((celula) => celula.cor)),
    ];
    const primeiraCor = coresGrade[0] ?? '';
    setCor(primeiraCor);
    setPecas(primeiraCor ? pecasDaCor(completa, primeiraCor) : completa.quantidade);
    setCamadas(1);
    setMetragem('');
    setPeso('');
    const requisito = completa.requisitos?.find((item) =>
      tecidos.some((tecidoItem) => tecidoItem.id === item.materia_prima_id),
    );
    setTecidoId(requisito ? String(requisito.materia_prima_id) : tecidos[0] ? String(tecidos[0].id) : '');
  }

  async function concluir() {
    if (!selecionada) return;
    setSalvando(true);
    setErro(null);
    try {
      await concluirCorteInfesto(selecionada.id, {
        materia_prima_id: Number(tecidoId),
        cor,
        quantidade_pecas: pecas,
        camadas,
        metragem: Number(metragem),
        peso_real: Number(peso),
      });
      await carregar();
      const atualizada = await obterOrdem(selecionada.id);
      setSelecionada(atualizada);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modulo-compras-estoque">
      <section className="card">
        <h2>Ordens para corte</h2>
        <p className="dica">
          Selecione a ordem, informe o enfesto e conclua o corte. A baixa sai do estoque do tecido e a ordem segue
          para costura.
        </p>
        {ordens.length === 0 ? (
          <p className="vazio">Nenhuma ordem de produção disponível.</p>
        ) : (
          <table className="tabela">
            <thead>
              <tr>
                <th>OP</th>
                <th>Cliente</th>
                <th>Produto</th>
                <th>Qtd.</th>
                <th>Status</th>
                <th>Corte</th>
              </tr>
            </thead>
            <tbody>
              {ordens.map((ordem) => {
                const feito = cortePorOrdem.get(ordem.id);
                return (
                  <tr key={ordem.id}>
                    <td>{ordem.codigo ?? ordem.id}</td>
                    <td>{ordem.cliente}</td>
                    <td>{ordem.produto}</td>
                    <td>{ordem.quantidade}</td>
                    <td>{STATUS_OP_LABEL[ordem.status]}</td>
                    <td className="acoes">
                      <button type="button" className="btn-secundario" onClick={() => void selecionar(ordem)}>
                        {feito ? 'Ver corte' : 'Executar corte'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {selecionada && (
        <section className="card">
          <h2>
            {selecionada.codigo ?? `OP ${selecionada.id}`} · {selecionada.produto}
          </h2>
          <p className="dica">
            {selecionada.cliente} · {selecionada.quantidade} peças · {STATUS_OP_LABEL[selecionada.status]}
          </p>
          {concluido ? (
            <dl className="ficha">
              <div>
                <dt>Tecido</dt>
                <dd>
                  {concluido.tecido} ({concluido.unidade})
                </dd>
              </div>
              <div>
                <dt>Cor</dt>
                <dd>{concluido.cor}</dd>
              </div>
              <div>
                <dt>Peças</dt>
                <dd>{concluido.quantidade_pecas}</dd>
              </div>
              <div>
                <dt>Camadas</dt>
                <dd>{concluido.camadas}</dd>
              </div>
              <div>
                <dt>Metragem</dt>
                <dd>{concluido.metragem}</dd>
              </div>
              <div>
                <dt>Peso real</dt>
                <dd>{concluido.peso_real}</dd>
              </div>
              <div>
                <dt>Baixa</dt>
                <dd>
                  {concluido.quantidade_baixada > 0
                    ? `${concluido.quantidade_baixada} ${concluido.unidade_baixa}`
                    : 'Estoque já baixado nesta OP'}
                </dd>
              </div>
            </dl>
          ) : (
            <form
              className="form"
              onSubmit={(event) => {
                event.preventDefault();
                void concluir();
              }}
            >
              <label>
                Tecido
                <select
                  aria-label="Tecido"
                  value={tecidoId}
                  onChange={(e) => setTecidoId(e.target.value)}
                  required
                >
                  <option value="">Selecione o tecido</option>
                  {tecidos.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nome} · {item.unidade}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cor
                {cores.length > 0 ? (
                  <select
                    aria-label="Cor do corte"
                    value={cor}
                    onChange={(e) => {
                      setCor(e.target.value);
                      setPecas(pecasDaCor(selecionada, e.target.value));
                    }}
                  >
                    {cores.map((nome) => (
                      <option key={nome} value={nome}>
                        {nome}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input aria-label="Cor do corte" value={cor} onChange={(e) => setCor(e.target.value)} required />
                )}
              </label>
              <div className="form__row">
                <label>
                  Quantidade de peças
                  <input
                    aria-label="Quantidade de peças"
                    type="number"
                    min={1}
                    max={selecionada.quantidade}
                    value={pecas}
                    onChange={(e) => setPecas(Number(e.target.value))}
                    required
                  />
                </label>
                <label>
                  Camadas do enfesto
                  <input
                    aria-label="Camadas do enfesto"
                    type="number"
                    min={1}
                    value={camadas}
                    onChange={(e) => setCamadas(Number(e.target.value))}
                    required
                  />
                </label>
              </div>
              <div className="form__row">
                <label>
                  Metragem
                  <input
                    aria-label="Metragem"
                    type="number"
                    min={0.001}
                    step="0.001"
                    value={metragem}
                    onChange={(e) => setMetragem(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Peso real consumido
                  <input
                    aria-label="Peso real consumido"
                    type="number"
                    min={0.001}
                    step="0.001"
                    value={peso}
                    onChange={(e) => setPeso(e.target.value)}
                    required
                  />
                </label>
              </div>
              <p className="dica">
                {tecido?.unidade === 'MT'
                  ? 'Este tecido está em metros. A baixa usa a metragem.'
                  : 'A baixa usa o peso real e fica no histórico de estoque do tecido.'}
              </p>
              {PODE_CORTAR.has(selecionada.status) ? (
                <button type="submit" disabled={salvando || !tecidoId}>
                  {salvando ? 'Concluindo…' : 'Concluir corte'}
                </button>
              ) : (
                <p className="dica">Esta ordem já seguiu para {STATUS_OP_LABEL[selecionada.status as Status]}.</p>
              )}
            </form>
          )}
          {erro && <p className="erro">{erro}</p>}
        </section>
      )}
    </div>
  );
}
