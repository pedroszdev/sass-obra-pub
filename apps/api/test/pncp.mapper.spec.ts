import {
  mapPncpRecord,
  parsePncpDate,
} from '../src/editais/connectors/pncp/pncp.mapper';
import { PncpContratacao } from '../src/editais/connectors/pncp/pncp.types';
import { EditalFonte } from '../src/editais/edital-fonte.enum';

// Registro real retornado pelo PNCP (SC), reduzido ao que o mapper usa.
const registroReal: PncpContratacao = {
  numeroControlePNCP: '82892373000189-1-000020/2026',
  orgaoEntidade: {
    razaoSocial: 'MUNICIPIO DE GOVERNADOR CELSO RAMOS',
    cnpj: '82892373000189',
  },
  unidadeOrgao: {
    ufSigla: 'SC',
    municipioNome: 'Governador Celso Ramos',
    codigoIbge: '4206009',
  },
  objetoCompra:
    'Contratação de empresa especializada para execução dos serviços de pavimentação',
  modalidadeId: 4,
  modalidadeNome: 'Concorrência - Eletrônica',
  valorTotalEstimado: 811261.27,
  dataPublicacaoPncp: '2026-05-18T07:00:58',
  dataEncerramentoProposta: '2026-06-09T14:00:00',
  linkSistemaOrigem: 'https://cnetmobile.estaleiro.serpro.gov.br/...',
  situacaoCompraNome: 'Divulgada no PNCP',
};

describe('mapPncpRecord', () => {
  it('mapeia o registro real do PNCP para o formato padronizado', () => {
    const r = mapPncpRecord(registroReal);

    expect(r.fonte).toBe(EditalFonte.PNCP);
    expect(r.idExterno).toBe('82892373000189-1-000020/2026');
    expect(r.orgaoNome).toBe('MUNICIPIO DE GOVERNADOR CELSO RAMOS');
    expect(r.orgaoCnpj).toBe('82892373000189');
    expect(r.uf).toBe('SC');
    expect(r.municipioNome).toBe('Governador Celso Ramos');
    expect(r.codigoIbge).toBe('4206009');
    expect(r.objeto).toContain('pavimentação');
    expect(r.modalidadeId).toBe(4);
    expect(r.modalidadeNome).toBe('Concorrência - Eletrônica');
    expect(r.valorEstimado).toBe(811261.27);
    expect(r.situacao).toBe('Divulgada no PNCP');
    // rawPayload preserva o registro original inteiro.
    expect(r.rawPayload).toBe(registroReal);
  });

  it('interpreta datas do PNCP como horário de Brasília (-03:00)', () => {
    const r = mapPncpRecord(registroReal);
    // 07:00:58 em Brasília = 10:00:58 UTC
    expect(r.dataPublicacao.toISOString()).toBe('2026-05-18T10:00:58.000Z');
    expect(r.prazoProposta?.toISOString()).toBe('2026-06-09T17:00:00.000Z');
  });

  it('trata campos opcionais ausentes como null', () => {
    const semOpcionais: PncpContratacao = {
      ...registroReal,
      orgaoEntidade: { razaoSocial: 'Órgão X', cnpj: null },
      unidadeOrgao: {
        ufSigla: 'SC',
        municipioNome: 'Cidade',
        codigoIbge: null,
      },
      valorTotalEstimado: null,
      dataEncerramentoProposta: null,
      linkSistemaOrigem: null,
      situacaoCompraNome: null,
    };
    const r = mapPncpRecord(semOpcionais);

    expect(r.orgaoCnpj).toBeNull();
    expect(r.codigoIbge).toBeNull();
    expect(r.valorEstimado).toBeNull();
    expect(r.prazoProposta).toBeNull();
    expect(r.linkOrigem).toBeNull();
    expect(r.situacao).toBeNull();
  });

  // T-115(a): orçamento sigiloso (art. 24) chega com valorTotalEstimado = 0 —
  // não pode virar "R$ 0" nem entrar em faixas de valor.
  it('mapeia valor sigiloso (0) para null', () => {
    const sigiloso: PncpContratacao = {
      ...registroReal,
      valorTotalEstimado: 0,
      orcamentoSigilosoCodigo: 2,
      orcamentoSigilosoDescricao: 'Sigiloso',
    };
    expect(mapPncpRecord(sigiloso).valorEstimado).toBeNull();
  });

  it('mapeia valor negativo (dado inconsistente) para null', () => {
    const negativo: PncpContratacao = {
      ...registroReal,
      valorTotalEstimado: -1,
    };
    expect(mapPncpRecord(negativo).valorEstimado).toBeNull();
  });

  // T-118a: clamps para não estourar as colunas e envenenar a captação da UF.
  it('valor acima do teto de numeric(15,2) → null', () => {
    const gigante: PncpContratacao = {
      ...registroReal,
      valorTotalEstimado: 1e14, // > 9.999.999.999.999,99
    };
    expect(mapPncpRecord(gigante).valorEstimado).toBeNull();
  });

  it('trunca strings ao tamanho da coluna (orgaoNome 255)', () => {
    const longo: PncpContratacao = {
      ...registroReal,
      orgaoEntidade: { razaoSocial: 'X'.repeat(400), cnpj: '1'.repeat(30) },
    };
    const r = mapPncpRecord(longo);
    expect(r.orgaoNome).toHaveLength(255);
    expect(r.orgaoCnpj).toHaveLength(14);
  });

  // T-119d: só http(s) vira link clicável — scheme perigoso → null.
  it('linkOrigem com scheme perigoso (javascript:) → null', () => {
    const malicioso: PncpContratacao = {
      ...registroReal,
      linkSistemaOrigem: 'javascript:alert(document.cookie)',
    };
    expect(mapPncpRecord(malicioso).linkOrigem).toBeNull();
  });

  it('linkOrigem http(s) é preservado', () => {
    expect(
      mapPncpRecord({ ...registroReal, linkSistemaOrigem: 'https://ok.gov.br/e' })
        .linkOrigem,
    ).toBe('https://ok.gov.br/e');
  });
});

describe('parsePncpDate', () => {
  it('devolve null para entrada vazia', () => {
    expect(parsePncpDate(null)).toBeNull();
  });

  it('respeita o fuso quando já vem na string', () => {
    expect(parsePncpDate('2026-05-18T10:00:58Z')?.toISOString()).toBe(
      '2026-05-18T10:00:58.000Z',
    );
  });
});
