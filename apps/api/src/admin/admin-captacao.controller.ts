import {
  Body,
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
import { RodarCaptacaoDto } from './dto/rodar-captacao.dto';

// Resultado do disparo de notificações: as contagens por etapa, para o admin ver
// que rodou de verdade (0 = ninguém elegível agora, não "quebrado").
export interface DisparoNotificacoesResposta {
  status: 'concluido' | 'em_execucao';
  usuariosNotificaveis?: number;
  alertas?: number;
  obrasDoDia?: number;
  renovacoes?: number;
}

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

  // `ufs` no corpo: capta SÓ essas UFs (T-188, o dono escolhe); vazio = demanda.
  @Audit('captacao.run')
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('run')
  rodarCaptacao(@Body() dto: RodarCaptacaoDto): {
    status: 'disparado' | 'em_execucao';
  } {
    if (this.captacao.emExecucao) return { status: 'em_execucao' };
    const ufs = dto.ufs?.length ? dto.ufs : undefined;
    // Fire-and-forget: a captação leva minutos (paginando o PNCP). O runOnce
    // guarda a reentrância e loga o resultado; o .catch é obrigatório.
    void this.captacao.runOnce(ufs).catch(() => undefined);
    return { status: 'disparado' };
  }

  // SÍNCRONO (não fire-and-forget): o disparo é rápido no beta e o admin precisa
  // ver o RESULTADO — 0 enviados significa "ninguém elegível", não "quebrado".
  @Audit('notificacoes.run')
  @Post('notificacoes/run')
  async rodarNotificacoes(): Promise<DisparoNotificacoesResposta> {
    const r = await this.notificacoes.dispararTudo();
    if (r === null) return { status: 'em_execucao' };
    return { status: 'concluido', ...r };
  }
}
