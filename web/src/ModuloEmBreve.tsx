type Props = {
  titulo: string;
  descricao: string;
};

export function ModuloEmBreve({ titulo, descricao }: Props) {
  return (
    <section className="card modulo-breve">
      <h2>{titulo}</h2>
      <p>{descricao}</p>
      <p className="dica">Nenhum dado fictício é exibido. O indicador permanece em 0 até a API deste módulo existir.</p>
      <p className="modulo-breve__zero">
        <strong>0</strong>
        <span>registros disponíveis</span>
      </p>
    </section>
  );
}
