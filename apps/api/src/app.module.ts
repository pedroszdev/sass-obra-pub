import { Module } from '@nestjs/common';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { validateEnv } from './common/env.validation';
import { ImpersonationReadOnlyInterceptor } from './common/impersonation-readonly.interceptor';
import { IpThrottlerGuard } from './common/throttling/ip-throttler.guard';
import { THROTTLE_GLOBAL } from './common/throttling/throttle.config';
import { AdminModule } from './admin/admin.module';
import { AgendaModule } from './agenda/agenda.module';
import { AlertasModule } from './alertas/alertas.module';
import { AssinaturasModule } from './assinaturas/assinaturas.module';
import { AuthModule } from './auth/auth.module';
import { CaptacaoModule } from './captacao/captacao.module';
import { CompanyProfileModule } from './company-profile/company-profile.module';
import { ConfigStoreModule } from './config/config-store.module';
import { EditaisModule } from './editais/editais.module';
import { SyncModule } from './editais/sync/sync.module';
import { FeedbackModule } from './feedback/feedback.module';
import { FavoritosModule } from './favoritos/favoritos.module';
import { GeoModule } from './geo/geo.module';
import { HealthModule } from './health/health.module';
import { NotificacoesModule } from './notificacoes/notificacoes.module';
import { PropostasModule } from './propostas/propostas.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    // Observabilidade (T-106). Sem SENTRY_DSN o SDK fica inerte — ver instrument.ts.
    SentryModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ScheduleModule.forRoot(),
    // Rate limiting (T-104): teto global frouxo por IP; rotas sensíveis apertam
    // via @Throttle. Storage em memória (1 instância no Render free — ver §8).
    ThrottlerModule.forRoot({ throttlers: [THROTTLE_GLOBAL] }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DATABASE_HOST', 'localhost'),
        port: Number(config.get<string>('DATABASE_PORT', '5432')),
        username: config.get<string>('DATABASE_USER', 'obrapub'),
        password: config.get<string>('DATABASE_PASSWORD', 'obrapub'),
        database: config.get<string>('DATABASE_NAME', 'obrapub'),
        autoLoadEntities: true,
        // Schema só via migration (CLAUDE.md 3.2) — nunca synchronize fora de dev.
        synchronize: false,
      }),
    }),
    HealthModule,
    ConfigStoreModule,
    UsersModule,
    AuthModule,
    AssinaturasModule,
    EditaisModule,
    SyncModule,
    GeoModule,
    CaptacaoModule,
    FavoritosModule,
    CompanyProfileModule,
    PropostasModule,
    AgendaModule,
    AlertasModule,
    NotificacoesModule,
    FeedbackModule,
    AdminModule,
  ],
  providers: [
    // Captura as exceções não tratadas e as manda ao Sentry (T-106). Precisa vir
    // ANTES de qualquer outro filtro. Não engole as HttpException do Nest: o
    // cliente segue recebendo 4xx/5xx normalmente.
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
    // Throttle global por IP (T-104). Guards por email/usuário são aplicados
    // pontualmente nas rotas sensíveis via @UseGuards.
    // ⚠️ `IpThrottlerGuard`, não o `ThrottlerGuard` da biblioteca: o padrão dela
    // é `req.ip`, e com Cloudflare + Render na frente isso pode ser endereço
    // intermediário (T-204). A subclasse lê o IP pela função única do projeto.
    // NÃO troque isto por `getTracker` no `ThrottlerModule.forRoot` — ver o
    // comentário no ip-throttler.guard.ts: mataria os trackers por email/usuário.
    { provide: APP_GUARD, useClass: IpThrottlerGuard },
    // Somente-leitura durante a impersonação (T-187): barra toda mutação quando o
    // admin está "vendo como" um cliente. Global e depois dos guards (vê req.user).
    { provide: APP_INTERCEPTOR, useClass: ImpersonationReadOnlyInterceptor },
  ],
})
export class AppModule {}
