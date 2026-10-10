export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export interface HttpClient {
  get<T>(path: string, params?: Record<string, string | undefined>): Promise<T>
  post<T>(path: string, body: unknown): Promise<T>
  put<T>(path: string, body: unknown): Promise<T>
  patch<T>(path: string, body: unknown): Promise<T>
  delete(path: string, body?: unknown): Promise<void>
}

function buildUrl(
  baseUrl: string,
  path: string,
  params?: Record<string, string | undefined>,
): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== '') {
      search.set(key, value)
    }
  }
  const query = search.toString()
  return `${baseUrl}${path}${query ? `?${query}` : ''}`
}

async function errorFrom(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as { detail?: unknown }
    if (typeof body.detail === 'string') {
      return new ApiError(response.status, body.detail)
    }
  } catch {
    return new ApiError(response.status, response.statusText || 'Request failed')
  }
  return new ApiError(response.status, response.statusText || 'Request failed')
}

async function send(url: string, init: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch {
    throw new ApiError(0, 'Could not reach the SongTagger API.')
  }
  if (!response.ok) {
    throw await errorFrom(response)
  }
  return response
}

export function createHttpClient(baseUrl: string): HttpClient {
  const jsonHeaders = { 'Content-Type': 'application/json', Accept: 'application/json' }

  async function sendJson<T>(method: string, path: string, body: unknown): Promise<T> {
    const response = await send(buildUrl(baseUrl, path), {
      method,
      headers: jsonHeaders,
      body: JSON.stringify(body),
    })
    return (await response.json()) as T
  }

  return {
    async get<T>(path: string, params?: Record<string, string | undefined>) {
      const response = await send(buildUrl(baseUrl, path, params), {
        headers: { Accept: 'application/json' },
      })
      return (await response.json()) as T
    },
    post: (path, body) => sendJson('POST', path, body),
    put: (path, body) => sendJson('PUT', path, body),
    patch: (path, body) => sendJson('PATCH', path, body),
    async delete(path: string, body?: unknown) {
      await send(
        buildUrl(baseUrl, path),
        body === undefined
          ? { method: 'DELETE', headers: { Accept: 'application/json' } }
          : { method: 'DELETE', headers: jsonHeaders, body: JSON.stringify(body) },
      )
    },
  }
}
