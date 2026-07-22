import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountNote } from './account-note.entity';

@Injectable()
export class AdminAccountNotesService {
  constructor(
    @InjectRepository(AccountNote)
    private readonly repo: Repository<AccountNote>,
  ) {}

  listar(userId: string): Promise<AccountNote[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async adicionar(
    userId: string,
    autorId: string,
    texto: string,
  ): Promise<AccountNote[]> {
    await this.repo.insert({ userId, autorId, texto: texto.trim() });
    return this.listar(userId);
  }

  async remover(userId: string, notaId: string): Promise<AccountNote[]> {
    const r = await this.repo.delete({ id: notaId, userId });
    if (!r.affected) throw new NotFoundException('Nota não encontrada.');
    return this.listar(userId);
  }
}
