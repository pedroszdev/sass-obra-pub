import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AccountNote } from '../src/admin/account-note.entity';
import { AdminAccountNotesService } from '../src/admin/admin-account-notes.service';

// Notas internas por conta (T-186). Grava com user+autor, lista desc, 404 ao
// remover inexistente.
function build() {
  const repo = {
    find: jest.fn().mockResolvedValue([]),
    insert: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  } as unknown as Repository<AccountNote>;
  return { service: new AdminAccountNotesService(repo), repo };
}

describe('AdminAccountNotesService (T-186)', () => {
  it('adiciona com userId + autorId e texto trimado', async () => {
    const { service, repo } = build();
    await service.adicionar('u1', 'admin1', '  liguei 12/08  ');
    expect(repo.insert).toHaveBeenCalledWith({
      userId: 'u1',
      autorId: 'admin1',
      texto: 'liguei 12/08',
    });
  });

  it('lista por conta em ordem desc', async () => {
    const { service, repo } = build();
    await service.listar('u1');
    expect(repo.find).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      order: { createdAt: 'DESC' },
    });
  });

  it('remover valida a conta dona (id + userId) e 404 se nada afetado', async () => {
    const { service, repo } = build();
    (repo.delete as jest.Mock).mockResolvedValue({ affected: 0 });
    await expect(service.remover('u1', 'n1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.delete).toHaveBeenCalledWith({ id: 'n1', userId: 'u1' });
  });
});
