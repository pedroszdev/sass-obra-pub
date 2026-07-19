import { Anchor, Box, Divider, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';

export interface LegalSecao {
  titulo: string;
  paragrafos: string[];
}

// Casca das páginas legais (T-102/LGPD): Termos e Privacidade. O banner de
// rascunho foi removido por decisão do dono (T-179) — o texto passa a ser
// exibido como publicado. Aqui é só o encaixe no produto (página pública,
// embarcada, linkada do cadastro).
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
