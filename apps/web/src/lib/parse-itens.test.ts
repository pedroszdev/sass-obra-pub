import { describe, expect, it } from 'vitest';
import { parseItensColados, parseNum } from './parse-itens';

describe('parseNum', () => {
  it('lê número no padrão brasileiro (milhar . e decimal ,)', () => {
    expect(parseNum('1.234,56')).toBe(1234.56);
    expect(parseNum('  10  ')).toBe(10);
    expect(parseNum('0,5')).toBe(0.5);
  });

  it('vazio ou inválido → null', () => {
    expect(parseNum('')).toBeNull();
    expect(parseNum('   ')).toBeNull();
    expect(parseNum('abc')).toBeNull();
  });
});

describe('parseItensColados', () => {
  it('separa colunas por TAB, ; ou 2+ espaços e converte números', () => {
    const colado = [
      'Escavação manual\tm3\t10\t50,00',
      'Concreto FCK 25;m3;5;450,90',
      'Aço CA-50    kg    120    9,80',
    ].join('\n');

    expect(parseItensColados(colado)).toEqual([
      { descricao: 'Escavação manual', unidade: 'm3', quantidade: 10, precoUnitario: 50 },
      { descricao: 'Concreto FCK 25', unidade: 'm3', quantidade: 5, precoUnitario: 450.9 },
      { descricao: 'Aço CA-50', unidade: 'kg', quantidade: 120, precoUnitario: 9.8 },
    ]);
  });

  it('só descrição → unidade/qtd/preço nulos', () => {
    expect(parseItensColados('Serviço avulso')).toEqual([
      { descricao: 'Serviço avulso', unidade: null, quantidade: null, precoUnitario: null },
    ]);
  });

  it('descarta linhas vazias e sem descrição', () => {
    // 2ª/3ª linhas vazias; 4ª começa com ';' → 1ª coluna vazia (sem descrição).
    const colado = 'Item A\tun\t1\t2\n\n   \n;un;1;2';
    const r = parseItensColados(colado);
    expect(r).toHaveLength(1);
    expect(r[0].descricao).toBe('Item A');
  });
});
