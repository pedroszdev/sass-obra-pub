import type { CSSProperties } from 'react';

/**
 * Logo PrumoLicita — assinatura horizontal (ícone de fio de prumo + wordmark).
 *
 * O ícone é um fio de prumo: bolinha de fixação no topo, a linha, e o bob em
 * pipa âmbar de dois tons ("os dois mundos: no prumo = certo, obra perto").
 * O wordmark é "Prumo" (tinta) + "Licita" (âmbar) em Archivo 800.
 *
 * O DESENHO É CÓPIA de `brand/prumolicita-simbolo.svg` — mesmas coordenadas,
 * mesmas cores. Ele é inline (e não um <img>) para herdar a cor por variante e
 * não pedir mais uma requisição. Se o símbolo mudar no arquivo, muda aqui e em
 * `public/icon.svg`, que também deriva dele.
 *
 * Variantes:
 *  - `onLight` (padrão): fundo claro — tinta grafite.
 *  - `onDark`: fundo grafite/âmbar — tinta concreto.
 *  - `mono`: tudo numa cor só (currentColor), para carimbo/PDF.
 */

const AMBER = '#C25A26';
const AMBER_DARK = '#A8481C';
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
  /** A pipa inteira — é o tom que sobra aparecendo na ponta de baixo. */
  bob: string;
  /** O losango de cima, pintado POR CIMA da pipa. */
  bobSombra: string;
}

function colorsFor(variant: LogoVariant): MarkColors {
  if (variant === 'mono') {
    // Uma cor só: a sombra some dentro da pipa e sobra a silhueta. É o que se
    // quer num carimbo/PDF em preto.
    return { ink: 'currentColor', bob: 'currentColor', bobSombra: 'currentColor' };
  }
  return {
    ink: variant === 'onDark' ? CONCRETO : GRAPHITE,
    bob: AMBER,
    bobSombra: AMBER_DARK,
  };
}

function PrumoMark({ size, colors }: { size: number; colors: MarkColors }) {
  // Coordenadas idênticas às de `brand/prumolicita-simbolo.svg`. O viewBox é
  // recortado no conteúdo real (x 8→70) em vez dos 78 do arquivo: as sobras
  // laterais virariam espaço morto entre o ícone e o wordmark.
  const w = (size * 62) / 116;
  return (
    <svg
      width={w}
      height={size}
      viewBox="8 0 62 116"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ display: 'block', flex: '0 0 auto' }}
    >
      {/* linha do prumo (sob a bolinha) */}
      <line x1="39" y1="0" x2="39" y2="40" stroke={colors.ink} strokeWidth="4" />
      {/* bolinha de fixação */}
      <circle cx="39" cy="6" r="6" fill={colors.ink} />
      {/* bob — a pipa inteira (tom claro) */}
      <path d="M39 40 L70 70 L39 116 L8 70 Z" fill={colors.bob} />
      {/* bob — losango de cima (tom escuro), por cima da pipa */}
      <path d="M39 40 L70 70 L39 84 L8 70 Z" fill={colors.bobSombra} />
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
