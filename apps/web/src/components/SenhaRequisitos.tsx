import { Box, Group, Text } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { requisitosSenha } from '../lib/senha';

// Checklist ao vivo dos requisitos da senha (T-153). Aparece enquanto o usuário
// digita, marcando cada regra que já foi atendida — assim ele sabe o que falta,
// em vez de só levar um "senha fraca" no envio. Reusado no cadastro, no reset e
// na troca de senha do perfil.
export function SenhaRequisitos({ senha }: { senha: string }) {
  if (!senha) return null;
  return (
    <Box mt={-4}>
      {requisitosSenha(senha).map((r) => (
        <Group key={r.label} gap={6} wrap="nowrap" mt={3}>
          {r.ok ? (
            <IconCheck size={14} color="var(--mantine-color-apto-6)" />
          ) : (
            <IconX size={14} color="var(--mantine-color-gray-5)" />
          )}
          <Text fz={12} c={r.ok ? 'apto.7' : 'dimmed'}>
            {r.label}
          </Text>
        </Group>
      ))}
    </Box>
  );
}
