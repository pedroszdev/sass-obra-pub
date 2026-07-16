import {
  compararPlanos,
  planoDoIntervalo,
  PrecoPlano,
} from '../src/assinaturas/precos';

// Planos e economia do anual (T-131). O que a tela promete ao cliente ("2 meses
// grátis", "economize R$ 298") sai daqui — errar é propaganda enganosa.

const preco = (
  over: Partial<PrecoPlano> & Pick<PrecoPlano, 'plano'>,
): PrecoPlano => ({
  priceId: `price_${over.plano}`,
  valor: 0,
  moeda: 'brl',
  ...over,
});

describe('planoDoIntervalo', () => {
  it('mensal e anual pelo intervalo, não pelo price id', () => {
    expect(planoDoIntervalo('month')).toBe('mensal');
    expect(planoDoIntervalo('year')).toBe('anual');
  });

  it('recorrência que não vendemos → null (não inventa um plano)', () => {
    expect(planoDoIntervalo('week')).toBeNull();
    expect(planoDoIntervalo('day')).toBeNull();
    expect(planoDoIntervalo(undefined)).toBeNull();
  });

  it('intervalo múltiplo (trimestral = 3 meses) → null, não "mensal"', () => {
    // `interval: month, interval_count: 3` é trimestral. Ler só o `interval`
    // chamaria isso de mensal e a tela cobraria a conta errada do cliente.
    expect(planoDoIntervalo('month', 3)).toBeNull();
    expect(planoDoIntervalo('month', 1)).toBe('mensal');
  });
});

describe('compararPlanos', () => {
  // Os preços de produção: R$ 149/mês e R$ 1.490/ano.
  const mensal = preco({ plano: 'mensal', valor: 14_900 });
  const anual = preco({ plano: 'anual', valor: 149_000 });

  it('calcula a economia e os meses grátis', () => {
    const c = compararPlanos(mensal, anual);
    expect(c).not.toBeNull();
    // 14900 * 12 = 178800; 178800 - 149000 = 29800 (R$ 298) = 2 mensalidades.
    expect(c?.economiaAnual).toBe(29_800);
    expect(c?.mesesGratis).toBe(2);
  });

  it('anual sem vantagem → null (a tela não promete economia)', () => {
    const semDesconto = preco({ plano: 'anual', valor: 178_800 });
    expect(compararPlanos(mensal, semDesconto)).toBeNull();
    const maisCaro = preco({ plano: 'anual', valor: 200_000 });
    expect(compararPlanos(mensal, maisCaro)).toBeNull();
  });

  it('arredonda os meses grátis para BAIXO — nunca promete mais do que entrega', () => {
    // Economia de 1,8 mensalidade: prometer "2 meses grátis" seria mentira.
    const quase = preco({ plano: 'anual', valor: 178_800 - 26_820 });
    expect(compararPlanos(mensal, quase)?.mesesGratis).toBe(1);
  });

  it('mensal de graça não divide por zero', () => {
    const gratis = preco({ plano: 'mensal', valor: 0 });
    expect(compararPlanos(gratis, anual)).toBeNull();
  });
});
