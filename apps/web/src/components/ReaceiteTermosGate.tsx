import {
  Alert,
  Anchor,
  Box,
  Button,
  Card,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { IconFileText } from '@tabler/icons-react';
import { useState } from 'react';
import { useAuth } from '../context/auth-context';
import { aceitarTermos, ApiError } from '../lib/api';

// Portão de re-aceite dos Termos/Privacidade (T-196). Aparece quando o dono
// publica uma versão nova (T-179) e a conta ainda não a aceitou. NÃO traz o texto
// jurídico — ele vive em /termos e /privacidade (conteúdo do dono); aqui só
// pedimos o consentimento renovado e registramos a versão vigente no servidor.
export function ReaceiteTermosGate() {
  const { refreshUser } = useAuth();
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aceitar() {
    setErro(null);
    setSalvando(true);
    try {
      await aceitarTermos(); // grava a versão vigente do servidor
      await refreshUser(); // some o portão
    } catch (err) {
      setErro(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível registrar o aceite agora. Tente de novo.',
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Box
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      p="xl"
    >
      <Card withBorder radius="lg" p="xl" maw={480} w="100%">
        <Stack gap="md" align="center" ta="center">
          <ThemeIcon variant="light" color="orange" radius="xl" size={56}>
            <IconFileText size={28} />
          </ThemeIcon>
          <Box>
            <Title order={2} fz={22} style={{ letterSpacing: '-0.01em' }}>
              Atualizamos nossos termos
            </Title>
            <Text c="dimmed" fz="sm" mt={6} maw={400}>
              Revisamos os{' '}
              <Anchor href="/termos" target="_blank" fz="sm">
                Termos de Uso
              </Anchor>{' '}
              e a{' '}
              <Anchor href="/privacidade" target="_blank" fz="sm">
                Política de Privacidade
              </Anchor>
              . Para continuar usando o PrumoLicita, confirme que leu e concorda
              com a versão atual.
            </Text>
          </Box>

          {erro && (
            <Alert color="alerta" variant="light" radius="md" w="100%">
              {erro}
            </Alert>
          )}

          <Button
            color="orange"
            onClick={() => void aceitar()}
            loading={salvando}
            mt="xs"
          >
            Li e concordo
          </Button>
        </Stack>
      </Card>
    </Box>
  );
}
