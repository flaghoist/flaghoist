import { beforeEach, vi } from 'vitest'

// The sign-in screen asks the server what sign-in it offers as soon as it mounts. Answer as a server
// without accounts would, so no test reaches for the network unless it stubs fetch itself.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('Not found', { status: 404 })),
  )
})
