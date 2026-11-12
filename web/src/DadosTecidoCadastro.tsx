import { useEffect, useState } from 'react';
import {
  dadosFaltantesConsumo,
  decimalEmDigitacao,
  formatarNumeroDecimal,
  mensagemDadosFaltantes,
} from './consumoCorte';

export type TecidoFichaCampos = {
  nome: string;
  cor: string;
  largura_cm: number | null;
  largura_unidade?: string;
  gramatura: number | null;
  composicao: string;
  unidade: string;
  numero_rolo?: string;
};

function InputDecimal({
  ariaLabel,
  valor,
  unidadeLargura,
  onChange,
  readOnly,
}: {
  ariaLabel: string;
  valor: number | null;
  unidadeLargura?: string;
  onChange?: (texto: string) => void;
  readOnly: boolean;
}) {
  const [texto, setTexto] = useState(() => formatarNumeroDecimal(valor, unidadeLargura));
  const [focado, setFocado] = useState(false);

  useEffect(() => {
    if (!focado) setTexto(formatarNumeroDecimal(valor, unidadeLargura));
  }, [valor, unidadeLargura, focado]);

  return (
    <input
      type="text"
      aria-label={ariaLabel}
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      value={texto}
      readOnly={readOnly}
      onFocus={() => setFocado(true)}
      onBlur={() => {
        if (onChange && texto.trim() !== '' && !decimalEmDigitacao(texto)) onChange(texto);
        setFocado(false);
      }}
      onChange={(e) => {
        const bruto = e.target.value;
        setTexto(bruto);
        if (!onChange) return;
        if (bruto.trim() === '') {
          onChange('');
          return;
        }
        if (decimalEmDigitacao(bruto)) return;
        onChange(bruto);
      }}
    />
  );
}

export function DadosTecidoCadastro({
  tecido,
  className,
  onChange,
  ocultarRolo = false,
}: {
  tecido: TecidoFichaCampos;
  className?: string;
  onChange?: (campo: keyof TecidoFichaCampos, valor: string) => void;
  ocultarRolo?: boolean;
}) {
  const larguraUnidade = tecido.largura_unidade === 'm' ? 'm' : 'cm';
  const aviso = mensagemDadosFaltantes(
    dadosFaltantesConsumo(tecido.unidade, tecido.largura_cm, tecido.gramatura),
  );
  return (
    <div className={`tecido-cadastro ${className ?? ''}`.trim()} aria-label="Dados do tecido cadastrado">
      <div className="tecido-cadastro__campos">
        <label>
          Nome do tecido
          <input
            aria-label="Nome do tecido"
            value={tecido.nome}
            readOnly={!onChange}
            onChange={(e) => onChange?.('nome', e.target.value)}
          />
        </label>
        <label>
          Cor
          <input
            type="text"
            aria-label="Cor do tecido"
            value={tecido.cor}
            readOnly={!onChange}
            autoComplete="off"
            onChange={(e) => onChange?.('cor', e.target.value)}
          />
        </label>
        <label className="tecido-cadastro__largura">
          Largura
          <span className="tecido-cadastro__largura-linha">
            <InputDecimal
              ariaLabel="Largura do tecido"
              valor={tecido.largura_cm}
              unidadeLargura={larguraUnidade}
              readOnly={!onChange}
              onChange={(texto) => onChange?.('largura_cm', texto)}
            />
            <select
              aria-label="Unidade da largura"
              value={larguraUnidade}
              disabled={!onChange}
              onChange={(e) => onChange?.('largura_unidade', e.target.value)}
            >
              <option value="cm">cm</option>
              <option value="m">m</option>
            </select>
          </span>
        </label>
        <label>
          Gramatura (g/m²)
          <InputDecimal
            ariaLabel="Gramatura do tecido"
            valor={tecido.gramatura}
            readOnly={!onChange}
            onChange={(texto) => onChange?.('gramatura', texto)}
          />
        </label>
        <label>
          Unidade de controle
          <select
            aria-label="Unidade de controle do tecido"
            value={tecido.unidade || 'KG'}
            disabled={!onChange}
            onChange={(e) => onChange?.('unidade', e.target.value)}
          >
            <option value="KG">KG</option>
            <option value="MT">MT</option>
          </select>
        </label>
        {ocultarRolo ? null : (
          <label>
            Número do rolo
            <input
              type="text"
              aria-label="Número do rolo"
              value={tecido.numero_rolo ?? ''}
              readOnly={!onChange}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => onChange?.('numero_rolo', e.target.value)}
            />
          </label>
        )}
        <label className="tecido-cadastro__composicao">
          Composição
          <textarea
            aria-label="Composição do tecido"
            value={tecido.composicao}
            readOnly={!onChange}
            rows={4}
            onChange={(e) => onChange?.('composicao', e.target.value)}
          />
        </label>
      </div>
      {aviso ? (
        <p className="erro" role="status">
          {aviso}
        </p>
      ) : null}
      <p className="dica">
        Edição só nesta ficha. O cadastro original do material não é alterado. A unidade da largura (cm ou m) não
        converte o valor digitado.
      </p>
    </div>
  );
}
