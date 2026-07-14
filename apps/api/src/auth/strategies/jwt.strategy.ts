import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { readAccessCookie } from '../refresh-cookie';
import { AuthenticatedUser, JwtPayload } from '../types/jwt-payload';

// Valida o access token e anexa o usuário à request.
//
// O token vem do COOKIE httpOnly (T-155) — o JS da página não o lê, então um XSS
// não tem credencial para roubar. O `Authorization: Bearer` segue aceito como
// fallback (curl, testes, ferramentas de ops); isso NÃO enfraquece nada: quem não
// consegue ler o cookie também não consegue montar o header.
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: { headers?: { cookie?: string } }) =>
          readAccessCookie({ headers: { cookie: req.headers?.cookie } }),
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    return { id: payload.sub, role: payload.role };
  }
}
