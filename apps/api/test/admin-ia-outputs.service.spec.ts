import { Repository } from 'typeorm';
import { AdminIaOutputsService } from '../src/admin/admin-ia-outputs.service';
import { AiOutputReview } from '../src/admin/ai-output-review.entity';
import { Edital } from '../src/editais/edital.entity';
import { EditalExigencias } from '../src/editais/exigencias/edital-exigencias.entity';
import { EditalItensExtracao } from '../src/editais/itens/edital-itens-extracao.entity';

// Conferência de saídas de IA (T-200). O que importa: resumo e exigências saem
// da MESMA linha mas viram entradas separadas; a taxa agrega ok/errado por tipo;
// marcar faz upsert por (tipo, edital).

const T1 = new Date('2026-07-14T10:00:00Z');
const T2 = new Date('2026-07-14T11:00:00Z');

function build(opts: {
  exig?: Partial<EditalExigencias>[];
  itens?: Partial<EditalItensExtracao>[];
  reviews?: Partial<AiOutputReview>[];
  taxaRaw?: { tipo: string; veredito: string; total: string }[];
}) {
  const taxaQb = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(opts.taxaRaw ?? []),
  };
  const exigencias = {
    find: jest.fn().mockResolvedValue(opts.exig ?? []),
  } as unknown as Repository<EditalExigencias>;
  const itens = {
    find: jest.fn().mockResolvedValue(opts.itens ?? []),
  } as unknown as Repository<EditalItensExtracao>;
  const reviews = {
    find: jest.fn().mockResolvedValue(opts.reviews ?? []),
    upsert: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn().mockReturnValue(taxaQb),
  } as unknown as Repository<AiOutputReview>;
  const editais = {
    find: jest
      .fn()
      .mockResolvedValue([
        { id: 'e1', objeto: 'Ponte sobre o rio', municipioNome: 'Cidade A' },
      ]),
  } as unknown as Repository<Edital>;
  return {
    service: new AdminIaOutputsService(exigencias, itens, reviews, editais),
    reviews,
  };
}

describe('AdminIaOutputsService.listar (T-200)', () => {
  it('uma linha de exigências com resumo+exigências vira DUAS entradas', async () => {
    const { service } = build({
      exig: [
        {
          editalId: 'e1',
          resumo: { texto: 'x' } as never,
          exigencias: { itens: [] } as never,
          modelo: 'gpt-5.4-mini',
          custoUsd: 0.01,
          updatedAt: T2,
        },
      ],
    });
    const r = await service.listar({ page: 1, pageSize: 20 });
    const tipos = r.data.map((e) => e.tipo).sort();
    expect(tipos).toEqual(['exigencias', 'resumo']);
    expect(r.data[0].editalObjeto).toBe('Ponte sobre o rio');
    expect(r.total).toBe(2);
  });

  it('aplica o veredito existente às entradas', async () => {
    const { service } = build({
      exig: [
        {
          editalId: 'e1',
          resumo: { texto: 'x' } as never,
          exigencias: null,
          modelo: 'm',
          custoUsd: null,
          updatedAt: T1,
        },
      ],
      reviews: [{ tipo: 'resumo', editalId: 'e1', veredito: 'errado' }],
    });
    const r = await service.listar({ page: 1, pageSize: 20 });
    expect(r.data[0]).toMatchObject({ tipo: 'resumo', veredito: 'errado' });
  });

  it('filtra por tipo (só itens não busca exigências)', async () => {
    const { service } = build({
      itens: [
        {
          editalId: 'e1',
          itens: [{}] as never,
          modelo: 'm',
          custoUsd: null,
          updatedAt: T1,
        },
      ],
    });
    const r = await service.listar({ tipo: 'itens', page: 1, pageSize: 20 });
    expect(r.data).toHaveLength(1);
    expect(r.data[0].tipo).toBe('itens');
  });
});

describe('AdminIaOutputsService.taxaAcerto (T-200)', () => {
  it('agrega ok/errado por tipo e no geral', async () => {
    const { service } = build({
      taxaRaw: [
        { tipo: 'resumo', veredito: 'ok', total: '5' },
        { tipo: 'resumo', veredito: 'errado', total: '1' },
        { tipo: 'itens', veredito: 'ok', total: '2' },
      ],
    });
    const t = await service.taxaAcerto();
    expect(t.porTipo.resumo).toEqual({ ok: 5, errado: 1 });
    expect(t.porTipo.itens).toEqual({ ok: 2, errado: 0 });
    expect(t.geral).toEqual({ ok: 7, errado: 1 });
  });
});

describe('AdminIaOutputsService.marcar (T-200)', () => {
  it('faz upsert por (tipo, edital)', async () => {
    const { service, reviews } = build({});
    await service.marcar({ tipo: 'itens', editalId: 'e1', veredito: 'ok' });
    expect(reviews.upsert).toHaveBeenCalledWith(
      { tipo: 'itens', editalId: 'e1', veredito: 'ok', nota: null },
      ['tipo', 'editalId'],
    );
  });
});
