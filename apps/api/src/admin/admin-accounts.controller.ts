import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { AdminAccountActionsService } from './admin-account-actions.service';
import { AdminAccountNotesService } from './admin-account-notes.service';
import { AccountNote } from './account-note.entity';
import {
  AccountDetail,
  AccountsPage,
  AdminAccountsService,
} from './admin-accounts.service';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { AdminGuard } from './admin.guard';
import { AdminStepUpGuard } from './admin-stepup.guard';
import { Audit } from './audit.decorator';
import { AccountActionDiasDto } from './dto/account-action.dto';
import { CreateAccountNoteDto } from './dto/account-note.dto';
import { ListAccountsDto } from './dto/list-accounts.dto';

// Contas do beta (T-184/T-185). ADMIN-only e auditado — mesmo trio do
// AdminController. As ações (mutações) são gravadas na trilha pelo interceptor;
// cada uma nomeia o @Audit e devolve o detalhe atualizado da conta.
@UseGuards(JwtAuthGuard, AdminGuard)
@UseInterceptors(AdminAuditInterceptor)
@Controller('admin/accounts')
export class AdminAccountsController {
  constructor(
    private readonly contas: AdminAccountsService,
    private readonly acoes: AdminAccountActionsService,
    private readonly notas: AdminAccountNotesService,
  ) {}

  // ---- Notas internas (T-186) — mini-CRM. Sem step-up (não é destrutivo). ----

  @Get(':id/notas')
  listarNotas(@Param('id', ParseUUIDPipe) id: string): Promise<AccountNote[]> {
    return this.notas.listar(id);
  }

  @Audit('account.note-add')
  @Post(':id/notas')
  adicionarNota(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: CreateAccountNoteDto,
  ): Promise<AccountNote[]> {
    return this.notas.adicionar(id, admin.id, dto.texto);
  }

  @Audit('account.note-remove')
  @Delete(':id/notas/:notaId')
  removerNota(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('notaId', ParseUUIDPipe) notaId: string,
  ): Promise<AccountNote[]> {
    return this.notas.remover(id, notaId);
  }

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

  // ---- Ações (T-185) — todas auditadas; devolvem o detalhe atualizado ----
  // Todas exigem STEP-UP (T-183): mudam a conta de um cliente, então pedem a
  // senha reconfirmada há pouco (modo sudo). Ler (GET acima) não exige.

  @UseGuards(AdminStepUpGuard)
  @Audit('account.extend-trial')
  @Post(':id/estender-trial')
  async estenderTrial(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AccountActionDiasDto,
  ): Promise<AccountDetail> {
    await this.acoes.estenderTrial(id, dto.dias);
    return this.contas.detalhe(id);
  }

  @UseGuards(AdminStepUpGuard)
  @Audit('account.grant-courtesy')
  @Post(':id/cortesia')
  async concederCortesia(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AccountActionDiasDto,
  ): Promise<AccountDetail> {
    await this.acoes.concederCortesia(id, dto.dias);
    return this.contas.detalhe(id);
  }

  @UseGuards(AdminStepUpGuard)
  @Audit('account.revoke-courtesy')
  @Delete(':id/cortesia')
  async revogarCortesia(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AccountDetail> {
    await this.acoes.revogarCortesia(id);
    return this.contas.detalhe(id);
  }

  @UseGuards(AdminStepUpGuard)
  @Audit('account.suspend')
  @Post(':id/suspender')
  async suspender(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AccountDetail> {
    await this.acoes.suspender(id);
    return this.contas.detalhe(id);
  }

  @UseGuards(AdminStepUpGuard)
  @Audit('account.reactivate')
  @Post(':id/reativar')
  async reativar(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AccountDetail> {
    await this.acoes.reativar(id);
    return this.contas.detalhe(id);
  }

  @UseGuards(AdminStepUpGuard)
  @Audit('account.resend-verification')
  @Post(':id/reenviar-verificacao')
  async reenviarVerificacao(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AccountDetail> {
    await this.acoes.reenviarVerificacao(id);
    return this.contas.detalhe(id);
  }

  @UseGuards(AdminStepUpGuard)
  @Audit('account.revoke-sessions')
  @Post(':id/revogar-sessoes')
  async revogarSessoes(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AccountDetail> {
    await this.acoes.revogarSessoes(id);
    return this.contas.detalhe(id);
  }
}
