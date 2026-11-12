export const LOGO_MB = '/assets/logo-mb.jpg';

export function LogoMarca({
  className,
  decorative = false,
}: {
  className?: string;
  decorative?: boolean;
}) {
  return (
    <span
      className={['shell__logo', className].filter(Boolean).join(' ')}
      aria-hidden={decorative || undefined}
    >
      <img src={LOGO_MB} alt={decorative ? '' : 'MB'} />
    </span>
  );
}
