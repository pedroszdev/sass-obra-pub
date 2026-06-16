import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Edital } from './edital.entity';

// Por ora só registra a entidade. Service/controller de busca vêm na T-20.
@Module({
  imports: [TypeOrmModule.forFeature([Edital])],
})
export class EditaisModule {}
