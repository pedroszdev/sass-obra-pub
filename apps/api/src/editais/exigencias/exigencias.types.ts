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

/** Sobre qual número o edital exige o mínimo econômico-financeiro (T-141). */
export type QualificacaoBase = 'CAPITAL_SOCIAL' | 'PATRIMONIO_LIQUIDO';

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
  /**
   * Qualificação econômico-financeira (T-141). A Lei 14.133 art. 69 permite
   * exigir **capital social** OU **patrimônio líquido** mínimo — e o edital
   * costuma usar PL. O campo cobre os dois; `base` diz qual deles o edital pede.
   *
   * `base` é opcional: extrações anteriores à T-141 (cache, §3.4) não a têm.
   * Ausente = tratar como CAPITAL_SOCIAL (comportamento histórico).
   */
  capitalSocial: {
    exigido: boolean;
    base?: QualificacaoBase | null;
    valorMinimoReais: number | null;
    percentualSobreEstimado: number | null;
    trecho: string | null;
  };
  garantia: {
    exigida: boolean;
    trecho: string | null;
  };
  /**
   * Habilitação por registro cadastral (T-138). Editais que remetem ao **SICAF**
   * (ou cadastro equivalente) não enumeram CND/FGTS/CNDT — o sistema as verifica.
   * Sem este campo, a extração vinha vazia e o veredito virava `indefinido`.
   *
   * Opcional pelo mesmo motivo de `base`: o cache anterior à T-138 não a tem.
   */
  habilitacaoPorRegistroCadastral?: {
    aplicavel: boolean;
    /** Nome do sistema (ex.: "SICAF"), quando o edital o nomeia. */
    sistema: string | null;
    trecho: string | null;
  } | null;
  /** Outras exigências de habilitação não cobertas acima. */
  outrosRequisitos: string[];
}

// Resumo de 1 página gerado pela IA (T-50). Sai na MESMA chamada da extração
// ("um motor, dois diferenciais"). Foca no que só está no PDF — objeto/valor/
// prazo de proposta já são campos estruturados do Edital e a tela mostra esses.
export interface DataChave {
  /** Ex.: "Sessão de abertura", "Visita técnica". */
  evento: string;
  /** Data ou descrição (ex.: "12/07/2026 às 09h", "facultativa"). */
  quando: string;
}

export interface ResumoEdital {
  /** Visão geral do escopo da obra em 2-4 frases, linguagem simples. */
  visaoGeral: string;
  /** Prazo de execução da obra, se o edital informar (ex.: "180 dias"). */
  prazoExecucao: string | null;
  datasChave: DataChave[];
  /** Pontos de atenção reais do edital (visita, garantia, índices, consórcio…). */
  pontosDeAtencao: string[];
}

// Saída completa da chamada de IA: exigências (T-49) + resumo (T-50).
export type ExtracaoIa = ExigenciasHabilitacao & { resumo: ResumoEdital };
