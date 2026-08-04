import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigStoreModule } from '../config/config-store.module';
import { PipelineAlertState } from '../captacao/pipeline-alert-state.entity';
import { MailModule } from '../mail/mail.module';
import { User } from '../users/user.entity';
import { Assinatura } from './assinatura.entity';
import { AssinaturasController } from './assinaturas.controller';
import { AssinaturasService } from './assinaturas.service';
import { AsaasBillingService } from './asaas-billing.service';
import { AsaasEvent } from './asaas-event.entity';
import { AsaasReconciliacaoService } from './asaas-reconciliacao.service';
import { NfseEmitida } from './nfse-emitida.entity';
import { NfseService } from './nfse.service';
import { ReembolsoService } from './reembolso.service';
import { AsaasWebhookController } from './asaas-webhook.controller';
import { AsaasWebhookService } from './asaas-webhook.service';
import { AsaasClientProvider } from './asaas.provider';
import { ExclusaoInativosService } from './exclusao-inativos.service';
import { ReconciliacaoController } from './reconciliacao.controller';
import { SubscriptionGuard } from './subscription.guard';

// Assinatura + trial (T-127) e cobrança pela Stripe (T-128). O paywall (T-130)
// e o webhook (T-129) ainda não existem.
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Assinatura,
      User,
      AsaasEvent,
      // T-223: cooldown dos alertas de billing. Reusa a tabela da T-189, que é
      // chaveada por TIPO justamente para caber mais de um assunto.
      PipelineAlertState,
      // Marca de NFS-e emitida a mao (T-219).
      NfseEmitida,
    ]),
    ConfigStoreModule, // dias de trial editáveis (T-195)
    MailModule, // confirmação de cancelamento (T-217)
  ],
  controllers: [
    AssinaturasController,
    AsaasWebhookController,
    ReconciliacaoController,
  ],
  providers: [
    AsaasReconciliacaoService,
    NfseService,
    ReembolsoService,
    AssinaturasService,
    // Asaas (Épico 17) — convive com a Stripe até o corte (T-224). Nenhum
    // controller o chama ainda: T-212 entrega só o cliente.
    AsaasBillingService,
    AsaasWebhookService,
    AsaasClientProvider,
    SubscriptionGuard,
    ExclusaoInativosService,
  ],
  // StripeBillingService sai daqui para o aviso de renovação (T-158) ler o PREÇO
  // da Stripe — ele não pode vir do nosso banco (T-131), senão o e-mail anunciaria
  // um valor e o cartão seria debitado noutro.
  exports: [
    AssinaturasService,
    // Régua de inadimplência (T-220): as notificações precisam saber COMO cada
    // conta paga — cartão retenta sozinho, boleto/Pix não.
    AsaasBillingService,
    SubscriptionGuard,
    // Idem para o Asaas (T-223) — o botão que a T-221 adiou para cá.
    AsaasReconciliacaoService,
    // Fila de reembolso: o cliente pede, o dono decide no /admin (T-218).
    ReembolsoService,
    // NFS-e: o /admin lista o que ficou sem nota e marca como emitida (T-219).
    NfseService,
  ],
})
export class AssinaturasModule {}
