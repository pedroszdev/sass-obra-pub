import {
  Alert,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { useState } from 'react';
import { trocarCartao } from '../lib/api';
import { soDigitos } from '../lib/cadastro';

// Troca de cartão (Épico 17). ⚠️ ÚNICA tela do produto que coleta dado de
// cartão — decisão do dono (31/07) de aceitar o escopo PCI SAQ A-EP, porque sem
// ela cartão vencido deixava o cliente em `past_due` sem saída.
//
// 🔴 REGRAS DESTA TELA:
//   1. **Nada é guardado.** Nenhum `localStorage`, nenhum estado que sobreviva
//      ao fechamento do modal, nenhum log. Os campos morrem com o componente.
//   2. **Nada é enviado a terceiros.** Só ao nosso backend, por HTTPS, que
//      repassa ao Asaas sem persistir.
//   3. **`autoComplete` do cartão fica LIGADO de propósito** — o gerenciador do
//      navegador é mais seguro que o usuário digitando errado três vezes; o que
//      não pode é NÓS guardarmos.

interface Props {
  aberto: boolean;
  onFechar: () => void;
  onTrocado: (mascarado: { ultimos4: string; bandeira: string }) => void;
}

export function TrocarCartaoModal({ aberto, onFechar, onTrocado }: Props) {
  const [numero, setNumero] = useState('');
  const [nome, setNome] = useState('');
  const [mes, setMes] = useState('');
  const [ano, setAno] = useState('');
  const [cvv, setCvv] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [cep, setCep] = useState('');
  const [numeroEndereco, setNumeroEndereco] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function limpar() {
    // Zera tudo ao fechar: dado de cartão não fica em memória à toa.
    setNumero('');
    setNome('');
    setMes('');
    setAno('');
    setCvv('');
    setErro(null);
  }

  async function enviar() {
    setSalvando(true);
    setErro(null);
    try {
      const r = await trocarCartao({
        cartao: {
          holderName: nome.trim().toUpperCase(),
          number: soDigitos(numero),
          expiryMonth: mes.padStart(2, '0'),
          expiryYear: ano.length === 2 ? `20${ano}` : ano,
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
    <Modal
      opened={aberto}
      onClose={() => {
        limpar();
        onFechar();
      }}
      title="Trocar cartão"
      size="md"
    >
      <Stack gap="sm">
        {erro && <Alert color="red">{erro}</Alert>}

        <TextInput
          label="Número do cartão"
          placeholder="0000 0000 0000 0000"
          value={numero}
          onChange={(e) => setNumero(e.currentTarget.value)}
          inputMode="numeric"
          autoComplete="cc-number"
          required
        />
        <TextInput
          label="Nome como está no cartão"
          value={nome}
          onChange={(e) => setNome(e.currentTarget.value)}
          autoComplete="cc-name"
          required
        />
        <Group grow>
          <TextInput
            label="Mês"
            placeholder="12"
            value={mes}
            onChange={(e) => setMes(e.currentTarget.value)}
            inputMode="numeric"
            autoComplete="cc-exp-month"
            required
          />
          <TextInput
            label="Ano"
            placeholder="2030"
            value={ano}
            onChange={(e) => setAno(e.currentTarget.value)}
            inputMode="numeric"
            autoComplete="cc-exp-year"
            required
          />
          <TextInput
            label="CVV"
            placeholder="123"
            value={cvv}
            onChange={(e) => setCvv(e.currentTarget.value)}
            inputMode="numeric"
            autoComplete="cc-csc"
            required
          />
        </Group>

        <Text fz="xs" c="dimmed" mt="xs">
          Dados do titular — o Asaas exige para a análise antifraude.
        </Text>
        <TextInput
          label="CNPJ da empresa"
          placeholder="00.000.000/0000-00"
          value={cnpj}
          onChange={(e) => setCnpj(e.currentTarget.value)}
          inputMode="numeric"
          required
        />
        <TextInput
          label="E-mail"
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
          type="email"
          required
        />
        <Group grow>
          <TextInput
            label="CEP"
            placeholder="00000-000"
            value={cep}
            onChange={(e) => setCep(e.currentTarget.value)}
            inputMode="numeric"
            required
          />
          <TextInput
            label="Número"
            value={numeroEndereco}
            onChange={(e) => setNumeroEndereco(e.currentTarget.value)}
            required
          />
        </Group>
        <TextInput
          label="Telefone"
          placeholder="(00) 00000-0000"
          value={telefone}
          onChange={(e) => setTelefone(e.currentTarget.value)}
          inputMode="numeric"
          required
        />

        <Group gap={6} mt="xs">
          <IconLock size={13} color="var(--mantine-color-dimmed)" />
          <Text fz="xs" c="dimmed">
            Não guardamos os dados do seu cartão. Eles vão direto ao nosso
            processador de pagamento.
          </Text>
        </Group>

        <Button onClick={() => void enviar()} loading={salvando} mt="sm">
          Trocar cartão
        </Button>
      </Stack>
    </Modal>
  );
}
