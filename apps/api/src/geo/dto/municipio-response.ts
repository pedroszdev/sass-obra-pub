// Município exposto por GET /geo/municipios — só o que o front precisa para o
// seletor de município da busca (chave estável = código IBGE).
export interface MunicipioResponse {
  codigoIbge: string;
  nome: string;
}
