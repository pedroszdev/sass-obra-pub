import {
  calcularCronograma,
  somaPercentual,
} from '../src/propostas/cronograma';

// Cronograma físico-financeiro simples (T-93) — valor por etapa derivado.
describe('cronograma', () => {
  it('deriva o valor de cada etapa do valor global', () => {
    const r = calcularCronograma(
      [
        { descricao: 'Mês 1', percentual: 30 },
        { descricao: 'Mês 2', percentual: 70 },
      ],
      100000,
    );
    expect(r).toEqual([
      { descricao: 'Mês 1', percentual: 30, valor: 30000 },
      { descricao: 'Mês 2', percentual: 70, valor: 70000 },
    ]);
  });

  it('soma os percentuais (para o aviso de 100%)', () => {
    expect(
      somaPercentual([
        { descricao: 'a', percentual: 30 },
        { descricao: 'b', percentual: 70 },
      ]),
    ).toBe(100);
    expect(somaPercentual([{ descricao: 'a', percentual: 30 }])).toBe(30);
  });

  it('null/vazio → [] e 0', () => {
    expect(calcularCronograma(null, 100000)).toEqual([]);
    expect(somaPercentual(null)).toBe(0);
  });

  it('arredonda o valor a centavos', () => {
    const r = calcularCronograma(
      [{ descricao: 'x', percentual: 33.33 }],
      100000,
    );
    expect(r[0].valor).toBe(33330);
  });

  it('T-117c: soma das etapas fecha o valor global (resíduo na última)', () => {
    const r = calcularCronograma(
      [
        { descricao: 'a', percentual: 33.33 },
        { descricao: 'b', percentual: 33.33 },
        { descricao: 'c', percentual: 33.34 },
      ],
      100.1,
    );
    const soma = r.reduce((s, e) => s + e.valor, 0);
    // Sem o resíduo, arredondar cada etapa dava 100,09 ≠ 100,10.
    expect(Math.round(soma * 100) / 100).toBe(100.1);
  });

  it('T-117c: percentuais que não fecham 100 preservam a sub-alocação', () => {
    const r = calcularCronograma(
      [
        { descricao: 'a', percentual: 40 },
        { descricao: 'b', percentual: 40 },
      ],
      1000,
    );
    const soma = r.reduce((s, e) => s + e.valor, 0);
    expect(soma).toBe(800); // 80% alocado — não força 100%
  });
});
