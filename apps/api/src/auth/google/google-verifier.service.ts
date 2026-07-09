import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

// Identidade que o Google atesta. Só sai daqui se o id_token foi verificado:
// assinatura válida, emitido pelo Google, para o NOSSO client id, não expirado,
// e com o e-mail confirmado.
export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
}

// Verifica o id_token do Google (T-126).
//
// A validação de `aud` é o que impede o ataque óbvio: um id_token legítimo,
// emitido para OUTRO app, seria uma assinatura Google válida — sem checar a
// audiência, qualquer um logaria como qualquer pessoa. A lib faz isso quando
// recebe o `audience`; por isso ele não é opcional aqui.
//
// Sem GOOGLE_CLIENT_ID a rota degrada com 503 (como a IA e o SMTP, §8) em vez
// de derrubar o boot — o resto do produto não depende do Google.
@Injectable()
export class GoogleVerifierService {
  private readonly logger = new Logger(GoogleVerifierService.name);
  private client?: OAuth2Client;

  constructor(private readonly config: ConfigService) {}

  get configurado(): boolean {
    return Boolean(this.clientId);
  }

  async verificar(idToken: string): Promise<GoogleIdentity> {
    const clientId = this.clientId;
    if (!clientId) {
      throw new ServiceUnavailableException(
        'Login com Google indisponível: GOOGLE_CLIENT_ID não configurado.',
      );
    }
    this.client ??= new OAuth2Client(clientId);

    let payload;
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch (error) {
      // Token forjado/expirado/de outro app. Não devolvemos o motivo ao cliente.
      this.logger.warn(
        `id_token do Google rejeitado: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new UnauthorizedException('Login com Google inválido');
    }

    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Login com Google inválido');
    }
    // Um e-mail não confirmado pelo Google não prova posse: aceitá-lo deixaria
    // vincular a conta de outra pessoa (ver AuthService.loginGoogle).
    if (!payload.email_verified) {
      throw new UnauthorizedException(
        'Confirme seu e-mail no Google antes de entrar por aqui.',
      );
    }

    const email = payload.email.toLowerCase();
    return {
      sub: payload.sub,
      email,
      // Conta Google sem nome definido cai no e-mail já normalizado — é o que
      // vira `users.name`, e não queremos "Fulano@Empresa.com" no cabeçalho.
      name: payload.name?.trim() || email,
    };
  }

  private get clientId(): string | undefined {
    return this.config.get<string>('GOOGLE_CLIENT_ID')?.trim() || undefined;
  }
}
