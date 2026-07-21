import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { capturarErro } from '../common/observabilidade';
import { Edital } from '../editais/edital.entity';
import { EditalFonte } from '../editais/edital-fonte.enum';
import { SyncRun } from '../editais/sync/sync-run.entity';
import { emailPipelineQuebrado } from '../mail/mail.templates';
import { MailService } from '../mail/mail.service';
import { NotificationLog } from '../notificacoes/notification-log.entity';
import { PipelineAlertState } from './pipeline-alert-state.entity';

const HORA_MS = 60 * 60 * 1000;
// Conector com as últimas N execuções TODAS com erro = travado.
const CONECTOR_FALHAS_SEGUIDAS = 3;
// Sem uma captação bem-sucedida há mais de X horas = pipeline parado.
const SEM_SUCESSO_HORAS = 48;
// Janela para "captou mas não alertou".
const CAPTOU_SEM_ALERTAR_HORAS = 24;
// Não repetir o MESMO alerta antes disso (evita spam com o problema persistindo).
const COOLDOWN_HORAS = 12;

type TipoAlerta = 'captacao_parada' | 'conector_travado' | 'captou_sem_alertar';

export interface ResultadoVerificacao {
  problemas: string[];
  enviado: boolean;
}

// Alerta ATIVO de pipeline quebrado (T-189). Painel que exige olhar não protege
// de quebra silenciosa — captação ou alerta parado é risco existencial. Este
// serviço checa e, se algo quebrou, manda e-mail pro dono. Cooldown por tipo, em
// tabela (sobrevive à hibernação do Render, §8).
@Injectable()
export class PipelineHealthAlertService {
  private readonly logger = new Logger(PipelineHealthAlertService.name);

  constructor(
    @InjectRepository(SyncRun)
    private readonly syncRuns: Repository<SyncRun>,
    @InjectRepository(NotificationLog)
    private readonly notificacoes: Repository<NotificationLog>,
    @InjectRepository(Edital)
    private readonly editais: Repository<Edital>,
    @InjectRepository(PipelineAlertState)
    private readonly estado: Repository<PipelineAlertState>,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  // @Cron best-effort (hiberna no free tier, §8) — o gatilho confiável é o
  // endpoint de ops (POST /captacao/verificar-saude), batido pelo cron externo.
  @Cron(CronExpression.EVERY_6_HOURS)
  async cron(): Promise<void> {
    await this.verificarEEnviar().catch((e: unknown) => {
      capturarErro(e, 'pipeline-alert.cron');
      this.logger.error(`Verificação de pipeline falhou: ${this.msg(e)}`);
    });
  }

  async verificarEEnviar(
    now: Date = new Date(),
  ): Promise<ResultadoVerificacao> {
    const detectados = await this.detectar(now);

    // Só alerta o que NÃO está em cooldown — mas um problema novo passa mesmo que
    // outro esteja silenciado (cooldown é por tipo).
    const aEnviar: { tipo: TipoAlerta; texto: string }[] = [];
    for (const d of detectados) {
      if (!(await this.emCooldown(d.tipo, now))) aEnviar.push(d);
    }

    if (aEnviar.length === 0) {
      return { problemas: detectados.map((d) => d.texto), enviado: false };
    }

    const destino = this.config.get<string>('ADMIN_ALERT_EMAIL')?.trim();
    const textos = aEnviar.map((d) => d.texto);
    if (!destino) {
      // Sem destinatário configurado: NÃO marca cooldown (para alertar assim que
      // o e-mail for configurado), mas registra o problema — não some no silêncio.
      this.logger.warn(
        `Pipeline com problema, mas ADMIN_ALERT_EMAIL não está configurado: ${textos.join(' | ')}`,
      );
      return { problemas: detectados.map((d) => d.texto), enviado: false };
    }

    await this.mail.sendMail({ to: destino, ...emailPipelineQuebrado(textos) });
    for (const d of aEnviar) await this.marcarEnviado(d.tipo, now);
    this.logger.warn(`Alerta de pipeline enviado: ${textos.join(' | ')}`);

    return { problemas: detectados.map((d) => d.texto), enviado: true };
  }

  private async detectar(
    now: Date,
  ): Promise<{ tipo: TipoAlerta; texto: string }[]> {
    const [parada, travados, semAlerta] = await Promise.all([
      this.checarCaptacaoParada(now),
      this.checarConectoresTravados(),
      this.checarCaptouSemAlertar(now),
    ]);
    const out: { tipo: TipoAlerta; texto: string }[] = [];
    if (parada) out.push({ tipo: 'captacao_parada', texto: parada });
    for (const t of travados) out.push({ tipo: 'conector_travado', texto: t });
    if (semAlerta) out.push({ tipo: 'captou_sem_alertar', texto: semAlerta });
    return out;
  }

  // Parada: há execuções, mas nenhuma com sucesso nas últimas 48h. Banco novo
  // (zero execuções) NÃO alerta — pode ser só "acabou de subir, o cron ainda não
  // rodou"; o conector travado cobre o caso de "roda e sempre falha".
  private async checarCaptacaoParada(now: Date): Promise<string | null> {
    const total = await this.syncRuns.count();
    if (total === 0) return null;
    const ultimoSucesso = await this.syncRuns.findOne({
      where: { status: 'success' },
      order: { finishedAt: 'DESC' },
    });
    const limite = new Date(now.getTime() - SEM_SUCESSO_HORAS * HORA_MS);
    if (!ultimoSucesso) {
      return `Nenhuma captação bem-sucedida registrada (há execuções, mas todas falharam).`;
    }
    if (ultimoSucesso.finishedAt.getTime() < limite.getTime()) {
      const horas = Math.floor(
        (now.getTime() - ultimoSucesso.finishedAt.getTime()) / HORA_MS,
      );
      return `Captação sem sucesso há ${horas}h (limite: ${SEM_SUCESSO_HORAS}h).`;
    }
    return null;
  }

  private async checarConectoresTravados(): Promise<string[]> {
    const out: string[] = [];
    for (const fonte of Object.values(EditalFonte)) {
      const ultimas = await this.syncRuns.find({
        where: { fonte },
        order: { startedAt: 'DESC' },
        take: CONECTOR_FALHAS_SEGUIDAS,
      });
      if (
        ultimas.length >= CONECTOR_FALHAS_SEGUIDAS &&
        ultimas.every((r) => r.status === 'error')
      ) {
        out.push(
          `Conector ${fonte}: ${CONECTOR_FALHAS_SEGUIDAS} execuções seguidas com erro.`,
        );
      }
    }
    return out;
  }

  // Captou mas não alertou: entraram editais nas últimas 24h e zero alertas
  // saíram. Pode ser falso positivo se genuinamente não há edital APTO a alertar
  // — o cooldown limita o ruído; o sinal vale mais que o risco.
  private async checarCaptouSemAlertar(now: Date): Promise<string | null> {
    const desde = new Date(now.getTime() - CAPTOU_SEM_ALERTAR_HORAS * HORA_MS);
    const [editaisNovos, alertas] = await Promise.all([
      this.editais.count({ where: { createdAt: MoreThanOrEqual(desde) } }),
      this.notificacoes.count({ where: { sentAt: MoreThanOrEqual(desde) } }),
    ]);
    if (editaisNovos > 0 && alertas === 0) {
      return `${editaisNovos} editais captados nas últimas ${CAPTOU_SEM_ALERTAR_HORAS}h, mas 0 alertas enviados.`;
    }
    return null;
  }

  private async emCooldown(tipo: TipoAlerta, now: Date): Promise<boolean> {
    const registro = await this.estado.findOne({ where: { tipo } });
    if (!registro) return false;
    return (
      now.getTime() - registro.lastSentAt.getTime() < COOLDOWN_HORAS * HORA_MS
    );
  }

  private async marcarEnviado(tipo: TipoAlerta, now: Date): Promise<void> {
    await this.estado.upsert({ tipo, lastSentAt: now }, ['tipo']);
  }

  private msg(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }
}
