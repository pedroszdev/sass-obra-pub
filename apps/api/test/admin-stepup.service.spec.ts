import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { AdminStepUpService } from '../src/admin/admin-stepup.service';
import { User } from '../src/users/user.entity';

// Step-up do admin (T-183): reconfirmar senha abre a janela de 10 min. Erra
// fechado (senha errada ou conta sem senha não destrava).

const NOW = new Date('2026-07-14T12:00:00Z');

function build(user: Partial<User> | null) {
  const update = jest.fn().mockResolvedValue({ affected: 1 });
  const users = {
    findOne: jest.fn().mockResolvedValue(user),
    update,
  } as unknown as Repository<User>;
  return { service: new AdminStepUpService(users), update };
}

describe('AdminStepUpService (T-183)', () => {
  it('senha correta abre a janela (+10 min) e grava', async () => {
    const hash = await bcrypt.hash('minhasenha', 4);
    const { service, update } = build({ id: 'a1', passwordHash: hash });
    const r = await service.confirmar('a1', 'minhasenha', NOW);
    expect(r.ativo).toBe(true);
    expect(r.expiraEm).toEqual(new Date(NOW.getTime() + 10 * 60 * 1000));
    expect(update).toHaveBeenCalledWith('a1', {
      adminStepupAte: new Date(NOW.getTime() + 10 * 60 * 1000),
    });
  });

  it('senha errada → 401 e NÃO destrava', async () => {
    const hash = await bcrypt.hash('minhasenha', 4);
    const { service, update } = build({ id: 'a1', passwordHash: hash });
    await expect(service.confirmar('a1', 'errada', NOW)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('conta sem senha (só Google) → 400', async () => {
    const { service } = build({ id: 'a1', passwordHash: null });
    await expect(service.confirmar('a1', 'x', NOW)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('status: ativo quando a janela não venceu', async () => {
    const { service } = build({
      id: 'a1',
      adminStepupAte: new Date(NOW.getTime() + 5 * 60 * 1000),
    });
    expect(await service.status('a1', NOW)).toEqual({
      ativo: true,
      expiraEm: new Date(NOW.getTime() + 5 * 60 * 1000),
    });
  });

  it('status: inativo (e expiraEm null) quando venceu', async () => {
    const { service } = build({
      id: 'a1',
      adminStepupAte: new Date(NOW.getTime() - 60 * 1000),
    });
    expect(await service.status('a1', NOW)).toEqual({
      ativo: false,
      expiraEm: null,
    });
  });
});
