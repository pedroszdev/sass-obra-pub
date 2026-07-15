import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import {
  fimDoAcesso,
  inativoHaMaisDe,
  PAST_DUE_CARENCIA_DIAS,
} from '../src/assinaturas/acesso';
import { Assinatura } from '../src/assinaturas/assinatura.entity';
import { AssinaturaStatus } from '../src/assinaturas/assinatura-status.enum';
import { ExclusaoInativosService } from '../src/assinaturas/exclusao-inativos.service';
import { User } from '../src/users/user.entity';

const NOW = new Date('2026-07-15T12:00:00Z');
const dias = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

// A parte mais IRREVERSÍVEL do sistema (apaga a conta em cascata). Os testes
// existem para travar os dois erros fatais: apagar quem AINDA TEM acesso, e
// apagar quando a feature está DESLIGADA.
describe('fimDoAcesso (T-144)', () => {
  it('quem tem acesso não tem fim de acesso (não é candidato)', () => {
    expect(
      fimDoAcesso(
        {
          status: AssinaturaStatus.ACTIVE,
          trialEndsAt: null,
          currentPeriodEnd: dias(20),
        },
        NOW,
      ),
    ).toBeNull();
    expect(
      fimDoAcesso(
        {
          status: AssinaturaStatus.TRIALING,
          trialEndsAt: dias(3),
          currentPeriodEnd: null,
        },
        NOW,
      ),
    ).toBeNull();
  });

  it('trial expirado → o acesso acabou no fim do trial', () => {
    expect(
      fimDoAcesso(
        {
          status: AssinaturaStatus.TRIALING,
          trialEndsAt: dias(-10),
          currentPeriodEnd: null,
        },
        NOW,
      ),
    ).toEqual(dias(-10));
  });

  it('cancelada → o acesso acabou no fim do período pago', () => {
    expect(
      fimDoAcesso(
        {
          status: AssinaturaStatus.CANCELED,
          trialEndsAt: null,
          currentPeriodEnd: dias(-5),
        },
        NOW,
      ),
    ).toEqual(dias(-5));
  });

  // Cancelou sem período pago: NÃO sabemos desde quando está inativo → não apagar.
  it('cancelada sem currentPeriodEnd → null (nunca apagar às cegas)', () => {
    expect(
      fimDoAcesso(
        {
          status: AssinaturaStatus.CANCELED,
          trialEndsAt: null,
          currentPeriodEnd: null,
        },
        NOW,
      ),
    ).toBeNull();
  });

  it('past_due além da carência → o acesso acabou no fim da carência', () => {
    const desde = dias(-30);
    const esperado = new Date(
      desde.getTime() + PAST_DUE_CARENCIA_DIAS * 86_400_000,
    );
    expect(
      fimDoAcesso(
        {
          status: AssinaturaStatus.PAST_DUE,
          trialEndsAt: null,
          currentPeriodEnd: dias(-30),
          pastDueDesde: desde,
        },
        NOW,
      ),
    ).toEqual(esperado);
  });

  it('sem assinatura → null (não apagar às cegas)', () => {
    expect(fimDoAcesso(null, NOW)).toBeNull();
  });
});

describe('inativoHaMaisDe (T-144)', () => {
  const cancelada = (fim: Date) => ({
    status: AssinaturaStatus.CANCELED,
    trialEndsAt: null,
    currentPeriodEnd: fim,
  });

  it('inativo há mais de 90 dias → true', () => {
    expect(inativoHaMaisDe(cancelada(dias(-91)), 90, NOW)).toBe(true);
  });

  it('inativo há menos de 90 dias → false', () => {
    expect(inativoHaMaisDe(cancelada(dias(-89)), 90, NOW)).toBe(false);
  });

  it('ainda com acesso → false', () => {
    expect(inativoHaMaisDe(cancelada(dias(10)), 90, NOW)).toBe(false);
  });
});

function build(
  env: Record<string, string>,
  candidatos: Partial<Assinatura>[] = [],
) {
  const assinaturas = {
    find: jest.fn().mockResolvedValue(candidatos),
  };
  const users = {
    delete: jest.fn().mockResolvedValue({ affected: candidatos.length }),
  };
  const config = { get: jest.fn((k: string, def?: unknown) => env[k] ?? def) };
  return {
    service: new ExclusaoInativosService(
      assinaturas as unknown as Repository<Assinatura>,
      users as unknown as Repository<User>,
      config as unknown as ConfigService,
    ),
    assinaturas,
    users,
  };
}

describe('ExclusaoInativosService (T-144)', () => {
  // O default que protege dados de cliente: sem a env, NADA é avaliado nem apagado.
  it('DESLIGADO por padrão: sem EXCLUSAO_INATIVOS_DIAS, não apaga nada', async () => {
    const { service, assinaturas, users } = build({});

    const r = await service.executar(NOW);

    expect(r).toEqual({ excluidos: 0, desligado: true });
    expect(assinaturas.find).not.toHaveBeenCalled(); // nem consulta
    expect(users.delete).not.toHaveBeenCalled();
  });

  it('0 ou negativo também desliga', async () => {
    for (const v of ['0', '-1', 'abc']) {
      const { service, users } = build({ EXCLUSAO_INATIVOS_DIAS: v });
      const r = await service.executar(NOW);
      expect(r.desligado).toBe(true);
      expect(users.delete).not.toHaveBeenCalled();
    }
  });

  it('ligado: apaga só quem está inativo há ≥ N dias', async () => {
    const { service, users } = build({ EXCLUSAO_INATIVOS_DIAS: '90' }, [
      // inativa há 100 dias (cancelada) → apaga
      {
        userId: 'velho',
        status: AssinaturaStatus.CANCELED,
        trialEndsAt: null,
        currentPeriodEnd: dias(-100),
        pastDueDesde: null,
      },
      // cancelada há 10 dias → fica
      {
        userId: 'recente',
        status: AssinaturaStatus.CANCELED,
        trialEndsAt: null,
        currentPeriodEnd: dias(-10),
        pastDueDesde: null,
      },
    ]);

    const r = await service.executar(NOW);

    expect(r.desligado).toBe(false);
    // Só o 'velho' entrou no delete.
    const idsApagados = users.delete.mock.calls[0][0].id.value as string[];
    expect(idsApagados).toEqual(['velho']);
  });

  it('ligado mas ninguém elegível: não chama delete', async () => {
    const { service, users } = build({ EXCLUSAO_INATIVOS_DIAS: '90' }, [
      {
        userId: 'recente',
        status: AssinaturaStatus.CANCELED,
        trialEndsAt: null,
        currentPeriodEnd: dias(-1),
        pastDueDesde: null,
      },
    ]);

    const r = await service.executar(NOW);

    expect(r.excluidos).toBe(0);
    expect(users.delete).not.toHaveBeenCalled();
  });
});
