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
  PrecosAssinatura,
} from '../config/config-store.service';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { AdminGuard } from './admin.guard';
import { Audit } from './audit.decorator';
import {
  SetBannerDto,
  SetPrecosDto,
  SetTermsVersionDto,
  SetTrialDiasDto,
} from './dto/config.dto';

export interface ConfigAdmin {
  banner: OperationalBanner;
  trialDias: number;
  termsVersion: string | null;
  /** Preço dos planos em centavos. `null` = não configurado (Asaas dá 503). */
  precos: PrecosAssinatura | null;
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
    const [banner, trialDias, termsVersion, precos] = await Promise.all([
      this.config.getBanner(),
      this.config.getTrialDias(),
      this.config.getTermsVersion(),
      this.config.getPrecos(),
    ]);
    return { banner, trialDias, termsVersion, precos };
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

  // Versão vigente dos termos (T-196). Subir a versão força o re-aceite de todo
  // mundo — ação sensível, mas não destrutiva a uma conta (auditada, sem step-up
  // como as demais config). Só surte efeito quando o texto da T-179 estiver no ar.
  @Audit('config.terms-version')
  @Put('terms-version')
  async salvarTermsVersion(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: SetTermsVersionDto,
  ): Promise<{ termsVersion: string | null }> {
    return {
      termsVersion: await this.config.setTermsVersion(dto.versao, admin.id),
    };
  }

  // Preço da assinatura (T-213, Épico 17).
  //
  // 🔴 Este endpoint EXISTE porque o Asaas não tem catálogo de preços — o §8
  // dizia "o preço nunca é escrito do nosso lado", e essa regra morreu com a
  // Stripe. Aqui o preço muda **sem deploy** e com **registro de quem mudou**
  // (auditoria + `updatedByAdminId`), que era o valor real da regra antiga.
  //
  // ⚠️ Sem preço configurado, a cobrança pelo Asaas responde **503** em vez de
  // inventar valor. No dinheiro, falhar fechado é a única opção.
  @Audit('config.precos')
  @Put('precos')
  async salvarPrecos(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: SetPrecosDto,
  ): Promise<PrecosAssinatura> {
    return this.config.setPrecos(
      { mensalCentavos: dto.mensalCentavos, anualCentavos: dto.anualCentavos },
      admin.id,
    );
  }
}
