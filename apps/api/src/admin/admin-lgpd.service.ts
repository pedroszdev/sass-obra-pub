import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreateLgpdRequestDto,
  UpdateLgpdRequestDto,
} from './dto/lgpd-request.dto';
import { LgpdRequest, LgpdStatus } from './lgpd-request.entity';

export interface LgpdPagina {
  data: LgpdRequest[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 20;
// Prazo de resposta ao titular (art. 19 LGPD): 15 dias.
const PRAZO_DIAS = 15;
// Status terminais — ao chegar num deles, a solicitação foi resolvida.
const TERMINAIS: LgpdStatus[] = ['atendida', 'recusada'];

// Fila de solicitações LGPD do backoffice (T-196). Só REGISTRA/acompanha — a
// exportação/exclusão de fato segue pelo self-service (T-102) ou manual.
@Injectable()
export class AdminLgpdService {
  constructor(
    @InjectRepository(LgpdRequest)
    private readonly repo: Repository<LgpdRequest>,
  ) {}

  async criar(
    dto: CreateLgpdRequestDto,
    adminId: string,
    now: Date = new Date(),
  ): Promise<LgpdRequest> {
    const prazo = new Date(now.getTime() + PRAZO_DIAS * 24 * 60 * 60 * 1000);
    const registro = this.repo.create({
      tipo: dto.tipo,
      requesterEmail: dto.requesterEmail,
      descricao: dto.descricao ?? null,
      userId: dto.userId ?? null,
      status: 'aberta',
      prazo,
      createdByAdminId: adminId,
    });
    return this.repo.save(registro);
  }

  async listar(opts: {
    status?: LgpdStatus;
    page: number;
  }): Promise<LgpdPagina> {
    const [data, total] = await this.repo.findAndCount({
      where: opts.status ? { status: opts.status } : {},
      // Mais urgente primeiro: o prazo que vence antes fica no topo.
      order: { prazo: 'ASC' },
      skip: (opts.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
    return { data, total, page: opts.page, pageSize: PAGE_SIZE };
  }

  async atualizar(
    id: string,
    dto: UpdateLgpdRequestDto,
    now: Date = new Date(),
  ): Promise<LgpdRequest> {
    const registro = await this.repo.findOne({ where: { id } });
    if (!registro) throw new NotFoundException('Solicitação não encontrada.');

    registro.status = dto.status;
    if (dto.resolucao !== undefined) registro.resolucao = dto.resolucao;
    // Carimba o atendimento na 1ª vez que vira terminal; não sobrescreve (mantém
    // a data real do fechamento mesmo que o status seja tocado de novo).
    if (TERMINAIS.includes(dto.status) && !registro.atendidaEm) {
      registro.atendidaEm = now;
    }
    return this.repo.save(registro);
  }
}
