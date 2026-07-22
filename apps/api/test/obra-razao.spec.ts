import { razaoObra } from '../src/editais/obra/obra-classifier';
import { EditalFonte } from '../src/editais/edital-fonte.enum';

// Razão da classificação (T-191): o sinal de confiança da fila de revisão.
// 'modalidade' = obra SÓ por ser Concorrência (favor-recall) — a baixa confiança.
const input = (modalidadeId: number, objeto: string) => ({
  fonte: EditalFonte.PNCP,
  modalidadeId,
  objeto,
});

describe('razaoObra (T-191)', () => {
  it('keyword forte → forte', () => {
    expect(razaoObra(input(6, 'Construção de escola municipal'))).toBe('forte');
  });

  it('keyword fraca + verbo → fraco-verbo', () => {
    expect(razaoObra(input(6, 'Execução de rede de esgoto sanitário'))).toBe(
      'fraco-verbo',
    );
  });

  it('modalidade de obra sem keyword → modalidade (baixa confiança)', () => {
    expect(razaoObra(input(4, 'Fornecimento de refeições prontas'))).toBe(
      'modalidade',
    );
  });

  it('modalidade de obra + exclusão clara → nao-obra', () => {
    expect(razaoObra(input(4, 'Locação de veículos para a prefeitura'))).toBe(
      'nao-obra',
    );
  });

  it('pregão sem sinal → nao-obra', () => {
    expect(razaoObra(input(6, 'Aquisição de material de escritório'))).toBe(
      'nao-obra',
    );
  });

  it('coerente com isEditalObra: só nao-obra é falso', () => {
    // (a garantia está no código: isEditalObra = razaoObra !== 'nao-obra')
    expect(razaoObra(input(4, 'Objeto genérico'))).not.toBe('nao-obra');
  });
});
