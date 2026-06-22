// Subconjunto de municípios por UF para o Select de município do filtro.
//
// ⚠️ Stopgap: o backend já tem os 5.571 municípios do IBGE (tabela `municipios`),
// mas ainda não há endpoint para listá-los por UF. Quando existir um
// `GET /geo/municipios?uf=` este arquivo é substituído por uma busca remota.
// O filtro resolve o município para o `codigoIbge` (7 dígitos) que a API espera.
export interface Municipio {
  nome: string;
  codigoIbge: string;
}

export const MUNICIPIOS_POR_UF: Record<string, Municipio[]> = {
  SC: [
    { nome: 'Florianópolis', codigoIbge: '4205407' },
    { nome: 'Joinville', codigoIbge: '4209102' },
    { nome: 'Blumenau', codigoIbge: '4202404' },
    { nome: 'Chapecó', codigoIbge: '4204202' },
    { nome: 'Criciúma', codigoIbge: '4204608' },
    { nome: 'Lages', codigoIbge: '4209300' },
    { nome: 'Itajaí', codigoIbge: '4208203' },
    { nome: 'São José', codigoIbge: '4216602' },
    { nome: 'Tubarão', codigoIbge: '4218707' },
    { nome: 'Brusque', codigoIbge: '4204301' },
  ],
  PR: [
    { nome: 'Curitiba', codigoIbge: '4106902' },
    { nome: 'Londrina', codigoIbge: '4113700' },
    { nome: 'Maringá', codigoIbge: '4115200' },
    { nome: 'Cascavel', codigoIbge: '4104808' },
    { nome: 'Ponta Grossa', codigoIbge: '4119905' },
  ],
  RS: [
    { nome: 'Porto Alegre', codigoIbge: '4314902' },
    { nome: 'Caxias do Sul', codigoIbge: '4305108' },
    { nome: 'Pelotas', codigoIbge: '4314407' },
    { nome: 'Santa Maria', codigoIbge: '4316907' },
  ],
  SP: [
    { nome: 'São Paulo', codigoIbge: '3550308' },
    { nome: 'Campinas', codigoIbge: '3509502' },
    { nome: 'Ribeirão Preto', codigoIbge: '3543402' },
    { nome: 'Sorocaba', codigoIbge: '3552205' },
  ],
  MG: [
    { nome: 'Belo Horizonte', codigoIbge: '3106200' },
    { nome: 'Uberlândia', codigoIbge: '3170206' },
    { nome: 'Juiz de Fora', codigoIbge: '3136702' },
  ],
  BA: [
    { nome: 'Salvador', codigoIbge: '2927408' },
    { nome: 'Feira de Santana', codigoIbge: '2910800' },
  ],
};

const nomeByIbge = new Map<string, string>();
for (const municipios of Object.values(MUNICIPIOS_POR_UF)) {
  for (const m of municipios) nomeByIbge.set(m.codigoIbge, m.nome);
}

/** Nome do município por código IBGE (ou o próprio código, se desconhecido). */
export function municipioNome(codigoIbge: string): string {
  return nomeByIbge.get(codigoIbge) ?? codigoIbge;
}
