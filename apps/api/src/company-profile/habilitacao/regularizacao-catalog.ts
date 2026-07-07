import { CertidaoTipo } from '../certidao-tipo.enum';

// Catálogo de regularização (BACKLOG T-111): para cada tipo de certidão de
// habilitação, ONDE emitir (órgão + link) e uma observação HONESTA de prazo.
// Centralizado aqui (espírito §3.3, como os catálogos de obra/requisitos) —
// ajustável editando esta lista, não espalhe pelo código. Sem IA, dado estático.
//
// Honestidade de prazo (regra do produto): as certidões federais saem na hora
// SE a empresa estiver regular; havendo pendência, regularizar pode levar
// semanas. O catálogo diz isso — não promete "dá tempo" (não sabemos o status
// real da pendência do empreiteiro).

export interface RegularizacaoInfo {
  /** Órgão emissor (PT-BR), já resolvido com a UF quando aplicável. */
  orgao: string;
  /** Link direto de emissão. null quando não há portal nacional confiável
   *  (estadual/municipal/falência/conselho variam por UF — evitamos link quebrado). */
  url: string | null;
  /** Observação de prazo/condição, honesta sobre o "se estiver regular". */
  observacao: string;
}

// Alvos que têm guia de emissão. OUTRA fica de fora (não dá pra saber o órgão).
export type RegularizacaoAlvo = Exclude<CertidaoTipo, CertidaoTipo.OUTRA>;

const IMEDIATA_SE_REGULAR =
  'Emissão online imediata se a empresa estiver regular. Havendo pendência, a regularização pode levar semanas — não deixe para a última hora.';

// UF opcional para os itens cujo emissor é estadual/municipal.
const comUf = (base: string, uf?: string | null): string =>
  uf ? `${base} — ${uf}` : base;

// Devolve onde/como emitir a certidão do tipo, ou null se não houver guia
// (OUTRA). `uf` é a UF da sede do empreiteiro (para Sefaz/TJ/CREA).
export function guiaRegularizacao(
  tipo: RegularizacaoAlvo,
  uf?: string | null,
): RegularizacaoInfo {
  switch (tipo) {
    case CertidaoTipo.CND_FEDERAL:
      return {
        orgao: 'Receita Federal / PGFN',
        url: 'https://solucoes.receita.fazenda.gov.br/Servicos/certidaointernet/PJ/Emitir',
        observacao: IMEDIATA_SE_REGULAR,
      };
    case CertidaoTipo.FGTS:
      return {
        orgao: 'Caixa Econômica Federal',
        url: 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf',
        observacao: IMEDIATA_SE_REGULAR,
      };
    case CertidaoTipo.TRABALHISTA:
      return {
        orgao: 'Justiça do Trabalho (TST)',
        url: 'https://www.tst.jus.br/certidao',
        observacao: IMEDIATA_SE_REGULAR,
      };
    case CertidaoTipo.ESTADUAL:
      return {
        orgao: comUf('Secretaria da Fazenda (Sefaz)', uf),
        url: null,
        observacao:
          'Emitida no site da Secretaria da Fazenda do estado da sede da empresa. Geralmente imediata se estiver regular.',
      };
    case CertidaoTipo.MUNICIPAL:
      return {
        orgao: 'Prefeitura da sede da empresa',
        url: null,
        observacao:
          'Emitida no site da prefeitura do município da sede. O prazo varia de município para município.',
      };
    case CertidaoTipo.FALENCIA:
      return {
        orgao: comUf('Tribunal de Justiça (distribuidor cível/e-SAJ)', uf),
        url: null,
        observacao:
          'Certidão do distribuidor cível, emitida no portal do Tribunal de Justiça do estado da sede.',
      };
    case CertidaoTipo.REGISTRO_CONSELHO:
      return {
        orgao: comUf('CREA (ou CAU, se responsável arquiteto)', uf),
        url: null,
        observacao:
          'Certidão de registro e quitação emitida no CREA do estado da sede (CAU quando o responsável técnico é arquiteto).',
      };
  }
}
