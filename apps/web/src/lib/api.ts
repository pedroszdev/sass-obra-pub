const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/** Erro de chamada à API. `status === 0` indica falha de rede/conexão. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** GET tipado contra a API do backend. Lança `ApiError` em falha de rede ou status != 2xx. */
export async function apiGet<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new ApiError(0, 'Não foi possível conectar ao servidor.');
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      `Erro ${response.status} ao acessar ${path}.`,
    );
  }

  return (await response.json()) as T;
}

export { API_URL };
