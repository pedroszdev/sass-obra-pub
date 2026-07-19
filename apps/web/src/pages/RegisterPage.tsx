import {
  Alert,
  Anchor,
  Box,
  Button,
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
import { SenhaRequisitos } from '../components/SenhaRequisitos';
import { useAuth } from '../context/auth-context';
import { ApiError } from '../lib/api';
import { googleClientId } from '../lib/google';
import {
  cnpjValido,
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

  return (
    <Group h="100vh" gap={0} wrap="nowrap" align="stretch">
      <AuthBrandPanel
        titulo={
          <>
            Comece a ganhar
            <br />
            obra pública.
          </>
        }
        beneficios={[
          { strong: 'Grátis para começar,', rest: 'sem cartão de crédito' },
          { strong: 'Obras da sua região,', rest: 'encontradas automaticamente' },
          { strong: 'Edital de 80 páginas', rest: 'resumido em 1 tela' },
        ]}
      />

      {/* Formulário de cadastro. */}
      {/* Centralização por `margin: auto` no filho, NÃO por `alignItems: center`
          no pai: com align-items o conteúdo mais alto que a tela transborda para
          os dois lados e o topo fica INALCANÇÁVEL na rolagem — no celular o
          cadastro (form longo) perdia o logo e o "Criar conta / Bora começar".
          Com margin auto ele centraliza quando sobra espaço e rola quando falta. */}
      <Box
        style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          backgroundColor: 'var(--mantine-color-concreto-2)',
          overflowY: 'auto',
        }}
        p="xl"
      >
        <Stack gap={22} w="100%" maw={400} py="xl" style={{ margin: 'auto' }}>
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

          {googleClientId() && (
            <>
              {/* Cadastro pelo Google (T-126b): sai daqui por redirect e volta em
                  /entrando com a sessão pronta. O aceite (T-102) é implícito — o
                  aviso do rodapé do formulário vale para os dois caminhos. */}
              <GoogleButton modo="redirect" text="signup_with" />
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
              <Box>
                <PasswordInput
                  label="Senha"
                  placeholder="Crie uma senha forte"
                  value={password}
                  onChange={(e) => setPassword(e.currentTarget.value)}
                  error={erros.password}
                  autoComplete="new-password"
                  size="md"
                />
                <SenhaRequisitos senha={password} />
              </Box>
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
                // T-172: feedback imediato ao sair do campo, sem esperar o submit.
                onBlur={() =>
                  setErros((prev) => ({
                    ...prev,
                    cnpj:
                      cnpj.trim() && !cnpjValido(cnpj)
                        ? 'CNPJ inválido. Confira os números (ou deixe em branco).'
                        : undefined,
                  }))
                }
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
              {/* Consentimento implícito (decisão do dono): sem checkbox. Vale
                  para os DOIS caminhos de cadastro — o do Google, acima, também
                  cria a conta. O backend segue gravando `terms_accepted_at`. */}
              <Text fz="xs" c="dimmed" ta="center">
                Ao criar a conta você concorda com os{' '}
                <Anchor component={Link} to="/termos" target="_blank" fz="xs" fw={600}>
                  Termos de uso
                </Anchor>{' '}
                e a{' '}
                <Anchor
                  component={Link}
                  to="/privacidade"
                  target="_blank"
                  fz="xs"
                  fw={600}
                >
                  Política de privacidade
                </Anchor>
                .
              </Text>
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
