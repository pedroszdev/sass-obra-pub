import {
  Box,
  Button,
  Card,
  Group,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core';
import { IconAlertTriangle, IconSearch } from '@tabler/icons-react';
import type { ReactNode } from 'react';

/** Esqueleto dos cards de resultado enquanto a busca carrega. */
export function LoadingCards({ count = 5 }: { count?: number }) {
  return (
    <Stack gap="sm">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} withBorder radius="md" p="lg">
          <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xl">
            <Box style={{ flex: 1 }}>
              <Skeleton h={14} w={110} mb={12} />
              <Skeleton h={18} w="88%" mb={9} />
              <Skeleton h={18} w="64%" mb={14} />
              <Skeleton h={12} w="46%" />
            </Box>
            <Stack gap={8} align="flex-end" w={160}>
              <Skeleton h={14} w={80} />
              <Skeleton h={20} w={120} />
              <Skeleton h={24} w={130} />
            </Stack>
          </Group>
        </Card>
      ))}
    </Stack>
  );
}

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

/** Estado vazio genérico (sem resultados). */
export function EmptyState({
  title,
  description,
  icon,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <Card withBorder radius="md" py={56} px="lg">
      <Stack align="center" gap="xs">
        <ThemeIcon variant="light" color="gray" radius="xl" size={56}>
          {icon ?? <IconSearch size={26} />}
        </ThemeIcon>
        <Text fz={17} fw={700} ta="center">
          {title}
        </Text>
        {description && (
          <Text c="dimmed" ta="center" maw={420} style={{ lineHeight: 1.5 }}>
            {description}
          </Text>
        )}
        {actionLabel && onAction && (
          <Button variant="default" mt="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        )}
      </Stack>
    </Card>
  );
}

interface ErrorStateProps {
  title: string;
  description?: string;
  onRetry?: () => void;
}

/** Estado de erro genérico, com botão "Tentar de novo". */
export function ErrorState({ title, description, onRetry }: ErrorStateProps) {
  return (
    <Card
      withBorder
      radius="md"
      py={52}
      px="lg"
      style={{ borderColor: 'var(--mantine-color-red-2)' }}
    >
      <Stack align="center" gap="xs">
        <ThemeIcon variant="light" color="red" radius="xl" size={56}>
          <IconAlertTriangle size={26} />
        </ThemeIcon>
        <Text fz={17} fw={700} ta="center">
          {title}
        </Text>
        {description && (
          <Text c="dimmed" ta="center" maw={420} style={{ lineHeight: 1.5 }}>
            {description}
          </Text>
        )}
        {onRetry && (
          <Button color="orange" mt="sm" onClick={onRetry}>
            Tentar de novo
          </Button>
        )}
      </Stack>
    </Card>
  );
}
