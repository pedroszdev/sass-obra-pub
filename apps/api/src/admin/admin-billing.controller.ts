import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReconciliacaoService } from '../assinaturas/reconciliacao.service';
import {
  AdminBillingService,
  AssinaturasPagina,
  Mrr,
  WebhooksPagina,
} from './admin-billing.service';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { AdminGuard } from './admin.guard';
import { Audit } from './audit.decorator';
import { ListBillingDto } from './dto/list-billing.dto';

// Espelho de assinaturas + webhooks (T-192). ADMIN-only e auditado. O "replay" de
// um webhook perdido é a RECONCILIAÇÃO (T-143): re-lê o estado atual da Stripe e
// corrige — sem mexer no banco à mão.
@UseGuards(JwtAuthGuard, AdminGuard)
@UseInterceptors(AdminAuditInterceptor)
@Controller('admin/billing')
export class AdminBillingController {
  constructor(
    private readonly billing: AdminBillingService,
    private readonly reconciliacao: ReconciliacaoService,
  ) {}

  @Get('assinaturas')
  assinaturas(@Query() q: ListBillingDto): Promise<AssinaturasPagina> {
    return this.billing.listar({ status: q.status, page: q.page ?? 1 });
  }

  @Get('mrr')
  mrr(): Promise<Mrr | null> {
    return this.billing.mrr();
  }

  @Get('webhooks')
  webhooks(@Query() q: ListBillingDto): Promise<WebhooksPagina> {
    return this.billing.webhooks(q.page ?? 1);
  }

  // Replay: reconcilia UMA assinatura (re-lê a Stripe e corrige). Auditado.
  @Audit('billing.reconciliar')
  @HttpCode(HttpStatus.OK)
  @Post('reconciliar/:userId')
  reconciliarUma(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<{ corrigida: boolean; semStripe: boolean }> {
    return this.reconciliacao.reconciliarUsuario(userId);
  }

  // Reconcilia TODAS (a rede de segurança inteira). Auditado.
  @Audit('billing.reconciliar-tudo')
  @HttpCode(HttpStatus.OK)
  @Post('reconciliar')
  reconciliarTudo(): Promise<{ verificadas: number; corrigidas: number }> {
    return this.reconciliacao.reconciliar();
  }
}
