// Forma (parcial) da resposta da API de consulta do PNCP. Só tipamos o que o
// conector usa; o registro inteiro é preservado em `rawPayload`.

export interface PncpOrgaoEntidade {
  razaoSocial: string;
  cnpj: string | null;
  [key: string]: unknown;
}

export interface PncpUnidadeOrgao {
  ufSigla: string;
  municipioNome: string;
  codigoIbge: string | null;
  [key: string]: unknown;
}

export interface PncpContratacao {
  numeroControlePNCP: string;
  orgaoEntidade: PncpOrgaoEntidade;
  unidadeOrgao: PncpUnidadeOrgao;
  objetoCompra: string;
  modalidadeId: number;
  modalidadeNome: string;
  valorTotalEstimado: number | null;
  dataPublicacaoPncp: string;
  dataEncerramentoProposta: string | null;
  linkSistemaOrigem: string | null;
  situacaoCompraNome: string | null;
  // Demais campos do PNCP — preservados em rawPayload.
  [key: string]: unknown;
}

export interface PncpResponse {
  data: PncpContratacao[];
  totalRegistros: number;
  totalPaginas: number;
  numeroPagina: number;
  paginasRestantes: number;
  empty: boolean;
}
