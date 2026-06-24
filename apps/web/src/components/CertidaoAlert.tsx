import { Alert, Anchor, type MantineSpacing, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { certidaoAlertas, SEVERIDADE_COR } from '../lib/certidao';
import type { CertidaoAlertas } from '../lib/certidao';
import type { Certidao } from '../types/company-profile';

interface Props {
  certidoes: Certidao[];
  /** Mostra o link "Revisar no cofre" (oculto na própria tela do cofre). */
  linkToCofre?: boolean;
  mb?: MantineSpacing;
}

function pluralCertidoes(n: number, sufixo: string): string {
  return n === 1 ? `1 certidão ${sufixo}` : `${n} certidões ${sufixo}s`;
}

function mensagem(a: CertidaoAlertas): string {
  const partes: string[] = [];
  if (a.vencidas.length > 0) {
    partes.push(pluralCertidoes(a.vencidas.length, 'vencida'));
  }
  if (a.vencendo.length > 0) {
    const d = a.diasMaisUrgente ?? 0;
    const quando =
      d <= 0 ? 'vence hoje' : d === 1 ? 'vence amanhã' : `vence em ${d} dias`;
    const base =
      a.vencendo.length === 1
        ? '1 certidão vencendo'
        : `${a.vencendo.length} certidões vencendo`;
    partes.push(`${base} (a mais próxima ${quando})`);
  }
  return partes.join(' e ') + '.';
}

/** Banner de alerta de vencimento de certidões (T-43). Nada quando não há. */
export function CertidaoAlert({ certidoes, linkToCofre = true, mb }: Props) {
  const alertas = certidaoAlertas(certidoes);
  if (!alertas.temAlerta) return null;

  return (
    <Alert
      color={SEVERIDADE_COR[alertas.severidade]}
      variant="light"
      icon={<IconAlertTriangle size={18} />}
      title="Atenção às suas certidões"
      radius="md"
      mb={mb}
    >
      <Text fz="sm">{mensagem(alertas)}</Text>
      {linkToCofre && (
        <Anchor component={Link} to="/documentos" fz="sm" fw={600} mt={4} inline>
          Revisar no cofre →
        </Anchor>
      )}
    </Alert>
  );
}
