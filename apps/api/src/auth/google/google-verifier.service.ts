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

  // URL da tela de consentimento do Google, para onde MANDAMOS o navegador no
  // fluxo por redirect (T-126b).
  //
  // `response_type=id_token` + `response_mode=form_post`: o Google devolve o
  // id_token assinado num POST direto ao `redirectUri` — sem troca de code, logo
  // sem client secret. É o mesmo token que o SDK entregava, e a verificação
  // continua sendo a daqui.
  //
  // O `nonce` é obrigatório neste fluxo e é justamente a nossa proteção: volta
  // dentro do token assinado e é conferido contra o cookie (ver o callback).
  urlDeConsentimento(nonce: string, redirectUri: string): string {
    const clientId = this.clientId;
    if (!clientId) {
      throw new ServiceUnavailableException(
        'Login com Google indisponível: GOOGLE_CLIENT_ID não configurado.',
      );
    }
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'id_token',
      response_mode: 'form_post',
      scope: 'openid email profile',
      redirect_uri: redirectUri,
      nonce,
      // Sem isto o Google reusa em silêncio a última conta usada: entrar tem de
      // ser escolha explícita (mesmo espírito do `auto_select: false` do SDK).
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  // `nonceEsperado` só vem no fluxo por redirect (T-126b): é o valor que ESTA API
  // sorteou e guardou num cookie antes de mandar o usuário ao Google. Bater o
  // nonce do id_token com ele é o que impede o login-CSRF (alguém empurrar no
  // navegador da vítima uma resposta do Google obtida com a conta do atacante).
  // No fluxo por popup não existe nonce e o parâmetro fica ausente.
  async verificar(
    idToken: string,
    nonceEsperado?: string,
  ): Promise<GoogleIdentity> {
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
    // Token válido, mas respondendo a um pedido que não foi este: recusa.
    if (nonceEsperado !== undefined && payload.nonce !== nonceEsperado) {
      this.logger.warn('id_token do Google rejeitado: nonce não confere');
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
