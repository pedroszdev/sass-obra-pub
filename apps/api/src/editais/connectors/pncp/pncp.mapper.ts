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

// Orçamento sigiloso (Lei 14.133 art. 24) chega do PNCP com valorTotalEstimado = 0
// (o indicador real está em orcamentoSigilosoCodigo/Descricao). Zero/negativo/ausente
// não é um valor de verdade → null, senão o front mostra "R$ 0" e o filtro de faixa
// enfia a obra milionária dentro de "Até R$ 80 mil". A busca já trata null como
// favor-recall e o front como "Não informado".
function mapValorEstimado(raw: PncpContratacao): number | null {
  const value = raw.valorTotalEstimado;
  if (value == null || value <= 0) {
    return null;
  }
  return value;
}

// Mapeia um registro cru do PNCP para o formato interno padronizado.
// É o coração do conector (CLAUDE.md §3.1) — puro e testável.
export function mapPncpRecord(raw: PncpContratacao): EditalSourceRecord {
  return {
    fonte: EditalFonte.PNCP,
    idExterno: raw.numeroControlePNCP,
    orgaoNome: raw.orgaoEntidade.razaoSocial,
    orgaoCnpj: raw.orgaoEntidade.cnpj ?? null,
    uf: raw.unidadeOrgao.ufSigla as Uf,
    municipioNome: raw.unidadeOrgao.municipioNome,
    codigoIbge: raw.unidadeOrgao.codigoIbge ?? null,
    objeto: raw.objetoCompra,
    modalidadeId: raw.modalidadeId,
    modalidadeNome: raw.modalidadeNome,
    valorEstimado: mapValorEstimado(raw),
    dataPublicacao: parsePncpDate(raw.dataPublicacaoPncp) ?? new Date(NaN),
    prazoProposta: parsePncpDate(raw.dataEncerramentoProposta),
    linkOrigem: raw.linkSistemaOrigem ?? null,
    situacao: raw.situacaoCompraNome ?? null,
    rawPayload: raw,
  };
}
