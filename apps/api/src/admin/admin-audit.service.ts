import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminAuditLog } from './admin-audit-log.entity';

// Entrada de um registro de auditoria (montada pelo interceptor).
export interface RegistroAuditoria {
  adminUserId: string;
  action: string;
  method: string;
  path: string;
  targetId: string | null;
  statusCode: number;
  ip: string | null;
  summary: Record<string, unknown> | null;
}

export interface FiltroAuditoria {
  desde?: Date;
  ate?: Date;
  acao?: string;
  page: number;
  pageSize: number;
}

export interface AuditoriaPagina {
  data: AdminAuditLog[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class AdminAuditService {
  constructor(
    @InjectRepository(AdminAuditLog)
    private readonly repo: Repository<AdminAuditLog>,
  ) {}

  // Grava um registro. NÃO deve derrubar a requisição do admin se falhar (a ação
  // já aconteceu) — o interceptor engole o erro e reporta ao Sentry.
  async registrar(r: RegistroAuditoria): Promise<void> {
    // save (não insert): o insert usa QueryDeepPartialEntity, que trata a coluna
    // jsonb `summary` como entidade aninhada e não tipa. Sem id, save só insere.
    await this.repo.save(
      this.repo.create({
        adminUserId: r.adminUserId,
        action: r.action,
        method: r.method,
        path: r.path,
        targetId: r.targetId,
        statusCode: r.statusCode,
        ip: r.ip,
        summary: r.summary,
      }),
    );
  }

  async listar(f: FiltroAuditoria): Promise<AuditoriaPagina> {
    const qb = this.repo
      .createQueryBuilder('a')
      .orderBy('a.created_at', 'DESC')
      .skip((f.page - 1) * f.pageSize)
      .take(f.pageSize);

    if (f.desde) qb.andWhere('a.created_at >= :desde', { desde: f.desde });
    if (f.ate) qb.andWhere('a.created_at <= :ate', { ate: f.ate });
    if (f.acao) qb.andWhere('a.action = :acao', { acao: f.acao });

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page: f.page, pageSize: f.pageSize };
  }
}
