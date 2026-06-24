import { CertidaoTipo } from '../../company-profile/certidao-tipo.enum';

// Exigências de habilitação extraídas de UM edital pela IA (T-49). O formato é
// alinhado ao catálogo de requisitos (T-44) e ao enum CertidaoTipo do perfil
// (T-40), para o cruzamento edital × perfil (T-51) casar sem mapeamento extra.
//
// Tipos de certidão que aparecem em certidoes[]: as fiscais/trabalhista/falência
// + OUTRA. REGISTRO_CONSELHO fica no campo próprio `registroConselho`.
export type ExigenciaCertidaoTipo = Exclude<
  CertidaoTipo,
  CertidaoTipo.REGISTRO_CONSELHO
>;

export interface ExigenciaCertidao {
  tipo: ExigenciaCertidaoTipo;
  exigida: boolean;
  /** Trecho literal do edital que comprova a exigência (ou null). */
  trecho: string | null;
}

export interface ExigenciasHabilitacao {
  /** Objeto da licitação em 1 frase. */
  resumoObjeto: string;
  certidoes: ExigenciaCertidao[];
  registroConselho: {
    exigido: boolean;
    /** CREA, CAU, ambos, ou null. */
    conselho: string | null;
    trecho: string | null;
  };
  capacidadeTecnica: {
    exigida: boolean;
    /** O que os atestados precisam comprovar. */
    descricao: string | null;
    trecho: string | null;
  };
  capitalSocial: {
    exigido: boolean;
    valorMinimoReais: number | null;
    percentualSobreEstimado: number | null;
    trecho: string | null;
  };
  garantia: {
    exigida: boolean;
    trecho: string | null;
  };
  /** Outras exigências de habilitação não cobertas acima. */
  outrosRequisitos: string[];
}
