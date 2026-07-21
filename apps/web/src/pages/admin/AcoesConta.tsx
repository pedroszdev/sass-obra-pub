import {
  Alert,
  Button,
  Card,
  Divider,
  Group,
  NumberInput,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useState } from 'react';
import {
  concederCortesia,
  estenderTrialConta,
  reativarConta,
  reenviarVerificacaoConta,
  revogarCortesia,
  revogarSessoesConta,
  suspenderConta,
} from '../../lib/api';
import type { AccountDetail } from '../../types/admin';

// Ações de conta do admin (T-185). Cada ação chama o backend (que audita),
// atualiza o detalhe com o retorno e mostra um aviso. As destrutivas
// (suspender, revogar sessões) pedem confirmação.
export function AcoesConta({
  conta,
  onAtualizar,
}: {
  conta: AccountDetail;
  onAtualizar: (d: AccountDetail) => void;
}) {
  const [dias, setDias] = useState<number | string>(7);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(
    null,
  );

  const suspensa = !!conta.assinaturaDetalhe?.suspensoEm;
  const temCortesia = !!conta.assinaturaDetalhe?.cortesiaAte;

  async function rodar(
    chave: string,
    fn: () => Promise<AccountDetail>,
    sucesso: string,
    confirmar?: string,
  ) {
    if (confirmar && !window.confirm(confirmar)) return;
    setOcupado(chave);
    setAviso(null);
    try {
      onAtualizar(await fn());
      setAviso({ ok: true, texto: sucesso });
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message });
    } finally {
      setOcupado(null);
    }
  }

  const nDias = typeof dias === 'number' ? dias : Number(dias) || 0;

  return (
    <Card withBorder>
      <Title order={4} mb="sm">
        Ações
      </Title>

      {aviso && (
        <Alert color={aviso.ok ? 'green' : 'red'} mb="sm">
          {aviso.texto}
        </Alert>
      )}

      <Stack gap="sm">
        <Group align="flex-end" gap="sm">
          <NumberInput
            label="Dias"
            value={dias}
            onChange={setDias}
            min={1}
            max={365}
            w={100}
          />
          <Button
            variant="light"
            loading={ocupado === 'trial'}
            onClick={() =>
              rodar(
                'trial',
                () => estenderTrialConta(conta.id, nDias),
                `Trial estendido em ${nDias} dia(s).`,
              )
            }
          >
            Estender trial
          </Button>
          <Button
            variant="light"
            color="teal"
            loading={ocupado === 'cortesia'}
            onClick={() =>
              rodar(
                'cortesia',
                () => concederCortesia(conta.id, nDias),
                `Cortesia concedida por ${nDias} dia(s).`,
              )
            }
          >
            Conceder cortesia
          </Button>
          {temCortesia && (
            <Button
              variant="subtle"
              color="teal"
              loading={ocupado === 'rev-cortesia'}
              onClick={() =>
                rodar(
                  'rev-cortesia',
                  () => revogarCortesia(conta.id),
                  'Cortesia revogada.',
                )
              }
            >
              Revogar cortesia
            </Button>
          )}
        </Group>

        <Divider />

        <Group gap="sm">
          {suspensa ? (
            <Button
              variant="light"
              color="green"
              loading={ocupado === 'reativar'}
              onClick={() =>
                rodar(
                  'reativar',
                  () => reativarConta(conta.id),
                  'Conta reativada.',
                )
              }
            >
              Reativar conta
            </Button>
          ) : (
            <Button
              variant="light"
              color="red"
              loading={ocupado === 'suspender'}
              onClick={() =>
                rodar(
                  'suspender',
                  () => suspenderConta(conta.id),
                  'Conta suspensa.',
                  'Suspender bloqueia o acesso ao produto desta conta. Confirmar?',
                )
              }
            >
              Suspender conta
            </Button>
          )}

          <Button
            variant="light"
            loading={ocupado === 'verif'}
            disabled={conta.emailVerificado}
            onClick={() =>
              rodar(
                'verif',
                () => reenviarVerificacaoConta(conta.id),
                'Verificação reenviada (se ainda não verificada).',
              )
            }
          >
            Reenviar verificação
          </Button>

          <Button
            variant="light"
            color="red"
            loading={ocupado === 'sessoes'}
            onClick={() =>
              rodar(
                'sessoes',
                () => revogarSessoesConta(conta.id),
                'Todas as sessões foram revogadas.',
                'Isso desconecta a conta de todos os dispositivos. Confirmar?',
              )
            }
          >
            Revogar sessões
          </Button>
        </Group>

        {conta.emailVerificado && (
          <Text size="xs" c="dimmed">
            E-mail já verificado — reenvio desabilitado.
          </Text>
        )}
      </Stack>
    </Card>
  );
}
