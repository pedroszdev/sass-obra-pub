import { Button, Card, Center, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import type { AssinaturaMe } from '../types/auth';

// Tela de bloqueio do paywall (T-130/T-131). Renderiza o que o BACKEND já decidiu
// (§3.3): a verdade sobre o acesso está em `assinatura.acessoPermitido`, calculada
// no servidor — esta tela não decide nada, só dá o caminho para pagar.
//
// Quem BARRA de fato é o guard do backend (402). Isto é a UX: evita mostrar telas
// vazias/quebradas a quem o backend recusaria de qualquer jeito.

const MENSAGEM: Record<string, { titulo: string; texto: string }> = {
  trial_expirado: {
    titulo: 'Seu teste grátis terminou',
    texto:
      'Esperamos que tenha gostado. Assine para continuar encontrando obras, montando propostas e usando o diagnóstico de aptidão.',
  },
  sem_pagamento: {
    titulo: 'Pagamento pendente',
    texto:
      'Não conseguimos confirmar o pagamento da sua assinatura. Atualize a forma de pagamento para voltar a usar.',
  },
  cancelada: {
    titulo: 'Assinatura encerrada',
    texto:
      'Seu período de acesso terminou. Assine de novo quando quiser retomar de onde parou.',
  },
  // T-157. Sem acusar ninguém de nada: houve reembolso, o acesso encerrou junto,
  // e a porta continua aberta. Os dados seguem guardados (retenção de 90 dias).
  reembolsada: {
    titulo: 'Assinatura reembolsada',
    texto:
      'Devolvemos o valor da sua assinatura e o acesso foi encerrado. Suas propostas e documentos continuam guardados — assine quando quiser voltar.',
  },
};

export function PaywallGate({ assinatura }: { assinatura: AssinaturaMe }) {
  const m =
    MENSAGEM[assinatura.motivoBloqueio ?? 'trial_expirado'] ??
    MENSAGEM.trial_expirado;

  return (
    <Center style={{ flex: 1, padding: 24 }}>
      <Card withBorder radius="md" p="xl" maw={460}>
        <Stack align="center" gap="md">
          <ThemeIcon size={56} radius="xl" variant="light" color="orange">
            <IconLock size={28} />
          </ThemeIcon>
          <Title order={2} fz={22} ta="center" ff="heading">
            {m.titulo}
          </Title>
          <Text c="dimmed" ta="center" fz="sm">
            {m.texto}
          </Text>
          <Button component={Link} to="/assinatura" size="md" mt="xs">
            Ver planos e assinar
          </Button>
        </Stack>
      </Card>
    </Center>
  );
}
