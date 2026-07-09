import {
  Alert,
  Anchor,
  Box,
  Button,
  Checkbox,
  Divider,
  Group,
  PasswordInput,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthBrandPanel } from '../components/AuthBrandPanel';
import { GoogleButton } from '../components/GoogleButton';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/auth-context';
import { ApiError } from '../lib/api';
import { googleClientId } from '../lib/google';
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

export function RegisterPage() {
  const { status, register, loginGoogle } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [uf, setUf] = useState<string | null>(null);
  const [cnpj, setCnpj] = useState('');
  const [porte, setPorte] = useState<CompanyPorte | null>(null);
  const [aceite, setAceite] = useState(false);
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
    if (!aceite) {
      setErroGeral(
        'É preciso aceitar os Termos de Uso e a Política de Privacidade.',
      );
      return;
    }

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
        aceiteTermos: true,
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

  // Cadastrar/entrar com Google (T-126). O aceite (T-102) é o mesmo do formulário
  // — o botão fica bloqueado até marcá-lo, então aqui `aceite` já é true. Quem já
  // tem conta cai no login pelo mesmo endpoint e vai direto pra Home.
  async function handleGoogle(idToken: string) {
    setErroGeral(null);
    setSubmitting(true);
    try {
      const usuario = await loginGoogle(idToken, true);
      navigate(usuario.uf ? '/' : '/onboarding', { replace: true });
    } catch (err) {
      setErroGeral(
        err instanceof ApiError && err.status !== 0
          ? err.message
          : 'Não foi possível entrar com o Google. Tente novamente.',
      );
      setSubmitting(false);
    }
  }

  return (
    <Group h="100vh" gap={0} wrap="nowrap" align="stretch">
      <AuthBrandPanel
        titulo={
          <>
            Crie sua conta
            <br />e ache a obra certa.
          </>
        }
      />

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
        <Stack gap={22} w="100%" maw={400} py="xl">
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
            <Title order={2} fz={30} mt={6} style={{ letterSpacing: '-0.02em' }}>
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

          {/* Aceite ANTES do Google (decisão do dono): o consentimento LGPD
              (T-102) vale para os dois caminhos de cadastro, e o botão do Google
              cria a conta na hora — não haveria momento posterior para pedi-lo. */}
          <Checkbox
            checked={aceite}
            onChange={(e) => setAceite(e.currentTarget.checked)}
            label={
          <Text fz="sm">
            Li e aceito os{' '}
            <Anchor component={Link} to="/termos" target="_blank" fw={600}>
              Termos de Uso
            </Anchor>{' '}
            e a{' '}
            <Anchor
              component={Link}
              to="/privacidade"
              target="_blank"
              fw={600}
            >
              Política de Privacidade
            </Anchor>
            .
          </Text>
            }
            mt="xs"
          />

          {googleClientId() && (
            <>
              <GoogleButton
                onCredential={handleGoogle}
                text="signup_with"
                disabled={!aceite}
              />
              {!aceite && (
                <Text fz="xs" c="dimmed" ta="center" mt={-12}>
                  Marque o aceite acima para usar o Google.
                </Text>
              )}
              <Divider
                label="ou com e-mail"
                labelPosition="center"
                styles={{
                  label: {
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    fontSize: 12,
                    fontWeight: 600,
                  },
                }}
              />
            </>
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
              <Button type="submit" fullWidth loading={submitting} size="md">
                Criar conta
              </Button>
            </Stack>
          </form>

          <Text fz={13} c="dimmed" ta="center">
            Conexão segura · Seus dados não são compartilhados
          </Text>
        </Stack>
      </Box>
    </Group>
  );
}
