import { CertidaoTipo } from '../src/company-profile/certidao-tipo.enum';
import { diagnosticarEdital } from '../src/company-profile/habilitacao/diagnostico-edital';
import { ProntidaoInput } from '../src/company-profile/habilitacao/habilitacao-checks';
import { avaliarProntidao } from '../src/company-profile/habilitacao/prontidao';
import { guiaRegularizacao } from '../src/company-profile/habilitacao/regularizacao-catalog';
import { ExigenciasHabilitacao } from '../src/editais/exigencias/exigencias.types';

const NOW = new Date('2026-06-23T12:00:00Z');

const vazio: ProntidaoInput = {
  certidoes: [],
  atestadosCount: 0,
  capitalSocial: null,
  registroProfissionalTipo: null,
  registroProfissionalNumero: null,
  uf: 'SC',
};

function exig(
  over: Partial<ExigenciasHabilitacao> = {},
): ExigenciasHabilitacao {
  return {
    resumoObjeto: 'Obra',
    certidoes: [],
    registroConselho: { exigido: false, conselho: null, trecho: null },
    capacidadeTecnica: { exigida: false, descricao: null, trecho: null },
    capitalSocial: {
      exigido: false,
      valorMinimoReais: null,
      percentualSobreEstimado: null,
      trecho: null,
    },
    garantia: { exigida: false, trecho: null },
    outrosRequisitos: [],
    ...over,
  };
}

describe('guiaRegularizacao — catálogo (T-111)', () => {
  it('certidões federais têm link direto de emissão', () => {
    expect(guiaRegularizacao(CertidaoTipo.CND_FEDERAL).url).toMatch(
      /receita\.fazenda/,
    );
    expect(guiaRegularizacao(CertidaoTipo.FGTS).url).toMatch(/caixa/);
    expect(guiaRegularizacao(CertidaoTipo.TRABALHISTA).url).toMatch(/tst\.jus/);
  });

  it('observação federal é honesta sobre pendência ("se estiver regular")', () => {
    expect(guiaRegularizacao(CertidaoTipo.CND_FEDERAL).observacao).toMatch(
      /se a empresa estiver regular/i,
    );
  });

  it('resolve o órgão por UF (Sefaz/TJ/CREA); sem UF, sem sufixo', () => {
    expect(guiaRegularizacao(CertidaoTipo.ESTADUAL, 'SC').orgao).toContain(
      'SC',
    );
    expect(guiaRegularizacao(CertidaoTipo.FALENCIA, 'RJ').orgao).toContain(
      'RJ',
    );
    expect(
      guiaRegularizacao(CertidaoTipo.REGISTRO_CONSELHO, 'MG').orgao,
    ).toContain('MG');
    // Sem UF: o rótulo não ganha " — UF".
    expect(guiaRegularizacao(CertidaoTipo.ESTADUAL).orgao).not.toContain('—');
  });

  it('estadual/municipal/falência/conselho não trazem link (evita link quebrado)', () => {
    expect(guiaRegularizacao(CertidaoTipo.ESTADUAL, 'SC').url).toBeNull();
    expect(guiaRegularizacao(CertidaoTipo.MUNICIPAL).url).toBeNull();
    expect(guiaRegularizacao(CertidaoTipo.FALENCIA, 'SC').url).toBeNull();
    expect(
      guiaRegularizacao(CertidaoTipo.REGISTRO_CONSELHO, 'SC').url,
    ).toBeNull();
  });
});

describe('Prontidão genérica decorada com guia (T-111)', () => {
  it('pendência de certidão ganha o guia de regularização', () => {
    const { itens } = avaliarProntidao(vazio, NOW);
    const federal = itens.find((i) => i.key === 'regularidade_federal');
    expect(federal?.status).toBe('nao_atendido');
    expect(federal?.regularizacao?.orgao).toMatch(/Receita/);
  });

  it('registro no conselho pendente ganha guia com a UF', () => {
    const { itens } = avaliarProntidao(vazio, NOW);
    const registro = itens.find((i) => i.key === 'registro_conselho');
    expect(registro?.regularizacao?.orgao).toContain('SC');
  });

  it('capital social pendente NÃO tem guia (não é certidão a emitir)', () => {
    const { itens } = avaliarProntidao(vazio, NOW);
    const capital = itens.find((i) => i.key === 'capital_social');
    expect(capital?.status).toBe('nao_atendido');
    expect(capital?.regularizacao).toBeUndefined();
  });

  it('certidão válida (atendida) não traz guia', () => {
    const daqui90 = new Date(NOW);
    daqui90.setDate(daqui90.getDate() + 90);
    const input: ProntidaoInput = {
      ...vazio,
      certidoes: [
        {
          tipo: CertidaoTipo.CND_FEDERAL,
          dataValidade: daqui90.toISOString().slice(0, 10),
        },
      ],
    };
    const { itens } = avaliarProntidao(input, NOW);
    const federal = itens.find((i) => i.key === 'regularidade_federal');
    expect(federal?.status).toBe('atendido');
    expect(federal?.regularizacao).toBeUndefined();
  });
});

describe('Diagnóstico por edital: guia + prazo (T-111)', () => {
  const exigCndFederal = exig({
    certidoes: [
      { tipo: CertidaoTipo.CND_FEDERAL, exigida: true, trecho: null },
    ],
  });

  it('pendência ganha guia e o resultado traz diasAtePrazo', () => {
    const prazo = new Date('2026-06-30T12:00:00Z'); // 7 dias após NOW
    const r = diagnosticarEdital(exigCndFederal, vazio, NOW, null, prazo);
    const item = r.itens.find((i) => i.key === 'certidao:CND_FEDERAL');
    expect(item?.status).toBe('nao_atendido');
    expect(item?.regularizacao?.url).toMatch(/receita\.fazenda/);
    expect(r.diasAtePrazo).toBe(7);
  });

  it('sem prazo no edital, diasAtePrazo é null', () => {
    const r = diagnosticarEdital(exigCndFederal, vazio, NOW, null, null);
    expect(r.diasAtePrazo).toBeNull();
  });

  it('prazo com fração de dia arredonda para cima (ceil)', () => {
    const prazo = new Date('2026-06-25T00:00:00Z'); // ~1,5 dia após NOW
    const r = diagnosticarEdital(exigCndFederal, vazio, NOW, null, prazo);
    expect(r.diasAtePrazo).toBe(2);
  });
});
