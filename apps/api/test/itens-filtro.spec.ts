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
});
