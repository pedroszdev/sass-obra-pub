import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Exige um access token válido (Bearer). Aplicado por rota — não global,
// para manter /health aberto.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
