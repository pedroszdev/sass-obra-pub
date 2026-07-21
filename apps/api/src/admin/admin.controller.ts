import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { AdminGuard } from './admin.guard';

// Backoffice do dono (BACKLOG Épico 15). Todo o módulo é ADMIN-only.
//
// O par de guards vale para o controller inteiro (guard no módulo, não rota a
// rota): JwtAuthGuard autentica e popula `req.user`; AdminGuard exige ADMIN e
// devolve 404 a qualquer outro (§T-180). FICA FORA do SubscriptionGuard — admin
// não é rota de produto, o paywall não se aplica.
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  // Sanidade: confirma que a sessão atual é admin e que o guard deixou passar.
  // É o que o front (T-181) sonda para decidir se mostra a área. Um não-admin
  // recebe 404 aqui — idêntico a uma rota inexistente.
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): { id: string; role: string } {
    return { id: user.id, role: user.role };
  }
}
