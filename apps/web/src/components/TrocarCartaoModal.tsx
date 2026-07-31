import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { useState } from 'react';
import { trocarCartao } from '../lib/api';
import { cnpjValido, formatarCnpj, soDigitos } from '../lib/cadastro';
import {
  bandeiraDoNumero,
  formatarCep,
  formatarNumeroCartao,
  formatarValidade,
  numeroCartaoPlausivel,
  partesDaValidade,
  passaNoLuhn,
  tamanhoDoCvv,
  validadeExpirada,
} from '../lib/cartao';
import { formatarTelefone, telefoneValido } from '../lib/telefone';

// Troca de cartão (Épico 17). ⚠️ ÚNICA tela do produto que coleta dado de
// cartão — decisão do dono (31/07) de aceitar o escopo PCI SAQ A-EP, porque sem
// ela cartão vencido deixava o cliente em `past_due` sem saída.
//
// 🔴 REGRAS DESTA TELA:
//   1. **Nada é guardado.** Nenhum `localStorage`, nenhum estado que sobreviva
//      ao fechamento do modal, nenhum log. Os campos morrem com o componente.
//   2. **Nada é enviado a terceiros.** Só ao nosso backend, por HTTPS, que
//      repassa ao provedor sem persistir.
//   3. **`autoComplete` fica LIGADO de propósito** — o gerenciador do navegador
//      erra menos que o usuário digitando; o que não pode é NÓS guardarmos.
//
// Máscara e validação vivem em `lib/cartao.ts`, puras e testadas: campo de
// pagamento que aceita lixo é venda perdida, e o erro só apareceria depois de
// uma recusa do emissor — tarde, lenta e assustadora.

const NOMES_BANDEIRA: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  elo: 'Elo',
  hipercard: 'Hipercard',
};

interface Props {
  aberto: boolean;
  onFechar: () => void;
  onTrocado: (mascarado: { ultimos4: string; bandeira: string }) => void;
}

export function TrocarCartaoModal({ aberto, onFechar, onTrocado }: Props) {
  const [numero, setNumero] = useState('');
  const [nome, setNome] = useState('');
  const [validade, setValidade] = useState('');
  const [cvv, setCvv] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [email, setEmail] = useState('');
  const [cep, setCep] = useState('');
  const [numeroEndereco, setNumeroEndereco] = useState('');
  const [telefone, setTelefone] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [tocado, setTocado] = useState<Record<string, boolean>>({});

  const bandeira = bandeiraDoNumero(numero);
  const maxCvv = tamanhoDoCvv(bandeira);

  // Erros que BLOQUEIAM o envio.
  const erros: Record<string, string | undefined> = {
    numero: !numeroCartaoPlausivel(numero) ? 'Número incompleto.' : undefined,
    nome: nome.trim().length < 3 ? 'Informe o nome impresso no cartão.' : undefined,
    validade: !partesDaValidade(validade)
      ? 'Use o formato MM/AA.'
      : validadeExpirada(validade)
        ? 'Este cartão está vencido.'
        : undefined,
    cvv:
      soDigitos(cvv).length !== maxCvv ? `O CVV tem ${maxCvv} dígitos.` : undefined,
    cnpj: !cnpjValido(cnpj) ? 'CNPJ inválido.' : undefined,
    email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      ? 'E-mail inválido.'
      : undefined,
    cep: soDigitos(cep).length !== 8 ? 'O CEP tem 8 dígitos.' : undefined,
    numeroEndereco: !numeroEndereco.trim() ? 'Informe o número.' : undefined,
    telefone: !telefoneValido(telefone) ? 'Telefone incompleto.' : undefined,
  };
  const valido = Object.values(erros).every((e) => !e);

  // ⚠️ AVISO, não erro: o Luhn reprova o cartão de teste do sandbox, então
  // bloquear por ele deixaria o caminho feliz intestável. Como aviso, pega o
  // dígito trocado antes de o cliente levar uma recusa do emissor.
  const avisoLuhn =
    numeroCartaoPlausivel(numero) && !passaNoLuhn(numero)
      ? 'Confira o número — ele não parece válido.'
      : null;

  // Erro só depois que o campo perdeu o foco: acusar enquanto a pessoa digita é
  // ruído, não ajuda.
  const mostrar = (campo: string) => (tocado[campo] ? erros[campo] : undefined);
  const marcar = (campo: string) => () =>
    setTocado((t) => ({ ...t, [campo]: true }));

  function limpar() {
    setNumero('');
    setNome('');
    setValidade('');
    setCvv('');
    setErro(null);
    setTocado({});
  }

  function fechar() {
    limpar();
    onFechar();
  }

  async function enviar() {
    const partes = partesDaValidade(validade);
    if (!partes) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await trocarCartao({
        cartao: {
          holderName: nome.trim().toUpperCase(),
          number: soDigitos(numero),
          expiryMonth: partes.mes,
          expiryYear: partes.ano,
          ccv: soDigitos(cvv),
        },
        titular: {
          name: nome.trim(),
          email: email.trim(),
          cpfCnpj: soDigitos(cnpj),
          postalCode: soDigitos(cep),
          addressNumber: numeroEndereco.trim(),
          phone: soDigitos(telefone),
        },
      });
      limpar();
      onTrocado(r);
      onFechar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal opened={aberto} onClose={fechar} title="Trocar cartão" size="md">
      <Stack gap="sm">
        {erro && <Alert color="red">{erro}</Alert>}

        <TextInput
          label="Número do cartão"
          placeholder="0000 0000 0000 0000"
          value={numero}
          onChange={(e) => setNumero(formatarNumeroCartao(e.currentTarget.value))}
          onBlur={marcar('numero')}
          error={mostrar('numero')}
          inputMode="numeric"
          autoComplete="cc-number"
          rightSection={
            bandeira ? (
              <Badge size="xs" variant="light">
                {NOMES_BANDEIRA[bandeira]}
              </Badge>
            ) : null
          }
          rightSectionWidth={bandeira ? 92 : undefined}
        />
        {avisoLuhn && !mostrar('numero') && (
          <Text fz="xs" c="alerta.6" mt={-6}>
            {avisoLuhn}
          </Text>
        )}

        <TextInput
          label="Nome impresso no cartão"
          placeholder="COMO ESTÁ NO CARTÃO"
          value={nome}
          onChange={(e) => setNome(e.currentTarget.value)}
          onBlur={marcar('nome')}
          error={mostrar('nome')}
          autoComplete="cc-name"
          maxLength={100}
        />

        <Group grow align="flex-start">
          <TextInput
            label="Validade"
            description="Mês/ano, como no cartão"
            placeholder="MM/AA"
            value={validade}
            onChange={(e) => setValidade(formatarValidade(e.currentTarget.value))}
            onBlur={marcar('validade')}
            error={mostrar('validade')}
            inputMode="numeric"
            autoComplete="cc-exp"
          />
          <TextInput
            label="CVV"
            description={`${maxCvv} dígitos no verso`}
            placeholder={'0'.repeat(maxCvv)}
            value={cvv}
            onChange={(e) =>
              setCvv(soDigitos(e.currentTarget.value).slice(0, maxCvv))
            }
            onBlur={marcar('cvv')}
            error={mostrar('cvv')}
            inputMode="numeric"
            autoComplete="cc-csc"
          />
        </Group>

        <Divider my="xs" label="Dados do titular" labelPosition="left" />
        <Text fz="xs" c="dimmed" mt={-10}>
          Exigidos pelo processador de pagamento para a análise antifraude.
        </Text>

        <TextInput
          label="CNPJ da empresa"
          placeholder="00.000.000/0000-00"
          value={cnpj}
          onChange={(e) => setCnpj(formatarCnpj(e.currentTarget.value))}
          onBlur={marcar('cnpj')}
          error={mostrar('cnpj')}
          inputMode="numeric"
        />

        <TextInput
          label="E-mail"
          placeholder="voce@empresa.com.br"
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
          onBlur={marcar('email')}
          error={mostrar('email')}
          type="email"
          maxLength={255}
        />

        <Group grow align="flex-start">
          <TextInput
            label="CEP"
            placeholder="00000-000"
            value={cep}
            onChange={(e) => setCep(formatarCep(e.currentTarget.value))}
            onBlur={marcar('cep')}
            error={mostrar('cep')}
            inputMode="numeric"
          />
          <TextInput
            label="Número"
            placeholder="123"
            value={numeroEndereco}
            onChange={(e) =>
              setNumeroEndereco(e.currentTarget.value.slice(0, 10))
            }
            onBlur={marcar('numeroEndereco')}
            error={mostrar('numeroEndereco')}
            maxLength={10}
          />
        </Group>

        <TextInput
          label="Telefone"
          placeholder="(00) 00000-0000"
          value={telefone}
          onChange={(e) => setTelefone(formatarTelefone(e.currentTarget.value))}
          onBlur={marcar('telefone')}
          error={mostrar('telefone')}
          inputMode="numeric"
        />

        <Group gap={6} mt="xs" wrap="nowrap" align="flex-start">
          <IconLock size={13} style={{ marginTop: 3, flex: 'none' }} />
          <Text fz="xs" c="dimmed">
            Não guardamos os dados do seu cartão. Eles vão direto ao nosso
            processador de pagamento, por conexão criptografada.
          </Text>
        </Group>

        <Button
          onClick={() => void enviar()}
          loading={salvando}
          disabled={!valido}
          mt="xs"
        >
          Trocar cartão
        </Button>
      </Stack>
    </Modal>
  );
}
