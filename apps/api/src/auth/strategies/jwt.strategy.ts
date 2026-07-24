import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { readAccessCookie, readImpersonationCookie } from '../refresh-cookie';
import { AuthenticatedUser, JwtPayload } from '../types/jwt-payload';

// Valida o access token e anexa o usuário à request.
//
// O token vem do COOKIE httpOnly (T-155) — o JS da página não o lê, então um XSS
// não tem credencial para roubar. O `Authorization: Bearer` segue aceito como
// fallback (curl, testes, ferramentas de ops); isso NÃO enfraquece nada: quem não
// consegue ler o cookie também não consegue montar o header.
//
// Ordem dos extractors (T-187): o cookie de IMPERSONAÇÃO vem PRIMEIRO. Enquanto
// ele existe, a API responde como o usuário-alvo (o admin está "vendo como") — e
// o interceptor de somente-leitura barra qualquer mutação. Sem ele, cai no access
// normal (a sessão do admin, ou do próprio usuário), e por fim no Bearer.
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: { headers?: { cookie?: string } }) =>
          readImpersonationCookie({ headers: { cookie: req.headers?.cookie } }),
        (req: { headers?: { cookie?: string } }) =>
          readAccessCookie({ headers: { cookie: req.headers?.cookie } }),
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    const user: AuthenticatedUser = { id: payload.sub, role: payload.role };
    // `imp` só existe no token de impersonação (T-187): marca a requisição como
    // "somente leitura" para o interceptor e alimenta o banner do front.
    if (payload.imp) user.impersonatorId = payload.imp;
    return user;
  }
}
