import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Feedback } from '../src/feedback/feedback.entity';
import { FeedbackService } from '../src/feedback/feedback.service';

// Fila de feedback in-app (T-202). Trava o que grava, o filtro por status e o 404.

function build() {
  const repo = {
    insert: jest.fn().mockResolvedValue(undefined),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  } as unknown as Repository<Feedback>;
  return { service: new FeedbackService(repo), repo };
}

describe('FeedbackService (T-202)', () => {
  it('grava com userId, rota e status novo', async () => {
    const { service, repo } = build();
    await service.criar({
      userId: 'u1',
      mensagem: 'a planilha travou',
      rota: '/orcamentos/1',
    });
    expect(repo.insert).toHaveBeenCalledWith({
      userId: 'u1',
      mensagem: 'a planilha travou',
      rota: '/orcamentos/1',
      versao: null,
      status: 'novo',
    });
  });

  it('lista sem filtro passa where vazio', async () => {
    const { service, repo } = build();
    await service.listar({ page: 1 });
    expect((repo.findAndCount as jest.Mock).mock.calls[0][0].where).toEqual({});
  });

  it('lista por status filtra', async () => {
    const { service, repo } = build();
    await service.listar({ status: 'novo', page: 2 });
    const arg = (repo.findAndCount as jest.Mock).mock.calls[0][0];
    expect(arg.where).toEqual({ status: 'novo' });
    expect(arg.skip).toBe(20); // (2-1)*20
  });

  it('atualizarStatus lança 404 quando nada é afetado', async () => {
    const { service, repo } = build();
    (repo.update as jest.Mock).mockResolvedValue({ affected: 0 });
    await expect(service.atualizarStatus('x', 'lido')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
