import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Atestado } from './atestado.entity';
import { Certidao } from './certidao.entity';
import { CompanyProfile } from './company-profile.entity';
import { CompanyProfileController } from './company-profile.controller';
import { CompanyProfileService } from './company-profile.service';

// Perfil de habilitação do empreiteiro (BACKLOG T-40/T-41): entidades + CRUD
// protegido por JWT. Base do diagnóstico de prontidão do Épico 5.
@Module({
  imports: [TypeOrmModule.forFeature([CompanyProfile, Certidao, Atestado])],
  controllers: [CompanyProfileController],
  providers: [CompanyProfileService],
})
export class CompanyProfileModule {}
