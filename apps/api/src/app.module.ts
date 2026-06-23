import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { CaptacaoModule } from './captacao/captacao.module';
import { CompanyProfileModule } from './company-profile/company-profile.module';
import { EditaisModule } from './editais/editais.module';
import { SyncModule } from './editais/sync/sync.module';
import { FavoritosModule } from './favoritos/favoritos.module';
import { GeoModule } from './geo/geo.module';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
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
  ],
})
export class AppModule {}
