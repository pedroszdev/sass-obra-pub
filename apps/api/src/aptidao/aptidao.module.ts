import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Atestado } from '../company-profile/atestado.entity';
import { Certidao } from '../company-profile/certidao.entity';
import { CompanyProfile } from '../company-profile/company-profile.entity';
import { EditalExigencias } from '../editais/exigencias/edital-exigencias.entity';
import { AptidaoService } from './aptidao.service';

// Aptidão na listagem (T-82). Módulo standalone — injeta só os repositórios
// (perfil/certidões/atestados + exigências), nunca os módulos editais/
// company-profile, para não criar dependência circular. Exporta o serviço para
// editais e favoritos decorarem suas listas com o veredito.
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CompanyProfile,
      Certidao,
      Atestado,
      EditalExigencias,
    ]),
  ],
  providers: [AptidaoService],
  exports: [AptidaoService],
})
export class AptidaoModule {}
