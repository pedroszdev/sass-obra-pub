import { calcularProposta } from '../src/propostas/calculo';

// Motor de cálculo da proposta (T-66) — função pura, backend dono do cálculo.
describe('calcularProposta', () => {
  it('soma subtotais (qtd × preço) no custo direto, sem BDI', () => {
    const r = calcularProposta({
      itens: [
        { quantidade: 10, precoUnitario: 5 }, // 50
        { quantidade: 2.5, precoUnitario: 4 }, // 10
      ],
      bdiPercentual: null,
    });
    expect(r.itens.map((i) => i.subtotal)).toEqual([50, 10]);
    expect(r.custoDireto).toBe(60);
    expect(r.bdiPercentual).toBe(0);
    expect(r.valorBdi).toBe(0);
    expect(r.valorGlobal).toBe(60);
    expect(r.totalItens).toBe(2);
    expect(r.itensSemPreco).toBe(0);
  });

  it('aplica o BDI percentual sobre o custo direto', () => {
    const r = calcularProposta({
      itens: [{ quantidade: 100, precoUnitario: 10 }], // custo direto 1000
      bdiPercentual: 25,
    });
    expect(r.custoDireto).toBe(1000);
    expect(r.bdiPercentual).toBe(25);
    expect(r.valorBdi).toBe(250);
    expect(r.valorGlobal).toBe(1250);
  });

  it('trata item sem preço (ou sem qtd) como subtotal 0 e o sinaliza', () => {
    const r = calcularProposta({
      itens: [
        { quantidade: 10, precoUnitario: 5 }, // 50
        { quantidade: 8, precoUnitario: null }, // sem preço → 0
        { quantidade: null, precoUnitario: 12 }, // sem qtd → 0
      ],
      bdiPercentual: 10,
    });
    expect(r.itens[1]).toEqual({
      subtotal: 0,
      semPreco: true,
      incompleto: false,
    });
    expect(r.itens[2].subtotal).toBe(0);
    expect(r.itens[2].semPreco).toBe(false); // tem preço, falta qtd
    expect(r.itens[2].incompleto).toBe(true); // T-117a: preço sem qtd
    expect(r.custoDireto).toBe(50);
    expect(r.itensSemPreco).toBe(1);
    expect(r.itensIncompletos).toBe(1); // T-117a
    expect(r.valorGlobal).toBe(55);
  });

  it('T-117e: subtotal em centavos inteiros mata o meio-centavo', () => {
    // 12,5 × 0,01 = 0,125 → arredonda para 0,13 (float perderia o dígito).
    const r = calcularProposta({
      itens: [{ quantidade: 12.5, precoUnitario: 0.01 }],
      bdiPercentual: null,
    });
    expect(r.itens[0].subtotal).toBe(0.13);
  });

  it('T-117e: estourar o teto por arredondamento não exibe 100%/0%', () => {
    // valorGlobal levemente acima do teto: o round inteiro não pode mascarar.
    const r = calcularProposta({
      itens: [{ quantidade: 1, precoUnitario: 1000.4 }],
      bdiPercentual: 0,
      valorReferencia: 1000,
    });
    expect(r.comparacao?.abaixoDoTeto).toBe(false);
    expect(r.comparacao?.percentualDoTeto).toBeGreaterThanOrEqual(101);
    expect(r.comparacao?.diferencaPercentual).toBeLessThanOrEqual(-1);
  });

  it('proposta vazia → tudo zero', () => {
    const r = calcularProposta({ itens: [], bdiPercentual: 25 });
    expect(r.custoDireto).toBe(0);
    expect(r.valorBdi).toBe(0);
    expect(r.valorGlobal).toBe(0);
    expect(r.totalItens).toBe(0);
    expect(r.itensSemPreco).toBe(0);
  });

  it('arredonda subtotais a centavos antes de somar (sem ruído de float)', () => {
    // 0.1 × 0.2 = 0.020000000000000004 em float → subtotal 0.02
    const r = calcularProposta({
      itens: [
        { quantidade: 0.1, precoUnitario: 0.2 }, // 0.02
        { quantidade: 1, precoUnitario: 0.1 }, // 0.10
      ],
      bdiPercentual: null,
    });
    expect(r.itens[0].subtotal).toBe(0.02);
    expect(r.custoDireto).toBe(0.12);
  });

  it('T-67: alterar o BDI recalcula o valor global (mesmo custo direto)', () => {
    const itens = [{ quantidade: 100, precoUnitario: 10 }]; // custo direto 1000
    const sem = calcularProposta({ itens, bdiPercentual: 0 });
    const com = calcularProposta({ itens, bdiPercentual: 30 });
    expect(sem.custoDireto).toBe(1000);
    expect(sem.valorGlobal).toBe(1000); // 0% → global = custo direto
    expect(com.custoDireto).toBe(1000); // custo direto não muda com o BDI
    expect(com.valorGlobal).toBe(1300); // 30% → global recalculado
    expect(com.valorGlobal).not.toBe(sem.valorGlobal);
  });

  it('caso real do spike (qtd fracionária × preço sem BDI) com BDI de 25%', () => {
    // item do edital 000863: 28 × 967,49 = 27.089,72 (custo direto, sem BDI)
    const r = calcularProposta({
      itens: [{ quantidade: 28, precoUnitario: 967.49 }],
      bdiPercentual: 25,
    });
    expect(r.custoDireto).toBe(27089.72);
    expect(r.valorBdi).toBe(6772.43);
    expect(r.valorGlobal).toBe(33862.15);
  });

  describe('comparação com o teto do edital (T-69)', () => {
    it('abaixo do teto: economia e diferença % positivas', () => {
      const r = calcularProposta({
        itens: [{ quantidade: 1, precoUnitario: 800 }],
        bdiPercentual: 0,
        valorReferencia: 1000,
      });
      expect(r.valorGlobal).toBe(800);
      expect(r.comparacao).toEqual({
        valorReferencia: 1000,
        economia: 200,
        percentualDoTeto: 80,
        diferencaPercentual: 20,
        abaixoDoTeto: true,
      });
    });

    it('acima do teto: economia negativa e abaixoDoTeto false', () => {
      const r = calcularProposta({
        itens: [{ quantidade: 1, precoUnitario: 1200 }],
        bdiPercentual: 0,
        valorReferencia: 1000,
      });
      expect(r.comparacao?.economia).toBe(-200);
      expect(r.comparacao?.percentualDoTeto).toBe(120);
      expect(r.comparacao?.abaixoDoTeto).toBe(false);
    });

    it('sem valor de referência → comparacao null', () => {
      const r = calcularProposta({
        itens: [{ quantidade: 1, precoUnitario: 800 }],
        bdiPercentual: 0,
        valorReferencia: null,
      });
      expect(r.comparacao).toBeNull();
    });
  });
});
