import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailLog } from './mail-log.entity';

// Processa o evento de entrega do webhook do Resend (T-193) e o casa com a linha
// de envio pelo `provider_message_id`. O status de ENTREGA fecha o ciclo que o
// nível de envio (T-193 v1) não via: o e-mail saiu, mas chegou? deu bounce?

export type DeliveryStatus = 'entregue' | 'bounce' | 'reclamacao' | 'atrasado';

// Tipos do Resend que nos interessam → status interno. Os demais são ignorados
// (ex.: email.sent, que já cobrimos no envio; email.opened/clicked, fora do escopo).
const MAPA: Record<string, DeliveryStatus> = {
  'email.delivered': 'entregue',
  'email.bounced': 'bounce',
  'email.complained': 'reclamacao',
  'email.delivery_delayed': 'atrasado',
};

// Precedência: um sinal NEGATIVO definitivo (bounce/reclamação) não é sobrescrito
// por um positivo/transitório que chegue depois (os eventos podem vir fora de
// ordem, como na Stripe). Mesmo rank = no-op → idempotência para reentrega.
const RANK: Record<DeliveryStatus, number> = {
  atrasado: 1,
  entregue: 2,
  reclamacao: 3,
  bounce: 3,
};

export interface ResendEvent {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    reason?: string;
    bounce?: { message?: string };
  };
}

export interface ResultadoWebhook {
  status: 'aplicado' | 'ignorado' | 'sem_correspondencia';
  motivo?: string;
}

@Injectable()
export class ResendWebhookService {
  private readonly logger = new Logger(ResendWebhookService.name);

  constructor(
    @InjectRepository(MailLog)
    private readonly repo: Repository<MailLog>,
  ) {}

  async processar(evento: ResendEvent): Promise<ResultadoWebhook> {
    const status = evento.type ? MAPA[evento.type] : undefined;
    if (!status) return { status: 'ignorado', motivo: `tipo ${evento.type}` };

    const emailId = evento.data?.email_id;
    if (!emailId) return { status: 'ignorado', motivo: 'sem email_id' };

    const linha = await this.repo.findOne({
      where: { providerMessageId: emailId },
    });
    if (!linha) return { status: 'sem_correspondencia', motivo: emailId };

    // Guarda de ordem: negativo definitivo vence positivo/transitório posterior;
    // mesmo rank não sobrescreve (reentrega do mesmo evento = no-op).
    const atual = linha.deliveryStatus as DeliveryStatus | null;
    if (atual && RANK[atual] >= RANK[status]) {
      return { status: 'ignorado', motivo: `mantém ${atual}` };
    }

    const quando = this.parseData(evento.created_at);
    const detalhe = evento.data?.bounce?.message ?? evento.data?.reason ?? null;
    await this.repo.update(
      { providerMessageId: emailId },
      {
        deliveryStatus: status,
        deliveryAt: quando,
        deliveryDetalhe: detalhe ? detalhe.slice(0, 2000) : null,
      },
    );
    this.logger.log(`Entrega ${status} para ${emailId} (${evento.type}).`);
    return { status: 'aplicado' };
  }

  private parseData(iso?: string): Date {
    if (!iso) return new Date();
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }
}
