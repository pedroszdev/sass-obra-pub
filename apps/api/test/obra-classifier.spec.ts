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
