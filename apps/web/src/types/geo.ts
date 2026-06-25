// Município do IBGE servido por GET /geo/municipios. Chave estável = código IBGE
// (7 dígitos), que o filtro de busca envia à API.
export interface Municipio {
  codigoIbge: string;
  nome: string;
}
