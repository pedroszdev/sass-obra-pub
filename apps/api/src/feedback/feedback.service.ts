import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Feedback } from './feedback.entity';
import { FeedbackStatus } from './dto/list-feedback.dto';

export interface FeedbackPagina {
  data: Feedback[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 20;

@Injectable()
export class FeedbackService {
  constructor(
    @InjectRepository(Feedback)
    private readonly repo: Repository<Feedback>,
  ) {}

  async criar(dados: {
    userId: string;
    mensagem: string;
    rota?: string;
    versao?: string;
  }): Promise<void> {
    await this.repo.insert({
      userId: dados.userId,
      mensagem: dados.mensagem,
      rota: dados.rota ?? null,
      versao: dados.versao ?? null,
      status: 'novo',
    });
  }

  async listar(opts: {
    status?: FeedbackStatus;
    page: number;
  }): Promise<FeedbackPagina> {
    const [data, total] = await this.repo.findAndCount({
      where: opts.status ? { status: opts.status } : {},
      order: { createdAt: 'DESC' },
      skip: (opts.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
    return { data, total, page: opts.page, pageSize: PAGE_SIZE };
  }

  async atualizarStatus(id: string, status: FeedbackStatus): Promise<void> {
    const r = await this.repo.update(id, { status });
    if (!r.affected) throw new NotFoundException('Feedback não encontrado.');
  }
}
