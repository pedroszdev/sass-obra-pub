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
    expect(r.itens[1]).toEqual({ subtotal: 0, semPreco: true });
    expect(r.itens[2].subtotal).toBe(0);
    expect(r.itens[2].semPreco).toBe(false); // tem preço, falta qtd
    expect(r.custoDireto).toBe(50);
    expect(r.itensSemPreco).toBe(1);
    expect(r.valorGlobal).toBe(55);
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
});
