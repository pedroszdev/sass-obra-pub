import {
  isEditalObra,
  ObraClassificationInput,
} from '../src/editais/obra/obra-classifier';
import { normalizeText } from '../src/common/text';
import { EditalFonte } from '../src/editais/edital-fonte.enum';

const input = (
  overrides: Partial<ObraClassificationInput>,
): ObraClassificationInput => ({
  fonte: EditalFonte.PNCP,
  modalidadeId: 4, // Concorrência (modalidade de obra)
  objeto: 'objeto qualquer',
  ...overrides,
});

describe('normalizeText', () => {
  it('remove acentos e baixa a caixa', () => {
    expect(normalizeText('Pavimentação de VIA')).toBe('pavimentacao de via');
  });
});

describe('isEditalObra', () => {
  it('obra real em modalidade de obra → true', () => {
    expect(
      isEditalObra(input({ objeto: 'Pavimentação em concreto e drenagem' })),
    ).toBe(true);
  });

  it('modalidade de obra basta, mesmo sem palavra-chave (favor recall)', () => {
    expect(
      isEditalObra(input({ objeto: 'Contratação de serviços diversos' })),
    ).toBe(true);
  });

  it('exclusão derruba não-obra sem palavra de inclusão, mesmo em modalidade de obra', () => {
    expect(
      isEditalObra(input({ objeto: 'Locação de veículos para a prefeitura' })),
    ).toBe(false);
  });

  // T-115(b): a inclusão vence a exclusão — antes a exclusão rodava primeiro e
  // derrubava obra real.
  it('inclusão vence exclusão: "construção" bate mesmo com "vigilância"', () => {
    expect(
      isEditalObra(
        input({ objeto: 'Construção da sede da Vigilância Sanitária' }),
      ),
    ).toBe(true);
  });

  it('inclusão vence exclusão: "obra" bate mesmo com "locação"', () => {
    expect(
      isEditalObra(input({ objeto: 'Obra com locação de equipamentos' })),
    ).toBe(true);
  });

  it('inclusão vence exclusão: "dragagem" bate mesmo com "limpeza"', () => {
    expect(
      isEditalObra(input({ objeto: 'Dragagem e limpeza de canais' })),
    ).toBe(true);
  });

  it('fora de modalidade de obra, palavra de inclusão captura', () => {
    // modalidade 6 não é de obra; mas o objeto é claramente obra.
    expect(
      isEditalObra(
        input({ modalidadeId: 6, objeto: 'Construção de escola municipal' }),
      ),
    ).toBe(true);
  });

  it('fora de modalidade de obra e sem inclusão → false', () => {
    expect(
      isEditalObra(
        input({
          modalidadeId: 6,
          objeto: 'Aquisição de material de escritório',
        }),
      ),
    ).toBe(false);
  });

  it('normaliza acentos antes de comparar palavras-chave', () => {
    expect(
      isEditalObra(
        input({ modalidadeId: 6, objeto: 'IMPLANTAÇÃO de ciclovia' }),
      ),
    ).toBe(true);
  });
});

// T-125 — refino para pregão/dispensa (mod 6): sem sinal forte não é obra; as
// armadilhas medidas no T-113 (mão de obra, materiais de construção, compra de
// tubos, TI/social por infraestrutura/implantação) deixam de ser falso-positivo.
describe('isEditalObra — refino T-125 (pregão, mod 6)', () => {
  const pregao = (objeto: string) =>
    isEditalObra(input({ modalidadeId: 6, objeto }));

  it('"mão de obra" não é obra (serviço, não execução)', () => {
    expect(pregao('Contratação de mão de obra para roçagem de vias')).toBe(
      false,
    );
  });

  it('"materiais de construção" não é obra (compra, não execução)', () => {
    expect(pregao('Aquisição de materiais de construção')).toBe(false);
    expect(pregao('Fornecimento de material de construção')).toBe(false);
  });

  it('compra de tubos "para drenagem" não é obra (fraca sem execução)', () => {
    expect(pregao('Aquisição de tubos de concreto para drenagem')).toBe(false);
  });

  it('"implantação do núcleo de acolhimento" não é obra (social)', () => {
    expect(pregao('Implantação do núcleo de acolhimento municipal')).toBe(
      false,
    );
  });

  it('"infraestrutura de TI" não é obra (fraca sem execução)', () => {
    expect(pregao('Infraestrutura de rede e PABX para a prefeitura')).toBe(
      false,
    );
  });

  it('sinal forte captura obra real em pregão', () => {
    expect(pregao('Reforma de edificação da escola municipal')).toBe(true);
    expect(pregao('Construção de reservatório de água')).toBe(true);
    expect(pregao('Recapeamento asfáltico de vias urbanas')).toBe(true);
  });

  it('fraca + verbo de execução captura obra de infraestrutura', () => {
    expect(pregao('Execução de rede de esgoto sanitário')).toBe(true);
    expect(pregao('Implantação de galeria de águas pluviais')).toBe(true);
  });

  it('materiais de construção + execução de obra ainda é obra', () => {
    // O strip do negativo não apaga a execução real que coexiste.
    expect(
      pregao('Execução de obra e aquisição de materiais de construção'),
    ).toBe(true);
  });
});
