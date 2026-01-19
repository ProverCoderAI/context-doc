import { Context, Effect, Layer, pipe } from "effect"

export class CryptoService extends Context.Tag("CryptoService")<
  CryptoService,
  {
    readonly sha256: (value: string) => Effect.Effect<string, CryptoError>
  }
>() {}

export interface CryptoError {
  readonly _tag: "CryptoError"
  readonly reason: string
}

const cryptoError = (reason: string): CryptoError => ({
  _tag: "CryptoError",
  reason
})

const toHex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")

const digestSha256 = (value: string): Effect.Effect<string, CryptoError> =>
  pipe(
    Effect.tryPromise({
      try: () => {
        const crypto = globalThis.crypto
        const bytes = new TextEncoder().encode(value)
        return crypto.subtle.digest("SHA-256", bytes)
      },
      catch: (error) => cryptoError(error instanceof Error ? error.message : "Crypto digest failed")
    }),
    Effect.map((buffer) => toHex(buffer))
  )

// CHANGE: isolate hashing behind a service for deterministic testing
// WHY: avoid direct crypto usage in shell logic
// QUOTE(TZ): "Внешние зависимости: только через типизированные интерфейсы"
// REF: user-2026-01-19-sync-rewrite
// SOURCE: n/a
// FORMAT THEOREM: forall s: sha256(s) -> hex(s)
// PURITY: SHELL
// EFFECT: Effect<CryptoService, never, never>
// INVARIANT: sha256 output length = 64
// COMPLEXITY: O(n)/O(1)
export const CryptoServiceLive = Layer.succeed(CryptoService, {
  sha256: (value) => digestSha256(value)
})
