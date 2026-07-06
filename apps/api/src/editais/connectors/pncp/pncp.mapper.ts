import { Uf } from '../../../common/uf';
import { EditalFonte } from '../../edital-fonte.enum';
import { EditalSourceRecord } from '../edital-source-record';
import { PncpContratacao } from './pncp.types';

// As datas do PNCP vêm sem fuso (ex.: "2026-05-18T07:00:58") e são horário de
// Brasília. Anexamos o offset -03:00 para o instante não deslocar o dia.
export function parsePncpDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }
  const hasTimezone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value);
  return new Date(hasTimezone ? value : `${value}-03:00`);
}

// Teto da coluna valorEstimado (numeric(15,2)): 13 dígitos inteiros + 2 decimais.
const VALOR_ESTIMADO_MAX = 9_999_999_999_999.99;

// Orçamento sigiloso (Lei 14.133 art. 24) chega do PNCP com valorTotalEstimado = 0
// (o indicador real está em orcamentoSigilosoCodigo/Descricao). Zero/negativo/ausente
// não é um valor de verdade → null, senão o front mostra "R$ 0" e o filtro de faixa
// enfia a obra milionária dentro de "Até R$ 80 mil". A busca já trata null como
// favor-recall e o front como "Não informado". Valor absurdo (> numeric(15,2))
// também vira null — senão estoura a coluna e envenena a captação da UF (T-118a).
function mapValorEstimado(raw: PncpContratacao): number | null {
  const value = raw.valorTotalEstimado;
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  if (value > VALOR_ESTIMADO_MAX) {
    return null;
  }
  return value;
}

// Trunca ao tamanho da coluna (T-118a): um campo gigante da fonte não pode
// estourar o varchar e derrubar a ingestão da UF inteira. null passa direto.
function clamp(value: string | null, max: number): string | null {
  if (value == null) return null;
  return value.length > max ? value.slice(0, max) : value;
}

// Só http(s) vira link clicável (T-119d): o linkSistemaOrigem vem de milhares de
// sistemas municipais heterogêneos; um scheme perigoso (ex.: `javascript:`)
// viraria XSS ao ser usado como `href` no front. Sanitiza uma vez, na captação.
function sanitizeUrl(value: string | null): string | null {
  if (!value) return null;
  const v = value.trim();
  return /^https?:\/\//i.test(v) ? v : null;
}

// Mapeia um registro cru do PNCP para o formato interno padronizado.
// É o coração do conector (CLAUDE.md §3.1) — puro e testável.
export function mapPncpRecord(raw: PncpContratacao): EditalSourceRecord {
  // Strings truncadas ao tamanho da coluna (T-118a). `uf` e `dataPublicacao`
  // (NaN quando ilegível) NÃO são consertados aqui — a ingestão valida e PULA o
  // registro inválido em vez de gravar lixo (uf inexistente / data inválida).
  return {
    fonte: EditalFonte.PNCP,
    idExterno: (clamp(raw.numeroControlePNCP, 100) ?? '') as string,
    orgaoNome: clamp(raw.orgaoEntidade.razaoSocial, 255) ?? '',
    orgaoCnpj: clamp(raw.orgaoEntidade.cnpj ?? null, 14),
    uf: raw.unidadeOrgao.ufSigla as Uf,
    municipioNome: clamp(raw.unidadeOrgao.municipioNome, 255) ?? '',
    codigoIbge: clamp(raw.unidadeOrgao.codigoIbge ?? null, 7),
    objeto: raw.objetoCompra,
    modalidadeId: raw.modalidadeId,
    modalidadeNome: clamp(raw.modalidadeNome, 100) ?? '',
    valorEstimado: mapValorEstimado(raw),
    dataPublicacao: parsePncpDate(raw.dataPublicacaoPncp) ?? new Date(NaN),
    prazoProposta: parsePncpDate(raw.dataEncerramentoProposta),
    linkOrigem: sanitizeUrl(raw.linkSistemaOrigem ?? null),
    situacao: clamp(raw.situacaoCompraNome ?? null, 100),
    rawPayload: raw,
  };
}
