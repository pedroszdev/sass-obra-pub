import {
  isEditalObra,
  normalizeText,
  ObraClassificationInput,
} from '../src/editais/obra/obra-classifier';
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

  it('exclusão vence até dentro de modalidade de obra', () => {
    expect(
      isEditalObra(input({ objeto: 'Locação de veículos para a prefeitura' })),
    ).toBe(false);
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
