import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { validateEnv } from './common/env.validation';
import { THROTTLE_GLOBAL } from './common/throttling/throttle.config';
import { AgendaModule } from './agenda/agenda.module';
import { AlertasModule } from './alertas/alertas.module';
import { AuthModule } from './auth/auth.module';
import { CaptacaoModule } from './captacao/captacao.module';
import { CompanyProfileModule } from './company-profile/company-profile.module';
import { EditaisModule } from './editais/editais.module';
import { SyncModule } from './editais/sync/sync.module';
import { FavoritosModule } from './favoritos/favoritos.module';
import { GeoModule } from './geo/geo.module';
import { HealthModule } from './health/health.module';
import { NotificacoesModule } from './notificacoes/notificacoes.module';
import { PropostasModule } from './propostas/propostas.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
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
    UsersModule,
    AuthModule,
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
  ],
  providers: [
    // ThrottlerGuard global (por IP). Guards por email/usuário são aplicados
    // pontualmente nas rotas sensíveis via @UseGuards (T-104).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
