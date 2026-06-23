// Tipos de certidão de habilitação que a licitação de obra pública costuma
// exigir. Enum estruturado (não texto livre) de propósito: o motor de prontidão
// (BACKLOG T-44/T-45) cruza "certidão que o empreiteiro tem" × "requisito do
// edital" — só dá para casar de forma confiável com tipos padronizados.
// OUTRA cobre o que fugir desta lista, com o detalhe em Certidao.descricao.
//
// Cobertura: habilitação fiscal/social/trabalhista (Lei 14.133/2021, art. 68 —
// CND_FEDERAL já inclui a regularidade previdenciária/INSS desde 2014),
// econômico-financeira (art. 69 — FALENCIA) e técnica (art. 67 —
// REGISTRO_CONSELHO, a certidão de registro e quitação CREA/CAU, que vence e é
// exigida em todo edital de obra). Os campos de registro do conselho ficam no
// CompanyProfile; aqui mora a certidão com validade (alimenta o alerta da T-43).
export enum CertidaoTipo {
  CND_FEDERAL = 'CND_FEDERAL', // Certidão Negativa de Débitos Federais (RFB/PGFN)
  FGTS = 'FGTS', // Certificado de Regularidade do FGTS (CRF)
  TRABALHISTA = 'TRABALHISTA', // CNDT — débitos trabalhistas (TST)
  ESTADUAL = 'ESTADUAL', // Regularidade fiscal estadual
  MUNICIPAL = 'MUNICIPAL', // Regularidade fiscal municipal
  FALENCIA = 'FALENCIA', // Negativa de falência/recuperação judicial
  REGISTRO_CONSELHO = 'REGISTRO_CONSELHO', // Certidão de registro e quitação CREA/CAU
  OUTRA = 'OUTRA', // Qualquer outra — detalhar em descricao
}
