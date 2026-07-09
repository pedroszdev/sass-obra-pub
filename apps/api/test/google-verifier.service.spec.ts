import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleVerifierService } from '../src/auth/google/google-verifier.service';

// Mock da lib: aqui não testamos a criptografia do Google (é dela), e sim o
// contrato que construímos em volta — audiência, e-mail confirmado, degradação.
const verifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: (...args: unknown[]) => verifyIdToken(...args),
  })),
}));

const comClientId = (clientId?: string): GoogleVerifierService =>
  new GoogleVerifierService({
    get: jest.fn().mockReturnValue(clientId),
  } as unknown as ConfigService);

const ticket = (payload: Record<string, unknown> | undefined) => ({
  getPayload: () => payload,
});

describe('GoogleVerifierService (T-126)', () => {
  beforeEach(() => verifyIdToken.mockReset());

  it('sem GOOGLE_CLIENT_ID: 503, sem chamar o Google', async () => {
    const service = comClientId(undefined);

    expect(service.configurado).toBe(false);
    await expect(service.verificar('tok')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  // A checagem de audiência é o que impede um id_token legítimo, emitido para
  // OUTRO app, de logar aqui. Ela precisa chegar à lib — se pararmos de mandar
  // o `audience`, a verificação passa a aceitar qualquer token do Google.
  it('exige a audiência do nosso client id ao verificar', async () => {
    const service = comClientId('client-123');
    verifyIdToken.mockResolvedValue(
      ticket({ sub: 's1', email: 'F@Empresa.com', email_verified: true }),
    );

    await service.verificar('tok');

    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'tok',
      audience: 'client-123',
    });
  });

  it('normaliza o e-mail e cai no e-mail quando o Google não manda nome', async () => {
    const service = comClientId('client-123');
    verifyIdToken.mockResolvedValue(
      ticket({ sub: 's1', email: 'Fulano@Empresa.com', email_verified: true }),
    );

    await expect(service.verificar('tok')).resolves.toEqual({
      sub: 's1',
      email: 'fulano@empresa.com',
      name: 'fulano@empresa.com',
    });
  });

  // E-mail não confirmado não prova posse: aceitá-lo deixaria alguém vincular a
  // conta local de outra pessoa só criando um Google com o e-mail dela.
  it('recusa e-mail não verificado no Google', async () => {
    const service = comClientId('client-123');
    verifyIdToken.mockResolvedValue(
      ticket({ sub: 's1', email: 'f@e.com', email_verified: false }),
    );

    await expect(service.verificar('tok')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('token rejeitado pela lib vira 401 (sem vazar o motivo)', async () => {
    const service = comClientId('client-123');
    verifyIdToken.mockRejectedValue(new Error('Token used too late'));

    await expect(service.verificar('tok')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('payload sem sub/email vira 401', async () => {
    const service = comClientId('client-123');
    verifyIdToken.mockResolvedValue(ticket({ email_verified: true }));

    await expect(service.verificar('tok')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
