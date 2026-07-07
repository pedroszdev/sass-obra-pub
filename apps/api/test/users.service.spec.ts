import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Municipio } from '../src/geo/municipio.entity';
import { UserMunicipio } from '../src/users/user-municipio.entity';
import { User } from '../src/users/user.entity';
import { UsersService } from '../src/users/users.service';

// QueryBuilder encadeável cujo getRawMany resolve o valor dado.
function fakeQb(rows: unknown[]) {
  const qb: Record<string, jest.Mock> = {};
  for (const m of ['innerJoin', 'select', 'addSelect', 'where', 'orderBy']) {
    qb[m] = jest.fn(() => qb);
  }
  qb.getRawMany = jest.fn().mockResolvedValue(rows);
  return qb;
}

describe('UsersService — municípios preferidos (T-94)', () => {
  let service: UsersService;
  let users: { createQueryBuilder: jest.Mock };
  let userMunicipios: {
    createQueryBuilder: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let municipios: { count: jest.Mock };
  let managerDelete: jest.Mock;
  let managerInsert: jest.Mock;

  beforeEach(() => {
    users = { createQueryBuilder: jest.fn() };
    managerDelete = jest.fn().mockResolvedValue(undefined);
    managerInsert = jest.fn().mockResolvedValue(undefined);
    userMunicipios = {
      createQueryBuilder: jest.fn(() => fakeQb([])),
      manager: {
        transaction: jest.fn((cb: (m: unknown) => Promise<void>) =>
          cb({ delete: managerDelete, insert: managerInsert }),
        ),
      },
    };
    municipios = { count: jest.fn() };
    service = new UsersService(
      users as unknown as Repository<User>,
      userMunicipios as unknown as Repository<UserMunicipio>,
      municipios as unknown as Repository<Municipio>,
    );
  });

  it('rejeita mais de 20 municípios (sem tocar o banco)', async () => {
    const codigos = Array.from({ length: 21 }, (_, i) =>
      String(4200000 + i).padStart(7, '0'),
    );
    await expect(
      service.setMunicipiosPreferidos('u1', codigos),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(municipios.count).not.toHaveBeenCalled();
  });

  it('rejeita código inexistente (count não bate com os únicos)', async () => {
    municipios.count.mockResolvedValue(1); // só 1 dos 2 existe
    await expect(
      service.setMunicipiosPreferidos('u1', ['4200051', '9999999']),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(managerInsert).not.toHaveBeenCalled();
  });

  it('deduplica e substitui numa transação (delete + insert)', async () => {
    municipios.count.mockResolvedValue(1); // 1 código único
    await service.setMunicipiosPreferidos('u1', ['4205407', '4205407']);
    expect(userMunicipios.manager.transaction).toHaveBeenCalledTimes(1);
    expect(managerDelete).toHaveBeenCalledWith(UserMunicipio, { userId: 'u1' });
    expect(managerInsert).toHaveBeenCalledWith(UserMunicipio, [
      { userId: 'u1', codigoIbge: '4205407' },
    ]);
  });

  it('lista vazia limpa tudo e não insere', async () => {
    await service.setMunicipiosPreferidos('u1', []);
    expect(municipios.count).not.toHaveBeenCalled(); // nada a validar
    expect(managerDelete).toHaveBeenCalledWith(UserMunicipio, { userId: 'u1' });
    expect(managerInsert).not.toHaveBeenCalled();
  });

  it('findDistinctUfs une a UF de cadastro com a dos municípios preferidos', async () => {
    users.createQueryBuilder.mockReturnValue(fakeQb([{ uf: 'SC' }]));
    userMunicipios.createQueryBuilder.mockReturnValue(
      fakeQb([{ uf: 'RJ' }, { uf: 'SC' }]),
    );
    const ufs = await service.findDistinctUfs();
    expect([...ufs].sort()).toEqual(['RJ', 'SC']); // sem duplicar SC
  });
});
