import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
  ],
})
export class AppModule {}
