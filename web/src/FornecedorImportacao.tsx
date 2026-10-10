import { useState } from 'react';
import { UFS_BRASIL, type DocumentoProcessado } from './api';
import {
  dadosParaCadastro,
  formularioFornecedorDaLeitura,
  type FormFornecedorImportacao,
  type PayloadFornecedorImportacao,
} from './fornecedorImportacao';

type Props = {
  leitura: DocumentoProcessado;
  selecionado: boolean;
  salvando: boolean;
  aviso: string | null;
  onCadastrar: (dados: PayloadFornecedorImportacao) => Promise<void>;
};

export function FornecedorImportacao({ leitura, selecionado, salvando, aviso, onCadastrar }: Props) {
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState<FormFornecedorImportacao>(() => formularioFornecedorDaLeitura(leitura));
  const [erroLocal, setErroLocal] = useState<string | null>(null);

  function abrir() {
    setErroLocal(null);
    setAberto(true);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const dados = dadosParaCadastro(form);
    if (!dados) {
      setErroLocal('Informe o tipo de pessoa e o nome.');
      return;
    }
    setErroLocal(null);
    await onCadastrar(dados);
  }

  function atualizar(patch: Partial<FormFornecedorImportacao>) {
    setForm((atual) => ({ ...atual, ...patch }));
  }

  if (selecionado) return aviso ? <p className="dica">{aviso}</p> : null;

  return (
    <div className="fornecedor-importacao">
      {!aberto && (
        <>
          <p className="dica">O fornecedor deste documento não está cadastrado.</p>
          <button type="button" className="btn-secundario" onClick={abrir}>
            Cadastrar novo fornecedor
          </button>
        </>
      )}
      {aberto && !selecionado && (
        <form className="form" onSubmit={(e) => void salvar(e)}>
          <div className="card__head">
            <h3>Cadastrar novo fornecedor</h3>
            <button type="button" className="btn-fechar" onClick={() => setAberto(false)} aria-label="Fechar cadastro">
              ×
            </button>
          </div>
          {erroLocal && <p className="erro">{erroLocal}</p>}
          <label>
            Tipo de pessoa
            <select
              required
              value={form.tipo_pessoa}
              onChange={(e) => atualizar({ tipo_pessoa: e.target.value as FormFornecedorImportacao['tipo_pessoa'] })}
            >
              <option value="">Selecione</option>
              <option value="juridica">Jurídica</option>
              <option value="fisica">Física</option>
            </select>
          </label>
          <label>
            {form.tipo_pessoa === 'fisica' ? 'Nome completo' : 'Razão social'}
            <input required value={form.nome} onChange={(e) => atualizar({ nome: e.target.value })} />
          </label>
          <label>
            Nome fantasia
            <input value={form.nome_fantasia} onChange={(e) => atualizar({ nome_fantasia: e.target.value })} />
          </label>
          <label>
            {form.tipo_pessoa === 'fisica' ? 'CPF' : 'CNPJ'}
            <input value={form.cpf_cnpj} onChange={(e) => atualizar({ cpf_cnpj: e.target.value })} />
          </label>
          {form.tipo_pessoa === 'juridica' && (
            <label>
              Inscrição estadual
              <input
                value={form.inscricao_estadual}
                onChange={(e) => atualizar({ inscricao_estadual: e.target.value })}
              />
            </label>
          )}
          <div className="form__row">
            <label>
              Telefone
              <input value={form.telefone} onChange={(e) => atualizar({ telefone: e.target.value })} />
            </label>
            <label>
              WhatsApp
              <input value={form.whatsapp} onChange={(e) => atualizar({ whatsapp: e.target.value })} />
            </label>
          </div>
          <label>
            E-mail
            <input type="email" value={form.email} onChange={(e) => atualizar({ email: e.target.value })} />
          </label>
          <div className="form__row">
            <label>
              CEP
              <input value={form.cep} onChange={(e) => atualizar({ cep: e.target.value })} />
            </label>
            <label>
              Número
              <input value={form.numero} onChange={(e) => atualizar({ numero: e.target.value })} />
            </label>
          </div>
          <label>
            Endereço
            <input value={form.endereco} onChange={(e) => atualizar({ endereco: e.target.value })} />
          </label>
          <label>
            Complemento
            <input value={form.complemento} onChange={(e) => atualizar({ complemento: e.target.value })} />
          </label>
          <div className="form__row">
            <label>
              Bairro
              <input value={form.bairro} onChange={(e) => atualizar({ bairro: e.target.value })} />
            </label>
            <label>
              Cidade
              <input value={form.cidade} onChange={(e) => atualizar({ cidade: e.target.value })} />
            </label>
          </div>
          <label>
            Estado
            <select value={form.estado} onChange={(e) => atualizar({ estado: e.target.value })}>
              <option value="">Selecione</option>
              {UFS_BRASIL.map((uf) => (
                <option key={uf} value={uf}>{uf}</option>
              ))}
            </select>
          </label>
          <label>
            Observações
            <textarea value={form.observacoes} onChange={(e) => atualizar({ observacoes: e.target.value })} />
          </label>
          <button type="submit" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar fornecedor'}
          </button>
        </form>
      )}
    </div>
  );
}
