import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Center,
  Grid,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconArrowLeft, IconExternalLink } from '@tabler/icons-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getAdminConta } from '../../lib/api';
import { brl, fmtDate, fmtDateTime } from '../../lib/format';
import type { AccountDetail } from '../../types/admin';
import { AcoesConta } from './AcoesConta';
import { NotasConta } from './NotasConta';
import { corDoStatus, rotuloStatus, stripeCustomerUrl } from './assinatura-status';

function Campo({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase">
        {rotulo}
      </Text>
      <Text size="sm">{valor ?? '—'}</Text>
    </div>
  );
}

function Contador({ rotulo, n }: { rotulo: string; n: number }) {
  return (
    <Card withBorder padding="sm">
      <Text size="xl" fw={700}>
        {n}
      </Text>
      <Text size="xs" c="dimmed">
        {rotulo}
      </Text>
    </Card>
  );
}

// Detalhe de uma conta (T-184). O acesso é auditado no backend (@Audit). Só
// leitura — as ações (estender trial, cortesia, revogar sessões) são a T-185.
export function AdminContaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [conta, setConta] = useState<AccountDetail | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let ativo = true;
    setCarregando(true);
    getAdminConta(id)
      .then((c) => ativo && setConta(c))
      .catch((e: unknown) => ativo && setErro((e as Error).message))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [id]);

  if (carregando) {
    return (
      <Center py="xl">
        <Loader color="orange" />
      </Center>
    );
  }
  if (erro || !conta) {
    return (
      <Stack>
        <Anchor component={Link} to="/admin/contas" size="sm">
          <Group gap={4}>
            <IconArrowLeft size={16} />
            Voltar às contas
          </Group>
        </Anchor>
        <Alert color="red" title="Não foi possível carregar a conta">
          {erro ?? 'Conta não encontrada.'}
        </Alert>
      </Stack>
    );
  }

  const a = conta.assinaturaDetalhe;

  return (
    <Stack>
      <Anchor component={Link} to="/admin/contas" size="sm">
        <Group gap={4}>
          <IconArrowLeft size={16} />
          Voltar às contas
        </Group>
      </Anchor>

      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>{conta.name}</Title>
          <Text c="dimmed">{conta.email}</Text>
        </div>
        <Group gap="xs">
          {conta.role === 'ADMIN' && <Badge color="orange">ADMIN</Badge>}
          <Badge color={conta.emailVerificado ? 'green' : 'gray'} variant="light">
            {conta.emailVerificado ? 'e-mail verificado' : 'e-mail não verificado'}
          </Badge>
        </Group>
      </Group>

      <AcoesConta conta={conta} onAtualizar={setConta} />

      <NotasConta userId={conta.id} />

      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder h="100%">
            <Title order={4} mb="sm">
              Conta
            </Title>
            <SimpleGrid cols={2} spacing="sm">
              <Campo rotulo="CNPJ" valor={conta.cnpj} />
              <Campo rotulo="Porte" valor={conta.porte} />
              <Campo rotulo="Cadastro" valor={fmtDate(conta.createdAt)} />
              <Campo
                rotulo="Aceite dos termos"
                valor={conta.termsAcceptedAt ? fmtDate(conta.termsAcceptedAt) : '—'}
              />
              <Campo
                rotulo="Login Google"
                valor={conta.googleVinculado ? 'vinculado' : 'não'}
              />
            </SimpleGrid>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder h="100%">
            <Group justify="space-between" mb="sm">
              <Title order={4}>Assinatura</Title>
              {a?.stripeCustomerId && (
                <Button
                  component="a"
                  href={stripeCustomerUrl(a.stripeCustomerId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="light"
                  size="xs"
                  rightSection={<IconExternalLink size={14} />}
                >
                  Abrir no Stripe
                </Button>
              )}
            </Group>
            {a ? (
              <SimpleGrid cols={2} spacing="sm">
                <Campo
                  rotulo="Status"
                  valor={
                    <Badge color={corDoStatus(a.status)} variant="light">
                      {rotuloStatus(a.status)}
                    </Badge>
                  }
                />
                <Campo rotulo="Plano" valor={a.plano} />
                <Campo
                  rotulo="Fim do teste"
                  valor={a.trialEndsAt ? fmtDate(a.trialEndsAt) : '—'}
                />
                <Campo
                  rotulo="Renova/expira em"
                  valor={a.currentPeriodEnd ? fmtDate(a.currentPeriodEnd) : '—'}
                />
                <Campo
                  rotulo="Cancela no fim?"
                  valor={a.cancelAtPeriodEnd ? 'sim' : 'não'}
                />
                <Campo
                  rotulo="Pagamento pendente desde"
                  valor={a.pastDueDesde ? fmtDate(a.pastDueDesde) : '—'}
                />
                <Campo
                  rotulo="Cortesia até"
                  valor={
                    a.cortesiaAte ? (
                      <Badge color="teal" variant="light">
                        {fmtDate(a.cortesiaAte)}
                      </Badge>
                    ) : (
                      '—'
                    )
                  }
                />
                <Campo
                  rotulo="Suspensa"
                  valor={
                    a.suspensoEm ? (
                      <Badge color="red" variant="light">
                        desde {fmtDate(a.suspensoEm)}
                      </Badge>
                    ) : (
                      'não'
                    )
                  }
                />
              </SimpleGrid>
            ) : (
              <Text c="dimmed" size="sm">
                Sem assinatura registrada.
              </Text>
            )}
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder h="100%">
            <Title order={4} mb="sm">
              Empresa
            </Title>
            {conta.perfil ? (
              <SimpleGrid cols={2} spacing="sm">
                <Campo rotulo="Razão social" valor={conta.perfil.razaoSocial} />
                <Campo rotulo="Telefone" valor={conta.perfil.telefone} />
                <Campo rotulo="Capital social" valor={brl(conta.perfil.capitalSocial)} />
                <Campo
                  rotulo="Patrimônio líquido"
                  valor={brl(conta.perfil.patrimonioLiquido)}
                />
                <Campo
                  rotulo="Registro profissional"
                  valor={
                    conta.perfil.registro.tipo
                      ? `${conta.perfil.registro.tipo} ${conta.perfil.registro.numero ?? ''} ${conta.perfil.registro.uf ?? ''}`.trim()
                      : '—'
                  }
                />
              </SimpleGrid>
            ) : (
              <Text c="dimmed" size="sm">
                Onboarding da empresa não preenchido.
              </Text>
            )}
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder h="100%">
            <Title order={4} mb="sm">
              Sessões
            </Title>
            <SimpleGrid cols={2} spacing="sm">
              <Campo rotulo="Sessões ativas" valor={conta.sessoes.ativas} />
              <Campo
                rotulo="Último acesso"
                valor={
                  conta.sessoes.ultimoAcesso
                    ? fmtDateTime(conta.sessoes.ultimoAcesso)
                    : '—'
                }
              />
            </SimpleGrid>
            <Text size="xs" c="dimmed" mt="xs">
              Baseado nas sessões (refresh tokens), não em um log de login.
            </Text>
          </Card>
        </Grid.Col>
      </Grid>

      <div>
        <Title order={4} mb="sm">
          Uso
        </Title>
        <SimpleGrid cols={{ base: 2, sm: 5 }}>
          <Contador rotulo="Favoritos" n={conta.uso.favoritos} />
          <Contador rotulo="Propostas" n={conta.uso.propostas} />
          <Contador rotulo="Alertas enviados" n={conta.uso.alertasEnviados} />
          <Contador rotulo="Certidões" n={conta.uso.certidoes} />
          <Contador rotulo="Atestados" n={conta.uso.atestados} />
        </SimpleGrid>
        <Text size="xs" c="dimmed" mt="xs">
          Resumos de IA e diagnósticos ainda não são contados por conta — entram
          com a instrumentação de custo de IA (T-190a).
        </Text>
      </div>
    </Stack>
  );
}
