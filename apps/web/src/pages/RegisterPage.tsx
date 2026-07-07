import {
  Alert,
  Anchor,
  Box,
  Button,
  Group,
  PasswordInput,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconAlertTriangle, IconCheck } from '@tabler/icons-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/auth-context';
import { ApiError } from '../lib/api';
import {
  formatarCnpj,
  soDigitos,
  validarRegistro,
  type RegistroErros,
} from '../lib/cadastro';
import { UFS } from '../data/ufs';
import type { CompanyPorte } from '../types/auth';

const UF_OPTIONS = UFS.map((uf) => ({ value: uf.code, label: uf.name }));
const PORTE_OPTIONS: { value: CompanyPorte; label: string }[] = [
  { value: 'ME', label: 'Microempresa (ME)' },
  { value: 'EPP', label: 'Empresa de Pequeno Porte (EPP)' },
  { value: 'DEMAIS', label: 'Demais portes' },
];

const SELLING_POINTS = [
  'Grátis para começar',
  'Obras da sua região, automático',
  'A gente diz se você está apto',
];

export function RegisterPage() {
  const { status, register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [uf, setUf] = useState<string | null>(null);
  const [cnpj, setCnpj] = useState('');
  const [porte, setPorte] = useState<CompanyPorte | null>(null);
  const [erros, setErros] = useState<RegistroErros>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Já logado ao cair aqui (ex.: link manual) → volta pra Home. Só no mount:
  // depois do cadastro nós mesmos navegamos pro onboarding (sem competir).
  useEffect(() => {
    if (status === 'authenticated') {
      navigate('/', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErroGeral(null);
    const form = { name, email, password, uf: uf ?? '', cnpj };
    const encontrados = validarRegistro(form);
    setErros(encontrados);
    if (Object.keys(encontrados).length > 0) return;

    setSubmitting(true);
    try {
      const cnpjDigitos = soDigitos(cnpj);
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
        uf: uf as string,
        cnpj: cnpjDigitos.length === 14 ? cnpjDigitos : undefined,
        porte: porte ?? undefined,
      });
      // Cadastrou e já está logado → segue pro onboarding (T-108).
      navigate('/onboarding', { replace: true });
    } catch (err) {
      setErroGeral(
        err instanceof ApiError && err.status !== 0
          ? err.message
          : 'Não foi possível criar a conta. Verifique a conexão e tente novamente.',
      );
      setSubmitting(false);
    }
  }

  return (
    <Group h="100vh" gap={0} wrap="nowrap" align="stretch">
      {/* Painel da marca — só no desktop. */}
      <Box
        visibleFrom="md"
        p={48}
        style={{
          flex: '0 0 42%',
          backgroundColor: 'var(--mantine-color-graphite-9)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <Logo variant="onDark" size={30} />
        <Box>
          <Title
            order={1}
            c="concreto.2"
            fz={40}
            lh={1.05}
            style={{ letterSpacing: '-0.02em' }}
          >
            Crie sua conta
            <br />
            e ache a próxima obra.
          </Title>
          <Text c="concreto.5" fz="md" mt="md" maw={360}>
            Leva um minuto. Depois é só dizer sua região que a gente traz as
            licitações de obra pública perto de você.
          </Text>
          <Stack gap="xs" mt={28}>
            {SELLING_POINTS.map((point) => (
              <Group key={point} gap="xs" wrap="nowrap">
                <IconCheck size={17} color="var(--mantine-color-orange-7)" stroke={2.6} />
                <Text c="concreto.3" fz="sm">
                  {point}
                </Text>
              </Group>
            ))}
          </Stack>
        </Box>
      </Box>

      {/* Formulário de cadastro. */}
      <Box
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--mantine-color-concreto-2)',
          overflowY: 'auto',
        }}
        p="xl"
      >
        <Stack gap="lg" w="100%" maw={400} py="xl">
          <Box hiddenFrom="md">
            <Logo variant="onLight" size={28} />
          </Box>

          <Box>
            <Text
              span
              fz={12}
              fw={500}
              c="orange.8"
              style={{
                fontFamily: 'var(--mantine-font-family-monospace)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              Criar conta
            </Text>
            <Title order={2} fz={28} mt={6} style={{ letterSpacing: '-0.01em' }}>
              Bora começar.
            </Title>
            <Text c="dimmed" fz="sm" mt={4}>
              Já tem conta?{' '}
              <Anchor component={Link} to="/login" fw={600}>
                Entrar
              </Anchor>
            </Text>
          </Box>

          {erroGeral && (
            <Alert color="alerta" variant="light" icon={<IconAlertTriangle size={18} />}>
              {erroGeral}
            </Alert>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <Stack gap="md">
              <TextInput
                label="Seu nome"
                placeholder="Como podemos te chamar"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                error={erros.name}
                autoComplete="name"
                size="md"
              />
              <TextInput
                label="E-mail"
                type="email"
                placeholder="voce@empresa.com.br"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                error={erros.email}
                autoComplete="email"
                size="md"
              />
              <PasswordInput
                label="Senha"
                placeholder="Pelo menos 8 caracteres"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                error={erros.password}
                autoComplete="new-password"
                size="md"
              />
              <Select
                label="Estado da sua empresa"
                placeholder="Escolha a UF"
                data={UF_OPTIONS}
                value={uf}
                onChange={setUf}
                error={erros.uf}
                searchable
                size="md"
              />
              <TextInput
                label="CNPJ (opcional)"
                placeholder="00.000.000/0000-00"
                value={cnpj}
                onChange={(e) => setCnpj(formatarCnpj(e.currentTarget.value))}
                error={erros.cnpj}
                inputMode="numeric"
                size="md"
              />
              <Select
                label="Porte da empresa (opcional)"
                placeholder="Se souber"
                data={PORTE_OPTIONS}
                value={porte}
                onChange={(v) => setPorte(v as CompanyPorte | null)}
                clearable
                size="md"
              />
              <Button type="submit" fullWidth loading={submitting} mt="xs" size="md">
                Criar conta
              </Button>
            </Stack>
          </form>
        </Stack>
      </Box>
    </Group>
  );
}
