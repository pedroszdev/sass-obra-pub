import { Controller, Get } from '@nestjs/common';
import { ConfigStoreService, OperationalBanner } from './config-store.service';

// Configuração PÚBLICA em runtime (T-195). Read-only, sem segredo — um aviso de
// manutenção precisa alcançar todo mundo (inclusive a tela de login/anônimo) e
// ser lido a cada carga. Atrás do ThrottlerGuard global; cache curto no service.
@Controller('config')
export class ConfigController {
  constructor(private readonly config: ConfigStoreService) {}

  @Get()
  async publico(): Promise<{ banner: OperationalBanner | null }> {
    return { banner: await this.config.getBannerPublico() };
  }
}
