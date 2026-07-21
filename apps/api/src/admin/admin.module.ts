import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { AdminAuditLog } from './admin-audit-log.entity';
import { AdminAuditService } from './admin-audit.service';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';

// Backoffice do dono (BACKLOG Épico 15). Esqueleto: trava de acesso (T-180),
// auditoria por padrão (T-182) e a consulta da trilha. As áreas (contas,
// captação, IA, billing) entram como controllers próprios nas tasks seguintes
// (T-184+) — cada um repetindo o trio guard+guard+interceptor do AdminController.
//
// AdminGuard e AdminAuditInterceptor não têm estado, mas ficam providos aqui para
// o padrão dos épicos de segurança (testáveis e injetáveis no módulo).
@Module({
  imports: [TypeOrmModule.forFeature([AdminAuditLog])],
  controllers: [AdminController],
  providers: [AdminGuard, AdminAuditInterceptor, AdminAuditService],
})
export class AdminModule {}
