import { describe, expect, it } from 'vitest';
import {
  nomePlano,
  precoBRL,
  rotuloEconomia,
  rotuloStatusFatura,
  sufixoPlano,
} from './precos';

describe('precoBRL', () => {
  // O Intl separa "R$" do número com um espaço NÃO-SEPARÁVEL (U+00A0), não com
  // um espaço comum. Nomear o caractere evita a próxima pessoa perder 20 minutos
  // com uma comparação "obviamente igual" que falha.
  const nbsp = '\u00a0';

  it('omite os centavos quando são zero', () => {
    expect(precoBRL(149_000)).toBe(`R$${nbsp}1.490`);
    expect(precoBRL(14_900)).toBe(`R$${nbsp}149`);
  });

  it('mostra os centavos quando existem — nunca arredonda o preço de alguém', () => {
    expect(precoBRL(14_990)).toBe(`R$${nbsp}149,90`);
    expect(precoBRL(99)).toBe(`R$${nbsp}0,99`);
  });

  it('zero é R$ 0', () => {
    expect(precoBRL(0)).toBe(`R$${nbsp}0`);
  });
});

describe('sufixoPlano / nomePlano', () => {
  it('rotula os dois planos', () => {
    expect(sufixoPlano('mensal')).toBe('/mês');
    expect(sufixoPlano('anual')).toBe('/ano');
    expect(nomePlano('mensal')).toBe('Plano mensal');
    expect(nomePlano('anual')).toBe('Plano anual');
  });
});

describe('rotuloEconomia', () => {
  it('pluraliza', () => {
    expect(rotuloEconomia(2)).toBe('2 meses grátis');
    expect(rotuloEconomia(1)).toBe('1 mês grátis');
  });

  it('sem vantagem → null (a tela não promete nada)', () => {
    expect(rotuloEconomia(0)).toBeNull();
    expect(rotuloEconomia(null)).toBeNull();
  });
});

describe('rotuloStatusFatura', () => {
  it('traduz os status da Stripe', () => {
    expect(rotuloStatusFatura('paid').texto).toBe('Paga');
    expect(rotuloStatusFatura('open').texto).toBe('Em aberto');
    expect(rotuloStatusFatura('void').texto).toBe('Cancelada');
  });

  it('status desconhecido não vira tela em branco', () => {
    expect(rotuloStatusFatura('esquisito').texto).toBe('esquisito');
  });
});
