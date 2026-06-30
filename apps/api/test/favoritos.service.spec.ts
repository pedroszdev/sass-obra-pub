import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Edital } from '../src/editais/edital.entity';
import { EditalFonte } from '../src/editais/edital-fonte.enum';
import { Favorito } from '../src/favoritos/favorito.entity';
import { FavoritosService } from '../src/favoritos/favoritos.service';

const row = (id: string): Edital =>
  ({
    id,
    fonte: EditalFonte.PNCP,
    orgaoNome: 'Município X',
    orgaoCnpj: null,
    uf: 'SC',
    municipioNome: 'Florianópolis',
    codigoIbge: '4205407',
    objeto: 'Pavimentação',
    modalidadeId: 4,
    modalidadeNome: 'Concorrência',
    valorEstimado: 100,
    dataPublicacao: new Date('2026-05-18T10:00:00Z'),
    prazoProposta: null,
    linkOrigem: 'http://x',
    situacao: 'Divulgada no PNCP',
    isObra: true,
    rawPayload: { segredo: 'não vazar' },
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as unknown as Edital;

describe('FavoritosService', () => {
  let service: FavoritosService;
  let favoritos: {
    createQueryBuilder: jest.Mock;
    delete: jest.Mock;
    find: jest.Mock;
  };
  let editais: { count: jest.Mock; find: jest.Mock };
  let aptidao: { vereditosPara: jest.Mock };

  beforeEach(() => {
    favoritos = {
      createQueryBuilder: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
      find: jest.fn(),
    };
    editais = { count: jest.fn(), find: jest.fn() };
    // Por padrão sem veredito (T-82); cada teste pode sobrescrever.
    aptidao = { vereditosPara: jest.fn().mockResolvedValue(new Map()) };
    service = new FavoritosService(
      favoritos as unknown as Repository<Favorito>,
      editais as unknown as Repository<Edital>,
      aptidao as unknown as import('../src/aptidao/aptidao.service').AptidaoService,
    );
  });

  it('add: 404 quando o edital não existe (não insere)', async () => {
    editais.count.mockResolvedValue(0);

    await expect(service.add('u1', 'e1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(favoritos.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('add: insere com ON CONFLICT DO NOTHING (idempotente)', async () => {
    editais.count.mockResolvedValue(1);
    const execute = jest.fn().mockResolvedValue({});
    const qb = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute,
    };
    favoritos.createQueryBuilder.mockReturnValue(qb);

    await service.add('u1', 'e1');

    expect(qb.values).toHaveBeenCalledWith({ userId: 'u1', editalId: 'e1' });
    expect(qb.orIgnore).toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('remove: deleta por (userId, editalId)', async () => {
    await service.remove('u1', 'e1');
    expect(favoritos.delete).toHaveBeenCalledWith({
      userId: 'u1',
      editalId: 'e1',
    });
  });

  it('list: preserva a ordem dos favoritos e não vaza internos', async () => {
    favoritos.find.mockResolvedValue([
      { editalId: 'b', createdAt: new Date('2026-06-02') },
      { editalId: 'a', createdAt: new Date('2026-06-01') },
    ]);
    // editais vêm em ordem arbitrária do banco
    editais.find.mockResolvedValue([row('a'), row('b')]);

    const result = await service.list('u1');

    expect(result.data.map((d) => d.id)).toEqual(['b', 'a']);
    expect(result.data[0]).not.toHaveProperty('rawPayload');
  });

  it('list: sem favoritos não consulta editais', async () => {
    favoritos.find.mockResolvedValue([]);

    const result = await service.list('u1');

    expect(result.data).toEqual([]);
    expect(editais.find).not.toHaveBeenCalled();
  });
});
