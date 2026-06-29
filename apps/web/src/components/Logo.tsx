import type { CSSProperties } from 'react';

/**
 * Logo PrumoLicita — assinatura horizontal (ícone de fio de prumo + wordmark).
 *
 * O ícone é um fio de prumo: bolinha de fixação no topo, a linha, e o bob em
 * losango âmbar de dois tons ("os dois mundos: no prumo = certo, obra perto").
 * O wordmark é "Prumo" (tinta) + "Licita" (âmbar) em Archivo 800.
 *
 * Variantes:
 *  - `onLight` (padrão): fundo claro — tinta grafite.
 *  - `onDark`: fundo grafite/âmbar — tinta concreto.
 *  - `mono`: tudo numa cor só (currentColor), para carimbo/PDF.
 */

const AMBER = '#C25A26';
const AMBER_DARK = '#A14A1E';
const GRAPHITE = '#211F1C';
const CONCRETO = '#ECE7DF';

export type LogoVariant = 'onLight' | 'onDark' | 'mono';

interface LogoProps {
  /** Altura do logo em px (o resto escala proporcionalmente). Padrão 28. */
  size?: number;
  variant?: LogoVariant;
  /** Só o ícone, sem o wordmark. */
  iconOnly?: boolean;
  className?: string;
  style?: CSSProperties;
}

interface MarkColors {
  ink: string;
  bobTop: string;
  bobBottom: string;
}

function colorsFor(variant: LogoVariant): MarkColors {
  if (variant === 'mono') {
    return { ink: 'currentColor', bobTop: 'currentColor', bobBottom: 'currentColor' };
  }
  return {
    ink: variant === 'onDark' ? CONCRETO : GRAPHITE,
    bobTop: AMBER,
    bobBottom: AMBER_DARK,
  };
}

function PrumoMark({ size, colors }: { size: number; colors: MarkColors }) {
  // viewBox 48x64 — bolinha + linha + bob (losango de dois tons).
  const w = (size * 48) / 64;
  return (
    <svg
      width={w}
      height={size}
      viewBox="0 0 48 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ display: 'block', flex: '0 0 auto' }}
    >
      {/* bolinha de fixação */}
      <circle cx="24" cy="5.5" r="3.5" fill={colors.ink} />
      {/* linha do prumo */}
      <line x1="24" y1="9" x2="24" y2="24" stroke={colors.ink} strokeWidth="2.4" />
      {/* bob — triângulo superior (tom claro) */}
      <path d="M24 23 L39 38 L9 38 Z" fill={colors.bobTop} />
      {/* bob — triângulo inferior (tom escuro), aponta pra baixo */}
      <path d="M9 38 L39 38 L24 61 Z" fill={colors.bobBottom} />
    </svg>
  );
}

export function Logo({
  size = 28,
  variant = 'onLight',
  iconOnly = false,
  className,
  style,
}: LogoProps) {
  const colors = colorsFor(variant);

  if (iconOnly) {
    return (
      <span
        className={className}
        style={{ display: 'inline-flex', color: colors.ink, ...style }}
        aria-label="PrumoLicita"
      >
        <PrumoMark size={size} colors={colors} />
      </span>
    );
  }

  return (
    <span
      className={className}
      aria-label="PrumoLicita"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: size * 0.28,
        color: colors.ink,
        ...style,
      }}
    >
      <PrumoMark size={size} colors={colors} />
      <span
        aria-hidden="true"
        style={{
          fontFamily: '"Archivo", sans-serif',
          fontWeight: 800,
          fontSize: size * 0.72,
          lineHeight: 1,
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ color: colors.ink }}>Prumo</span>
        <span style={{ color: variant === 'mono' ? 'currentColor' : AMBER }}>Licita</span>
      </span>
    </span>
  );
}
