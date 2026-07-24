import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { AdminLgpdService, LgpdPagina } from './admin-lgpd.service';
import { AdminGuard } from './admin.guard';
import { Audit } from './audit.decorator';
import {
  CreateLgpdRequestDto,
  ListLgpdDto,
  UpdateLgpdRequestDto,
} from './dto/lgpd-request.dto';
import { LgpdRequest } from './lgpd-request.entity';

// Fila de solicitações de titular LGPD (T-196). ADMIN-only e auditado — mesmo
// trio do resto do backoffice. SEM step-up: a fila só REGISTRA/acompanha (como as
// notas T-186); a exportação/exclusão de fato segue pelo self-service (T-102).
@UseGuards(JwtAuthGuard, AdminGuard)
@UseInterceptors(AdminAuditInterceptor)
@Controller('admin/lgpd')
export class AdminLgpdController {
  constructor(private readonly lgpd: AdminLgpdService) {}

  // A lista traz e-mails de titulares → acesso a dado pessoal, auditado (LGPD).
  @Audit('lgpd.view')
  @Get()
  listar(@Query() q: ListLgpdDto): Promise<LgpdPagina> {
    return this.lgpd.listar({ status: q.status, page: q.page ?? 1 });
  }

  @Audit('lgpd.create')
  @Post()
  criar(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: CreateLgpdRequestDto,
  ): Promise<LgpdRequest> {
    return this.lgpd.criar(dto, admin.id);
  }

  @Audit('lgpd.update')
  @Patch(':id')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLgpdRequestDto,
  ): Promise<LgpdRequest> {
    return this.lgpd.atualizar(id, dto);
  }
}
