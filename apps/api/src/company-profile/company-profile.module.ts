import { Module } from '@nestjs/common';
import { AssinaturasModule } from '../assinaturas/assinaturas.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EditaisModule } from '../editais/editais.module';
import { Atestado } from './atestado.entity';
import { AtestadoArquivo } from './atestado-arquivo.entity';
import { Certidao } from './certidao.entity';
import { CertidaoArquivo } from './certidao-arquivo.entity';
import { CompanyProfile } from './company-profile.entity';
import { CompanyProfileController } from './company-profile.controller';
import { CompanyProfileService } from './company-profile.service';
import { UsersModule } from '../users/users.module';

// Perfil de habilitação do empreiteiro (BACKLOG T-40/T-41/T-41b): entidades +
// CRUD protegido por JWT + arquivo das certidões. Base do diagnóstico (Épico 5).
// Importa EditaisModule para o diagnóstico específico por edital (T-51) usar as
// exigências extraídas (ExigenciasService) — dependência numa direção só.
@Module({
  imports: [
    AssinaturasModule,
    TypeOrmModule.forFeature([
      CompanyProfile,
      Certidao,
      Atestado,
      CertidaoArquivo,
      AtestadoArquivo,
    ]),
    EditaisModule,
    UsersModule, // UF da sede do empreiteiro para o guia de regularização (T-111)
  ],
  controllers: [CompanyProfileController],
  providers: [CompanyProfileService],
  // Exposto para o job "melhor obra do dia" (T-135) reusar getEditaisAptos.
  exports: [CompanyProfileService],
})
export class CompanyProfileModule {}
