import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { capturarErro } from '../common/observabilidade';
import { User } from '../users/user.entity';
import { inativoHaMaisDe } from './acesso';
import { Assinatura } from './assinatura.entity';
import { AssinaturaStatus } from './assinatura-status.enum';

// Exclusão de contas inativas (BACKLOG T-144). Política do dono: os dados ficam
// guardados por 90 dias APÓS o acesso terminar; depois disso a conta é removida.
//
// DESLIGADO POR PADRÃO. Esta é a operação mais IRREVERSÍVEL do sistema: apagar a
// conta faz o cascade completo — perfil, certidões, atestados (+arquivos),
// propostas, favoritos, tudo. Um bug aqui destrói dados de cliente que talvez
// voltasse. Por isso só roda quando o dono setar `EXCLUSAO_INATIVOS_DIAS` (o
// número de dias); ausente/0/negativo = NÃO APAGA NADA (mesmo padrão de cautela
// do teto de IA, T-133). Ligar é uma decisão consciente, não um default.

// Apaga em lotes: um DELETE gigante seguraria lock/memória no free tier.
const LOTE = 500;

export interface ResultadoExclusao {
  excluidos: number;
  /** true quando a feature está desligada (sem env) — nada foi avaliado. */
  desligado: boolean;
}

@Injectable()
export class ExclusaoInativosService {
  private readonly logger = new Logger(ExclusaoInativosService.name);

  constructor(
    @InjectRepository(Assinatura)
    private readonly assinaturas: Repository<Assinatura>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  // Dias de retenção após o fim do acesso. 0/ausente = DESLIGADO (não apaga).
  private get dias(): number {
    const v = Number(this.config.get('EXCLUSAO_INATIVOS_DIAS', 0));
    return Number.isFinite(v) && v > 0 ? v : 0;
  }

  @Cron(CronExpression.EVERY_WEEK)
  async cronSemanal(): Promise<void> {
    if (this.dias <= 0) return; // desligado: o cron nem avalia
    await this.executar().catch((e) => {
      capturarErro(e, 'exclusaoInativos.cron');
      this.logger.error(`Exclusão de inativos (cron) falhou: ${this.msg(e)}`);
    });
  }

  async executar(now: Date = new Date()): Promise<ResultadoExclusao> {
    const dias = this.dias;
    if (dias <= 0) {
      // Guarda dura: sem env, NÃO avalia nem apaga. Fecha a porta a chamar o
      // método direto por engano.
      return { excluidos: 0, desligado: true };
    }

    // Candidatos: quem NÃO está ativo (ativo sempre tem acesso). O recorte fino
    // (o acesso acabou há ≥ N dias) é da função pura `inativoHaMaisDe`, que
    // conhece cada status e nunca apaga quando a data do fim é desconhecida.
    const candidatos = await this.assinaturas.find({
      where: { status: Not(AssinaturaStatus.ACTIVE) },
    });
    const alvos = candidatos.filter((a) => inativoHaMaisDe(a, dias, now));
    if (alvos.length === 0) {
      return { excluidos: 0, desligado: false };
    }

    let excluidos = 0;
    for (let i = 0; i < alvos.length; i += LOTE) {
      const lote = alvos.slice(i, i + LOTE);
      const userIds = lote.map((a) => a.userId);
      // Log de AUDITORIA antes de apagar — a operação é irreversível, e é bom ter
      // no log quem saiu (o Sentry/observabilidade também guarda).
      this.logger.warn(
        `Excluindo ${userIds.length} conta(s) inativa(s) há ≥${dias}d: ${userIds.join(', ')}`,
      );
      // Cascade (mesma FK ON DELETE CASCADE da exclusão LGPD, T-102): apagar o
      // usuário leva perfil, certidões, atestados+arquivos, propostas, favoritos,
      // assinatura, tokens.
      const { affected } = await this.users.delete({ id: In(userIds) });
      excluidos += affected ?? 0;
    }
    this.logger.log(`Exclusão de inativos: ${excluidos} conta(s) removida(s).`);
    return { excluidos, desligado: false };
  }

  private msg(erro: unknown): string {
    return erro instanceof Error ? erro.message : String(erro);
  }
}
