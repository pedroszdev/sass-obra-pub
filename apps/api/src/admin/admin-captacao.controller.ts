import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CaptacaoJobService } from '../captacao/captacao-job.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { AdminCaptacaoService, PainelCaptacao } from './admin-captacao.service';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { AdminGuard } from './admin.guard';
import { Audit } from './audit.decorator';

// Painel de captação e jobs (T-188). ADMIN-only e auditado — mesmo trio do módulo.
// Os disparos são ASSÍNCRONOS (fire-and-forget): retornam na hora "disparado" ou
// "já em execução"; o resultado aparece no painel (sync_runs) e nos logs. O lock
// contra execução dupla mora nos próprios services (runOnce/dispararTudo).
@UseGuards(JwtAuthGuard, AdminGuard)
@UseInterceptors(AdminAuditInterceptor)
@Controller('admin/captacao')
export class AdminCaptacaoController {
  constructor(
    private readonly painelService: AdminCaptacaoService,
    private readonly captacao: CaptacaoJobService,
    private readonly notificacoes: NotificacoesService,
  ) {}

  @Get()
  painel(): Promise<PainelCaptacao> {
    return this.painelService.painel();
  }

  @Audit('captacao.run')
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('run')
  rodarCaptacao(): { status: 'disparado' | 'em_execucao' } {
    if (this.captacao.emExecucao) return { status: 'em_execucao' };
    // Fire-and-forget: o runOnce guarda a reentrância e loga o resultado. O
    // .catch é obrigatório — sem ele uma rejeição não tratada derruba o processo.
    void this.captacao.runOnce().catch(() => undefined);
    return { status: 'disparado' };
  }

  @Audit('notificacoes.run')
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('notificacoes/run')
  rodarNotificacoes(): { status: 'disparado' | 'em_execucao' } {
    if (this.notificacoes.emExecucao) return { status: 'em_execucao' };
    void this.notificacoes.dispararTudo().catch(() => undefined);
    return { status: 'disparado' };
  }
}
