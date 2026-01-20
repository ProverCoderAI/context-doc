#!/usr/bin/env node
// CHANGE: add a shebang CLI shim for npx execution
// WHY: npx needs an executable entry that invokes the built main module
// QUOTE(TZ): "Только вызов нашего пакета должен быть"
// REF: user-2026-01-19-npx-check
// SOURCE: n/a
// FORMAT THEOREM: forall env: exec(bin) -> runMain(program)
// PURITY: SHELL
// EFFECT: Effect<void, never, RuntimeEnv | FileSystemService | CryptoService | Path>
// INVARIANT: built main module is executed exactly once per invocation
// COMPLEXITY: O(1)/O(1)
import "../dist/main.js"
