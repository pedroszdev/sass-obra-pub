import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GoogleAuthModule } from '../auth/google/google-auth.module';
import { Atestado } from '../company-profile/atestado.entity';
import { Certidao } from '../company-profile/certidao.entity';
import { CompanyProfile } from '../company-profile/company-profile.entity';
import { Favorito } from '../favoritos/favorito.entity';
import { Municipio } from '../geo/municipio.entity';
import { Proposta } from '../propostas/proposta.entity';
import { UserMunicipio } from './user-municipio.entity';
import { User } from './user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserMunicipio,
      Municipio,
      // Dados do titular para a exportação LGPD (T-102).
      CompanyProfile,
      Certidao,
      Atestado,
      Proposta,
      Favorito,
    ]),
    // Verificador do id_token (T-126) — re-autenticação na exclusão de conta.
    GoogleAuthModule,
  ],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
