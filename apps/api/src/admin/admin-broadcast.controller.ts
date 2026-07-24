import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import {
  AdminBroadcastService,
  BroadcastPagina,
} from './admin-broadcast.service';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { AdminGuard } from './admin.guard';
import { AdminStepUpGuard } from './admin-stepup.guard';
import { Audit } from './audit.decorator';
import { BetaBroadcast } from './beta-broadcast.entity';
import {
  ListBroadcastDto,
  PreviewBroadcastDto,
  SendBroadcastDto,
} from './dto/broadcast.dto';

// Comunicado ao beta (T-198). ADMIN-only e auditado. Enviar é ação
// OUTWARD-FACING e irreversível (o e-mail já foi) → exige STEP-UP, como as ações
// sensíveis de conta (T-185). Ler o histórico e o preview, não.
@UseGuards(JwtAuthGuard, AdminGuard)
@UseInterceptors(AdminAuditInterceptor)
@Controller('admin/broadcasts')
export class AdminBroadcastController {
  constructor(private readonly broadcast: AdminBroadcastService) {}

  @Get()
  listar(@Query() q: ListBroadcastDto): Promise<BroadcastPagina> {
    return this.broadcast.listar(q.page ?? 1);
  }

  // Quantos destinatários o segmento tem agora (a tela mostra "vai para N").
  @Get('preview')
  preview(@Query() q: PreviewBroadcastDto): Promise<{ total: number }> {
    return this.broadcast.preview(q.segmento);
  }

  @UseGuards(AdminStepUpGuard)
  @Audit('broadcast.send')
  @Post()
  enviar(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: SendBroadcastDto,
  ): Promise<BetaBroadcast> {
    return this.broadcast.enviar(dto, admin.id);
  }
}
