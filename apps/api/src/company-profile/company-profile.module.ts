import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EditaisModule } from '../editais/editais.module';
import { Atestado } from './atestado.entity';
import { Certidao } from './certidao.entity';
import { CertidaoArquivo } from './certidao-arquivo.entity';
import { CompanyProfile } from './company-profile.entity';
import { CompanyProfileController } from './company-profile.controller';
import { CompanyProfileService } from './company-profile.service';

// Perfil de habilitação do empreiteiro (BACKLOG T-40/T-41/T-41b): entidades +
// CRUD protegido por JWT + arquivo das certidões. Base do diagnóstico (Épico 5).
// Importa EditaisModule para o diagnóstico específico por edital (T-51) usar as
// exigências extraídas (ExigenciasService) — dependência numa direção só.
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CompanyProfile,
      Certidao,
      Atestado,
      CertidaoArquivo,
    ]),
    EditaisModule,
  ],
  controllers: [CompanyProfileController],
  providers: [CompanyProfileService],
})
export class CompanyProfileModule {}
