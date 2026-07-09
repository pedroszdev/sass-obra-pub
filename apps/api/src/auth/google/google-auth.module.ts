import { Module } from '@nestjs/common';
import { GoogleVerifierService } from './google-verifier.service';

// Módulo mínimo só para o verificador de id_token (T-126). Existe separado do
// AuthModule porque o UsersModule também precisa dele (re-autenticação na
// exclusão de conta sem senha) — e o AuthModule já importa o UsersModule, então
// depender dele criaria um ciclo. Não importa nada além do ConfigModule (global).
@Module({
  providers: [GoogleVerifierService],
  exports: [GoogleVerifierService],
})
export class GoogleAuthModule {}
