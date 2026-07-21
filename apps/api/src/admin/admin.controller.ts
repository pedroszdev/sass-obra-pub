import {
  Controller,
  Get,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { AdminAuditService, AuditoriaPagina } from './admin-audit.service';
import { AdminGuard } from './admin.guard';
import { ListAuditDto } from './dto/list-audit.dto';

// Backoffice do dono (BACKLOG Épico 15). Todo o módulo é ADMIN-only e auditado.
//
// Os três metadados valem para o controller inteiro (convenção do módulo — todo
// controller de admin repete este trio):
//   - JwtAuthGuard autentica e popula `req.user`;
//   - AdminGuard exige ADMIN e devolve 404 a qualquer outro (§T-180);
//   - AdminAuditInterceptor grava toda mutação (e GET anotado com @Audit) em
//     admin_audit_log (§T-182).
// FICA FORA do SubscriptionGuard — admin não é rota de produto.
@UseGuards(JwtAuthGuard, AdminGuard)
@UseInterceptors(AdminAuditInterceptor)
@Controller('admin')
export class AdminController {
  constructor(private readonly auditoria: AdminAuditService) {}

  // Sanidade: confirma que a sessão atual é admin e que o guard deixou passar.
  // É o que o front (T-181) sonda para decidir se mostra a área. Um não-admin
  // recebe 404 aqui — idêntico a uma rota inexistente.
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): { id: string; role: string } {
    return { id: user.id, role: user.role };
  }

  // Consulta da trilha de auditoria (T-182): filtro por período e ação, paginado.
  // Não é anotado com @Audit — ler a auditoria não gera auditoria (evita ruído
  // recursivo); o que importa rastrear são as mutações e o acesso a dado pessoal.
  @Get('audit')
  audit(@Query() q: ListAuditDto): Promise<AuditoriaPagina> {
    return this.auditoria.listar({
      desde: q.desde ? new Date(q.desde) : undefined,
      ate: q.ate ? new Date(q.ate) : undefined,
      acao: q.acao,
      page: q.page ?? 1,
      pageSize: q.pageSize ?? 20,
    });
  }
}
