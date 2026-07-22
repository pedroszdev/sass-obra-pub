import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { MailLog } from '../mail/mail-log.entity';

const PAGE_SIZE = 20;

export interface MailLogPagina {
  data: MailLog[];
  total: number;
  page: number;
  pageSize: number;
}

// Leitura do log de e-mails (T-193). Read-only; o write é do MailLogService.
@Injectable()
export class AdminMailLogService {
  constructor(
    @InjectRepository(MailLog)
    private readonly repo: Repository<MailLog>,
  ) {}

  async listar(opts: {
    email?: string;
    status?: string;
    page: number;
  }): Promise<MailLogPagina> {
    const where: Record<string, unknown> = {};
    if (opts.email?.trim()) where.para = ILike(`%${opts.email.trim()}%`);
    if (opts.status) where.status = opts.status;
    const [data, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (opts.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
    return { data, total, page: opts.page, pageSize: PAGE_SIZE };
  }
}
