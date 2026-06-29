import { createTheme, type MantineColorsTuple } from '@mantine/core';

/**
 * Identidade PrumoLicita (handoff v1 — "Identidade Prumo Licita.pdf").
 *
 * Paleta da marca: 3 cores-base (Âmbar Prumo, Grafite, Concreto) + 3 de status
 * (Aço, Apto, Alerta). As escalas de 10 tons são geradas ancorando o hex da
 * marca no shade indicado e clareando/escurecendo a partir dele.
 *
 * Decisão de migração: a escala `orange` foi REDEFINIDA para o Âmbar Prumo
 * (base #C25A26 no shade 8). Assim tudo que já usava `orange.8/9/0` nas telas
 * passa a renderizar âmbar sem precisar reescrever cada referência (re-skin no
 * lugar). O accent filled continua em `orange[8]` e o hover em `orange[9]`.
 *
 * Tipografia: Archivo (títulos, "peso de placa de obra"), IBM Plex Sans (corpo)
 * e IBM Plex Mono (prazos, nº de processo, dados do edital — onde precisa
 * parecer dado oficial). Carregadas via <link> do Google Fonts no index.html.
 */

// Âmbar Prumo #C25A26 @ shade 8 — cor da ação e da vitória.
const orange: MantineColorsTuple = [
  '#FBF3F0', '#F4E0D7', '#EDCDBD', '#E5BAA4', '#DEA78B',
  '#D79472', '#D08058', '#C96D3F', '#C25A26', '#97461E',
];

// Grafite #211F1C @ shade 9 — preto quente, cor de fundo escuro e texto.
const graphite: MantineColorsTuple = [
  '#F2F2F1', '#DADADA', '#C3C3C2', '#ACABAA', '#959493',
  '#7E7D7B', '#676563', '#4F4E4B', '#383634', '#211F1C',
];

// Concreto #ECE7DF @ shade 2 — branco morno de cimento, fundo pálido.
const concreto: MantineColorsTuple = [
  '#F6F4F1', '#F1EEE8', '#ECE7DF', '#DED9D2', '#D0CBC4',
  '#C2BDB7', '#B3B0A9', '#A5A29C', '#97948F', '#898681',
];

// Aço #4C5F6A @ shade 7 — azul aço dessaturado, secundário técnico.
const aco: MantineColorsTuple = [
  '#F1F2F3', '#D9DDDF', '#C2C8CC', '#AAB3B8', '#939EA5',
  '#7B8991', '#64747E', '#4C5F6A', '#405059', '#344148',
];

// Apto #2F7A55 @ shade 8 — verde de status positivo ("apto", "em dia").
const apto: MantineColorsTuple = [
  '#EEF4F1', '#D6E5DE', '#BFD6CA', '#A7C6B7', '#8FB7A3',
  '#77A890', '#5F997C', '#478969', '#2F7A55', '#1C4933',
];

// Alerta #923B20 @ shade 8 — vermelho de terra ("falta doc", "vencendo").
const alerta: MantineColorsTuple = [
  '#F6EFED', '#EAD9D4', '#DDC2BA', '#D1ACA0', '#C49587',
  '#B87F6D', '#AB6853', '#9F523A', '#923B20', '#662916',
];

const BODY_FONT =
  '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const HEADING_FONT = '"Archivo", ' + BODY_FONT;
const MONO_FONT = '"IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

/** Tokens crus da marca, para uso fora da escala Mantine (gradientes, SVG, etc.). */
export const brand = {
  amber: '#C25A26',
  graphite: '#211F1C',
  concreto: '#ECE7DF',
  aco: '#4C5F6A',
  apto: '#2F7A55',
  alerta: '#923B20',
  fontHeading: HEADING_FONT,
  fontBody: BODY_FONT,
  fontMono: MONO_FONT,
} as const;

export const theme = createTheme({
  primaryColor: 'orange',
  // Filled usa orange[8] (#C25A26 — Âmbar Prumo) e escurece para orange[9] no hover.
  primaryShade: 8,
  colors: { orange, graphite, concreto, aco, apto, alerta },
  // Texto base em grafite (preto quente), não preto puro.
  black: brand.graphite,
  fontFamily: BODY_FONT,
  fontFamilyMonospace: MONO_FONT,
  headings: { fontFamily: HEADING_FONT, fontWeight: '700' },
  defaultRadius: 'md',
  components: {
    // "Sólido ao toque": botões com peso 600.
    Button: { styles: { root: { fontWeight: 600 } } },
  },
});
