import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';

// Backoffice do dono (BACKLOG Épico 15). Esqueleto: por ora só a trava de acesso
// (T-180) e o endpoint de sanidade. As áreas (contas, captação, IA, billing)
// entram como controllers próprios nas tasks seguintes (T-184+).
//
// O AdminGuard não tem dependências, mas fica provido aqui para o padrão dos
// épicos de segurança (guard testável e injetável no módulo).
@Module({
  controllers: [AdminController],
  providers: [AdminGuard],
})
export class AdminModule {}
