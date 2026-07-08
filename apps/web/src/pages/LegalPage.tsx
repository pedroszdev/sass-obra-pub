import { Alert, Anchor, Box, Divider, Stack, Text, Title } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';

export interface LegalSecao {
  titulo: string;
  paragrafos: string[];
}

// Casca das páginas legais (T-102/LGPD): Termos e Privacidade. O TEXTO é rascunho
// e precisa de revisão jurídica do dono — o aviso deixa isso explícito. Aqui é só
// o encaixe no produto (página pública, embarcada, linkada do cadastro).
export function LegalPage({
  titulo,
  atualizadoEm,
  secoes,
}: {
  titulo: string;
  atualizadoEm: string;
  secoes: LegalSecao[];
}) {
  return (
    <Box
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--mantine-color-concreto-2)',
      }}
      py="xl"
      px={{ base: 'md', sm: 'xl' }}
    >
      <Box maw={760} mx="auto">
        <Anchor component={Link} to="/" underline="never">
          <Logo variant="onLight" size={26} />
        </Anchor>

        <Title order={1} fz={30} mt="xl" style={{ letterSpacing: '-0.01em' }}>
          {titulo}
        </Title>
        <Text c="dimmed" fz="sm" mt={4}>
          Última atualização: {atualizadoEm}
        </Text>

        <Alert
          color="orange"
          variant="light"
          icon={<IconAlertTriangle size={18} />}
          mt="lg"
        >
          Rascunho — o texto legal ainda está em revisão jurídica. Não é a versão
          definitiva.
        </Alert>

        <Stack gap="xl" mt="xl">
          {secoes.map((s) => (
            <Box key={s.titulo}>
              <Title order={2} fz={19} mb="xs">
                {s.titulo}
              </Title>
              <Stack gap="sm">
                {s.paragrafos.map((p, i) => (
                  <Text key={i} fz="sm" c="gray.8" style={{ lineHeight: 1.6 }}>
                    {p}
                  </Text>
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>

        <Divider my="xl" />
        <Anchor component={Link} to="/" fz="sm" fw={600} c="orange.8">
          ‹ Voltar ao PrumoLicita
        </Anchor>
      </Box>
    </Box>
  );
}
