import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  AccountDetail,
  AccountsPage,
  AdminAccountsService,
} from './admin-accounts.service';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { AdminGuard } from './admin.guard';
import { Audit } from './audit.decorator';
import { ListAccountsDto } from './dto/list-accounts.dto';

// Contas do beta (T-184). ADMIN-only e auditado — mesmo trio do AdminController.
@UseGuards(JwtAuthGuard, AdminGuard)
@UseInterceptors(AdminAuditInterceptor)
@Controller('admin/accounts')
export class AdminAccountsController {
  constructor(private readonly contas: AdminAccountsService) {}

  @Get()
  listar(@Query() q: ListAccountsDto): Promise<AccountsPage> {
    return this.contas.listar({
      email: q.email,
      cnpj: q.cnpj,
      status: q.status,
      emailVerificado: q.emailVerificado,
      cadastradoDe: q.cadastradoDe ? new Date(q.cadastradoDe) : undefined,
      cadastradoAte: q.cadastradoAte ? new Date(q.cadastradoAte) : undefined,
      page: q.page ?? 1,
      pageSize: q.pageSize ?? 20,
    });
  }

  // Ver o detalhe de uma conta é ACESSO A DADO PESSOAL → auditado (LGPD, §5). O
  // @Audit faz o interceptor gravar mesmo sendo GET (T-182).
  @Audit('account.view')
  @Get(':id')
  detalhe(@Param('id', ParseUUIDPipe) id: string): Promise<AccountDetail> {
    return this.contas.detalhe(id);
  }
}
