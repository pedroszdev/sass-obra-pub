import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Atestado } from './atestado.entity';
import { Certidao } from './certidao.entity';
import { CompanyProfile } from './company-profile.entity';

// Perfil de habilitação do empreiteiro (BACKLOG T-40). Por ora só registra as
// entidades (autoLoadEntities) para que o schema exista e a app suba. O
// controller/service do CRUD entram na T-41.
@Module({
  imports: [TypeOrmModule.forFeature([CompanyProfile, Certidao, Atestado])],
})
export class CompanyProfileModule {}
