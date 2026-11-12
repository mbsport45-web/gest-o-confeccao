import { LogoMarca } from './LogoMarca';

const BLOCOS = [
  {
    titulo: 'FOCO',
    texto: 'Tenha clareza do seu objetivo. Trabalhe todos os dias.',
  },
  {
    titulo: 'DISCIPLINA',
    texto: 'Leva você onde a motivação não consegue.',
  },
  {
    titulo: 'PERSISTÊNCIA',
    texto: 'Não existe desistir. Aprenda, ajuste e continue.',
  },
  {
    titulo: 'MOTIVAÇÃO',
    texto: 'Grandes resultados são construídos com pequenas atitudes.',
  },
  {
    titulo: 'SUPERAÇÃO',
    texto: 'Seja constante. O resultado é consequência.',
  },
] as const;

export function PainelMotivacao() {
  return (
    <aside className="shell__motivacao" aria-label="Mensagens MB Gestão">
      <div className="shell__motivacao-marca">
        <LogoMarca decorative />
        <div>
          <strong>MB Gestão</strong>
          <span>Confecção</span>
        </div>
      </div>
      <div className="motivacao-blocos">
        {BLOCOS.map((bloco) => (
          <article key={bloco.titulo} className="motivacao-bloco">
            <strong>{bloco.titulo}</strong>
            <p>{bloco.texto}</p>
          </article>
        ))}
      </div>
    </aside>
  );
}
