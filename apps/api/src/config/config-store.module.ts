import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppSetting } from './app-setting.entity';
import { ConfigController } from './config.controller';
import { ConfigStoreService } from './config-store.service';

// Store de configuração operacional (T-195). NEUTRO: exporta o ConfigStoreService
// para o admin (escrita) e o assinaturas (dias de trial) sem ciclo. O endpoint
// público de leitura mora aqui; a escrita fica no AdminConfigController.
@Module({
  imports: [TypeOrmModule.forFeature([AppSetting])],
  controllers: [ConfigController],
  providers: [ConfigStoreService],
  exports: [ConfigStoreService],
})
export class ConfigStoreModule {}
