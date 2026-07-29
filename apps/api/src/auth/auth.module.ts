import { Module } from '@nestjs/common';
import { AssinaturasModule } from '../assinaturas/assinaturas.module';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigStoreModule } from '../config/config-store.module';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerification } from './email-verification.entity';
import { GoogleAuthModule } from './google/google-auth.module';
import { PasswordReset } from './password-reset.entity';
import { RefreshToken } from './refresh-token.entity';
import { RefreshTokenCleanupService } from './refresh-token-cleanup.service';
import { RolesGuard } from './guards/roles.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TurnstileModule } from './turnstile/turnstile.module';

@Module({
  imports: [
    AssinaturasModule,
    UsersModule,
    PassportModule,
    // Segredos/expiração são passados por chamada de sign/verify (ver AuthService).
    JwtModule.register({}),
    TypeOrmModule.forFeature([RefreshToken, PasswordReset, EmailVerification]),
    MailModule,
    GoogleAuthModule,
    // Proteção contra cadastro automatizado (T-203). Sem a env, fica inerte.
    TurnstileModule,
    // Versão vigente dos termos (T-196) — carimbada no cadastro e no login.
    ConfigStoreModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RolesGuard, RefreshTokenCleanupService],
  exports: [AuthService],
})
export class AuthModule {}
