import {
  rankFormato,
  scorePlanilhaNome,
} from '../src/editais/itens/planilha-select';

// Seleção da planilha orçamentária (T-64) — inverso da seleção de exigências.
describe('scorePlanilhaNome', () => {
  it('pontua planilha orçamentária/quantitativos no topo (3)', () => {
    expect(scorePlanilhaNome('Planilha Orçamentária.xlsx')).toBe(3);
    expect(scorePlanilhaNome('PLANILHA DE QUANTITATIVOS')).toBe(3);
    expect(scorePlanilhaNome('Orçamento Sintético')).toBe(3);
  });

  it('pontua "orçamento" (2) e "planilha"/"quantitativo" (1)', () => {
    expect(scorePlanilhaNome('Orçamento da obra')).toBe(2);
    expect(scorePlanilhaNome('Planilha de serviços')).toBe(1);
    expect(scorePlanilhaNome('Quantitativos')).toBe(1);
  });

  it('o edital e docs neutros pontuam 0', () => {
    expect(scorePlanilhaNome('Edital de Pregão 042/2026')).toBe(0);
    expect(scorePlanilhaNome('Aviso de licitação')).toBe(0);
  });

  it('exclui falsos positivos conhecidos (-1)', () => {
    for (const nome of [
      'Composição de custos',
      'Demonstrativo de BDI',
      'Cronograma físico-financeiro',
      'ART do responsável',
      'Banco de preços SINAPI',
      'Pesquisa de preços',
      'Memorial descritivo',
      'Minuta do contrato',
      'Planilha modelo do licitante', // template vazio
    ]) {
      expect(scorePlanilhaNome(nome)).toBe(-1);
    }
  });

  it('nome nulo/vazio → 0', () => {
    expect(scorePlanilhaNome(null)).toBe(0);
    expect(scorePlanilhaNome('')).toBe(0);
  });

  it('rankFormato: xlsx > pdf > resto', () => {
    expect(rankFormato('xlsx')).toBe(2);
    expect(rankFormato('pdf')).toBe(1);
    expect(rankFormato('xls')).toBe(0);
  });
});
