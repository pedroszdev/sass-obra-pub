import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconCalendarEvent,
  IconExternalLink,
  IconPointFilled,
  IconSparkles,
} from '@tabler/icons-react';
import { useEditalIA } from '../hooks/useEditalIA';
import type { ResumoEdital } from '../types/edital';

function Header() {
  return (
    <Group gap="sm" mb="sm">
      <ThemeIcon variant="light" color="orange" radius="sm" size={26}>
        <IconSparkles size={16} />
      </ThemeIcon>
      <Text fz={15} fw={700}>
        Resumo com IA
      </Text>
      <Badge color="gray" variant="light" radius="xl" size="sm" tt="uppercase">
        Gerado por IA
      </Badge>
    </Group>
  );
}

function ResumoConteudo({ resumo }: { resumo: ResumoEdital }) {
  return (
    <Stack gap="md">
      <Text fz={14} c="gray.7" style={{ lineHeight: 1.6 }}>
        {resumo.visaoGeral}
      </Text>

      {resumo.prazoExecucao && (
        <Text fz={13.5} c="gray.7">
          <Text span fw={700}>
            Prazo de execução:
          </Text>{' '}
          {resumo.prazoExecucao}
        </Text>
      )}

      {resumo.datasChave.length > 0 && (
        <div>
          <Text fz={12} fw={700} c="gray.7" tt="uppercase" mb="xs" style={{ letterSpacing: 0.4 }}>
            Datas-chave
          </Text>
          <Stack gap={6}>
            {resumo.datasChave.map((d, i) => (
              <Group key={i} gap="sm" align="flex-start" wrap="nowrap">
                <ThemeIcon variant="light" color="gray" radius="xl" size={20} style={{ flex: 'none' }}>
                  <IconCalendarEvent size={12} />
                </ThemeIcon>
                <Text fz={13.5} c="gray.7" style={{ lineHeight: 1.45 }}>
                  <Text span fw={600}>
                    {d.evento}:
                  </Text>{' '}
                  {d.quando}
                </Text>
              </Group>
            ))}
          </Stack>
        </div>
      )}

      {resumo.pontosDeAtencao.length > 0 && (
        <div>
          <Text fz={12} fw={700} c="gray.7" tt="uppercase" mb="xs" style={{ letterSpacing: 0.4 }}>
            Pontos de atenção
          </Text>
          <Stack gap={6}>
            {resumo.pontosDeAtencao.map((p, i) => (
              <Group key={i} gap="sm" align="flex-start" wrap="nowrap">
                <ThemeIcon variant="light" color="orange" radius="xl" size={20} style={{ flex: 'none' }}>
                  <IconPointFilled size={12} />
                </ThemeIcon>
                <Text fz={13.5} c="gray.7" style={{ lineHeight: 1.45 }}>
                  {p}
                </Text>
              </Group>
            ))}
          </Stack>
        </div>
      )}
    </Stack>
  );
}

// Seção "Resumo com IA" do detalhe do edital (T-50). Busca a análise por IA
// (resumo de 1 página) e trata os estados — incluindo "indisponível" para os
// editais sem texto completo publicado (ver T-47/T-49).
export function ResumoIA({ editalId }: { editalId: string }) {
  const { state, reload } = useEditalIA(editalId);

  return (
    <Card withBorder radius="lg" p="xl">
      <Header />

      {state.status === 'loading' && (
        <Stack gap="xs">
          <Text fz={13} c="dimmed">
            Analisando o edital com IA… pode levar alguns segundos na primeira vez.
          </Text>
          <Skeleton height={12} radius="xl" />
          <Skeleton height={12} radius="xl" />
          <Skeleton height={12} width="70%" radius="xl" />
        </Stack>
      )}

      {state.status === 'error' && (
        <Group justify="space-between">
          <Text fz={13.5} c="dimmed">
            {state.message}
          </Text>
          <Button size="xs" variant="default" onClick={reload}>
            Tentar de novo
          </Button>
        </Group>
      )}

      {state.status === 'success' &&
        (state.result.status === 'extraido' && state.result.resumo ? (
          <ResumoConteudo resumo={state.result.resumo} />
        ) : state.result.status === 'indisponivel' ? (
          <Alert
            variant="light"
            color="gray"
            icon={<IconExternalLink size={16} />}
            p="sm"
          >
            <Text fz={13.5}>
              Esta licitação não publicou o edital completo em formato de texto, então
              não há resumo automático. Abra o documento na fonte para ver os detalhes.
            </Text>
          </Alert>
        ) : (
          <Group justify="space-between">
            <Group gap="xs">
              <ThemeIcon variant="light" color="orange" radius="xl" size={20}>
                <IconAlertTriangle size={12} />
              </ThemeIcon>
              <Text fz={13.5} c="dimmed">
                Não foi possível gerar o resumo deste edital.
              </Text>
            </Group>
            <Button size="xs" variant="default" onClick={reload}>
              Tentar de novo
            </Button>
          </Group>
        ))}
    </Card>
  );
}
