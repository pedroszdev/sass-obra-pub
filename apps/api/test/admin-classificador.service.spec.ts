import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AdminClassificadorService } from '../src/admin/admin-classificador.service';
import { ClassifierReview } from '../src/admin/classifier-review.entity';
import { Edital } from '../src/editais/edital.entity';
import { EditalFonte } from '../src/editais/edital-fonte.enum';

// Fila de revisão do classificador (T-191). A fila fica só com a BAIXA CONFIANÇA
// (obra pela modalidade) e exclui os já revisados; revisar grava o dataset e
// ajusta o isObra.
function edital(
  id: string,
  objeto: string,
  modalidadeId: number,
): Partial<Edital> {
  return {
    id,
    objeto,
    municipioNome: 'Cidade',
    uf: 'SC',
    modalidadeId,
    fonte: EditalFonte.PNCP,
    createdAt: new Date(),
  };
}

function build(opts: {
  obras?: Partial<Edital>[];
  revisados?: string[];
  editalParaRevisar?: Partial<Edital> | null;
}) {
  const editais = {
    find: jest.fn().mockResolvedValue(opts.obras ?? []),
    findOne: jest.fn().mockResolvedValue(opts.editalParaRevisar ?? null),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  } as unknown as Repository<Edital>;
  const reviews = {
    find: jest
      .fn()
      .mockResolvedValue(
        (opts.revisados ?? []).map((editalId) => ({ editalId })),
      ),
    upsert: jest.fn().mockResolvedValue(undefined),
  } as unknown as Repository<ClassifierReview>;
  return {
    service: new AdminClassificadorService(editais, reviews),
    editais,
    reviews,
  };
}

describe('AdminClassificadorService.fila (T-191)', () => {
  it('mantém só baixa confiança (modalidade) e exclui os revisados', async () => {
    const { service } = build({
      obras: [
        edital('e1', 'Objeto genérico', 4), // modalidade → baixa confiança
        edital('e2', 'Construção de escola', 4), // forte → NÃO entra
        edital('e3', 'Outro objeto genérico', 5), // modalidade → baixa confiança
      ],
      revisados: ['e3'], // já revisado → sai
    });
    const r = await service.fila(1);
    expect(r.data.map((x) => x.editalId)).toEqual(['e1']);
    expect(r.total).toBe(1);
  });
});

describe('AdminClassificadorService.revisar (T-191)', () => {
  it('grava o dataset (com a razão original) e ajusta o isObra', async () => {
    const { service, editais, reviews } = build({
      editalParaRevisar: edital('e1', 'Objeto genérico', 4),
    });
    await service.revisar('e1', false); // humano diz: NÃO é obra
    expect(reviews.upsert).toHaveBeenCalledWith(
      { editalId: 'e1', veredito: 'nao_obra', razaoOriginal: 'modalidade' },
      ['editalId'],
    );
    expect(editais.update).toHaveBeenCalledWith('e1', { isObra: false });
  });

  it('404 quando o edital não existe', async () => {
    const { service } = build({ editalParaRevisar: null });
    await expect(service.revisar('zzz', true)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
