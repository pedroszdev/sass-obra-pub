import { filtrarItensUteis } from '../src/editais/itens/itens-filtro';
import { ItemPlanilha } from '../src/editais/itens/itens.types';

const item = (over: Partial<ItemPlanilha>): ItemPlanilha => ({
  codigo: null,
  descricao: 'Escavação manual em solo',
  unidade: 'm³',
  quantidade: 10,
  precoReferencia: 25.5,
  ...over,
});

describe('filtrarItensUteis', () => {
  it('mantém item com descrição e quantidade positiva (inalterado)', () => {
    const out = filtrarItensUteis([item({})]);
    expect(out).toHaveLength(1);
    expect(out[0].quantidade).toBe(10);
    expect(out[0].precoReferencia).toBe(25.5);
  });

  it('mantém item só com descrição (quantidade/preço ausentes)', () => {
    const out = filtrarItensUteis([
      item({ quantidade: null, precoReferencia: null }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].quantidade).toBeNull();
  });

  it('normaliza quantidade/preço zero (ou negativo) para null, mas mantém o item', () => {
    const out = filtrarItensUteis([
      item({ quantidade: 0, precoReferencia: 0 }),
      item({ descricao: 'Aterro', quantidade: -5, precoReferencia: 12 }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].quantidade).toBeNull();
    expect(out[0].precoReferencia).toBeNull();
    expect(out[1].quantidade).toBeNull();
    expect(out[1].precoReferencia).toBe(12);
  });

  it('descarta linhas sem descrição real (vazia, só espaço, só número/símbolo)', () => {
    const out = filtrarItensUteis([
      item({ descricao: '' }),
      item({ descricao: '   ' }),
      item({ descricao: '0' }),
      item({ descricao: '123' }),
      item({ descricao: '-' }),
    ]);
    expect(out).toHaveLength(0);
  });

  it('extração toda zerada/sem descrição → lista vazia (vira INDISPONIVEL no serviço)', () => {
    const out = filtrarItensUteis([
      item({ descricao: '', quantidade: 0, precoReferencia: 0 }),
      item({ descricao: '  ', quantidade: null, precoReferencia: null }),
    ]);
    expect(out).toHaveLength(0);
  });

  it('mistura: mantém os úteis e descarta os vazios', () => {
    const out = filtrarItensUteis([
      item({ descricao: 'Concreto fck 25 MPa' }),
      item({ descricao: '' }),
      item({ descricao: 'Forma de madeira', quantidade: 0 }),
    ]);
    expect(out.map((i) => i.descricao)).toEqual([
      'Concreto fck 25 MPa',
      'Forma de madeira',
    ]);
    expect(out[1].quantidade).toBeNull();
  });

  // T-136 — linhas reais colhidas na T-107 (edital 45550167000164-1-000495/2026,
  // planilha com colunas desalinhadas): a descrição vinha com a unidade. Têm
  // letra e quantidade positiva, então escapavam de `temDescricao`.
  describe('descrição que é só a unidade (T-136)', () => {
    it.each([
      ['UNID.', 'UNID.'],
      ['M2', 'M2'],
      ['M', 'M'],
    ])('descarta descrição "%s" igual à unidade', (descricao, unidade) => {
      expect(filtrarItensUteis([item({ descricao, unidade })])).toEqual([]);
    });

    it('descarta token de unidade mesmo quando a coluna unidade veio vazia', () => {
      // Foi assim que a 1ª rodada da T-107 viu essas linhas: unidade em branco.
      expect(
        filtrarItensUteis([item({ descricao: 'UNID.', unidade: '' })]),
      ).toEqual([]);
    });

    it('ignora acento, caixa e pontuação ao comparar', () => {
      expect(
        filtrarItensUteis([item({ descricao: 'm³', unidade: 'M3' })]),
      ).toEqual([]);
      expect(filtrarItensUteis([item({ descricao: 'Peça' })])).toEqual([]);
    });

    it('NÃO descarta descrição real que apenas começa com uma unidade', () => {
      const out = filtrarItensUteis([
        item({ descricao: 'M2 de alvenaria estrutural', unidade: 'M2' }),
        item({ descricao: 'Lote de tubos de concreto', unidade: 'UN' }),
      ]);
      expect(out).toHaveLength(2);
    });
  });
});
