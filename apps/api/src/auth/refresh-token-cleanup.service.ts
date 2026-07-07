import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshToken } from './refresh-token.entity';

// Purga de refresh tokens (T-104). A tabela só crescia: a rotação marca `revoked`
// e emite um novo, mas nada apagava os velhos. Removemos os expirados (inúteis) e
// os revogados com mais de 24h (mantém os recém-revogados por um respiro de
// auditoria/corrida de rotação — ver T-119c).
const GRACA_REVOGADO_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class RefreshTokenCleanupService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RefreshTokenCleanupService.name);

  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
  ) {}

  // Roda uma vez ao subir: no Render free o serviço hiberna e o @Cron não é
  // confiável (mesmo caveat da captação T-18) — o boot garante ao menos uma passada.
  async onApplicationBootstrap(): Promise<void> {
    await this.purgar().catch((erro) => {
      // Best-effort: um problema de banco aqui não pode derrubar o boot.
      this.logger.warn(`Purga de tokens no boot falhou: ${String(erro)}`);
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgarAgendado(): Promise<void> {
    await this.purgar();
  }

  // Apaga tokens mortos. Retorna quantos removeu (para log e teste).
  async purgar(now: Date = new Date()): Promise<number> {
    const graca = new Date(now.getTime() - GRACA_REVOGADO_MS);
    const resultado = await this.refreshTokens
      .createQueryBuilder()
      .delete()
      .where('expires_at < :now', { now })
      .orWhere('(revoked = true AND created_at < :graca)', { graca })
      .execute();
    const removidos = resultado.affected ?? 0;
    if (removidos > 0) {
      this.logger.log(`Refresh tokens purgados: ${removidos}`);
    }
    return removidos;
  }
}
