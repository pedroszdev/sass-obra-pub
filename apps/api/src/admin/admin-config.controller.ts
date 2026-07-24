import {
  Body,
  Controller,
  Get,
  Put,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import {
  ConfigStoreService,
  OperationalBanner,
} from '../config/config-store.service';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { AdminGuard } from './admin.guard';
import { Audit } from './audit.decorator';
import { SetBannerDto, SetTrialDiasDto } from './dto/config.dto';

export interface ConfigAdmin {
  banner: OperationalBanner;
  trialDias: number;
}

// Escrita da config operacional (T-195). ADMIN-only e auditado. SEM step-up:
// editar config não é destrutivo a uma conta (como notas T-186 / LGPD T-196). A
// leitura pública mora no ConfigController (módulo config), fora do admin.
@UseGuards(JwtAuthGuard, AdminGuard)
@UseInterceptors(AdminAuditInterceptor)
@Controller('admin/config')
export class AdminConfigController {
  constructor(private readonly config: ConfigStoreService) {}

  @Get()
  async atual(): Promise<ConfigAdmin> {
    const [banner, trialDias] = await Promise.all([
      this.config.getBanner(),
      this.config.getTrialDias(),
    ]);
    return { banner, trialDias };
  }

  @Audit('config.banner')
  @Put('banner')
  salvarBanner(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: SetBannerDto,
  ): Promise<OperationalBanner> {
    return this.config.setBanner(dto, admin.id);
  }

  @Audit('config.trial-dias')
  @Put('trial-dias')
  async salvarTrialDias(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: SetTrialDiasDto,
  ): Promise<{ dias: number }> {
    return { dias: await this.config.setTrialDias(dto.dias, admin.id) };
  }
}
