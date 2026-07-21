import {
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  UseGuards,
} from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AdminGuard } from '../src/admin/admin.guard';
import { UserRole } from '../src/users/user-role.enum';

// Ponta a ponta do AdminGuard (T-180): prova, num pipeline HTTP real, que um
// não-admin recebe 404 IDÊNTICO ao de uma rota inexistente — o critério de pronto
// do épico. Sem DB/passport: um guard falso injeta `req.user` a partir do header
// `x-role`, no lugar do JwtAuthGuard (que só popula o usuário).
@Injectable()
class FakeAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const role = req.headers['x-role'];
    if (role === 'ADMIN') req.user = { id: 'a1', role: UserRole.ADMIN };
    else if (role === 'USER') req.user = { id: 'u1', role: UserRole.USER };
    // sem header → anônimo (req.user indefinido)
    return true;
  }
}

@UseGuards(FakeAuthGuard, AdminGuard)
@Controller('admin')
class RotaAdminDeTeste {
  @Get('ping')
  ping(): { ok: true } {
    return { ok: true };
  }
}

describe('AdminGuard ponta a ponta (T-180)', () => {
  let app: NestExpressApplication;
  let base: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RotaAdminDeTeste],
      providers: [AdminGuard],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    await app.listen(0);
    base = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (rota: string, role?: string): Promise<number> =>
    fetch(`${base}${rota}`, {
      headers: role ? { 'x-role': role } : {},
    }).then((r) => r.status);

  it('ADMIN acessa /admin/ping (200)', async () => {
    expect(await get('/admin/ping', 'ADMIN')).toBe(200);
  });

  it('usuário comum recebe 404 (não 403)', async () => {
    expect(await get('/admin/ping', 'USER')).toBe(404);
  });

  it('anônimo recebe 404', async () => {
    expect(await get('/admin/ping')).toBe(404);
  });

  it('o 404 do não-admin é idêntico ao de uma rota inexistente', async () => {
    const naoAdmin = await get('/admin/ping', 'USER');
    const inexistente = await get('/admin/rota-que-nao-existe', 'USER');
    expect(naoAdmin).toBe(inexistente);
    expect(naoAdmin).toBe(404);
  });
});
