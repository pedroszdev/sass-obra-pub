import { Module } from '@nestjs/common';
import { AssinaturasModule } from '../assinaturas/assinaturas.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Certidao } from '../company-profile/certidao.entity';
import { Edital } from '../editais/edital.entity';
import { EditalExigencias } from '../editais/exigencias/edital-exigencias.entity';
import { Favorito } from '../favoritos/favorito.entity';
import { Proposta } from '../propostas/proposta.entity';
import { User } from '../users/user.entity';
import { AlertasController } from './alertas.controller';
import { AlertasService } from './alertas.service';

// Central de notificações (T-90). Módulo standalone — só injeta repositórios e
// deriva os alertas; não gera nem grava eventos.
@Module({
  imports: [
    AssinaturasModule,
    TypeOrmModule.forFeature([
      User,
      Certidao,
      Favorito,
      Edital,
      Proposta,
      EditalExigencias,
    ]),
  ],
  controllers: [AlertasController],
  providers: [AlertasService],
  // Exposto para o job de notificações (T-103) reusar a derivação (T-90).
  exports: [AlertasService],
})
export class AlertasModule {}
