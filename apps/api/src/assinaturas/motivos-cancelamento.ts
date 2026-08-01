// Motivos de cancelamento (T-217). Lista FECHADA, e é ela que dá valor ao dado:
// texto livre puro vira 40 respostas diferentes para a mesma coisa e não se
// agrupa. O campo livre existe ao lado, como complemento, não como substituto.
//
// ⚠️ Os códigos são a chave gravada no banco — **não os renomeie**. O rótulo é
// da tela e pode mudar à vontade; o código, mudando, quebra a leitura do
// histórico já coletado.
//
// A lista foi escrita para o público real: empreiteiro de obra pública em beta.
// "Não achei obras da minha região" é o motivo que mais interessa ao produto —
// ele aponta buraco de COBERTURA (§3.1), não de preço.
export const MOTIVOS_CANCELAMENTO = [
  'caro',
  'sem_obras',
  'dificil',
  'outra_ferramenta',
  'parei_de_licitar',
  'temporario',
  'outro',
] as const;

export type MotivoCancelamento = (typeof MOTIVOS_CANCELAMENTO)[number];

/** Rótulos em pt-BR — usados no /admin e no e-mail, não só na tela. */
export const ROTULO_MOTIVO: Record<MotivoCancelamento, string> = {
  caro: 'Está caro para o meu momento',
  sem_obras: 'Não encontrei obras da minha região',
  dificil: 'Achei difícil de usar',
  outra_ferramenta: 'Vou usar outra ferramenta',
  parei_de_licitar: 'Parei de participar de licitações',
  temporario: 'Só vou parar por um tempo',
  outro: 'Outro motivo',
};
