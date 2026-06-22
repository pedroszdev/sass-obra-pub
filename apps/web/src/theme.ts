import { createTheme } from '@mantine/core';

// Os design tokens do handoff são o Open Color — que é justamente a paleta
// default do Mantine. Por isso o tema é leve: o accent laranja (#e8590c) cai em
// `orange[8]` e o hover (#d9480f) em `orange[9]`; o texto secundário (#868e96)
// em `gray[6]` (dimmed); sucesso/erro/info batem com green/red/blue. Nas telas
// usamos as props de cor do Mantine (`c="dimmed"`, `bg="orange.0"`, etc.) em vez
// de hex cru, salvo os tons fora da escala (marrons do hero).
const SYSTEM_FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const theme = createTheme({
  primaryColor: 'orange',
  // Filled usa orange[8] (#e8590c) e escurece no hover para orange[9] (#d9480f).
  primaryShade: 8,
  fontFamily: SYSTEM_FONT,
  headings: { fontFamily: SYSTEM_FONT, fontWeight: '700' },
  defaultRadius: 'md',
});
