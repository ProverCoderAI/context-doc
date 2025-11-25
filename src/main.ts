import { Console, Effect, Option, pipe } from "effect";
import { match } from "ts-pattern";
import type { AppProfile } from "./core/greeting.js";
import { buildGreeting } from "./core/greeting.js";

interface StartupError {
	readonly _tag: "StartupError";
	readonly reason: string;
}

const appProfile: AppProfile = {
	name: "Context Console",
	mission: "Functional core ready for verifiable effects",
};

const toStartupError = (reason: string): StartupError => ({
	_tag: "StartupError",
	reason,
});

/**
 * CHANGE: Compose shell-level startup program around pure greeting builder
 * WHY: Isolate side effects (console IO) while delegating computation to functional core
 * QUOTE(ТЗ): "FUNCTIONAL CORE, IMPERATIVE SHELL"
 * REF: REQ-SHELL-STARTUP
 * SOURCE: AGENTS.md — эффекты только в SHELL
 * FORMAT THEOREM: ∀profile: valid(profile) → logs(buildGreeting(profile))
 * PURITY: SHELL
 * EFFECT: Effect<void, StartupError, Console>
 * INVARIANT: Console side-effects occur once and only after successful greeting synthesis
 * COMPLEXITY: O(1)/O(1)
 */
const program = pipe(
	Effect.succeed(buildGreeting(appProfile)),
	Effect.filterOrFail(Option.isSome, () =>
		toStartupError("Profile must not be empty"),
	),
	Effect.map((option) => option.value),
	Effect.flatMap((greeting) => Console.log(greeting.message)),
	Effect.catchAll((error) =>
		match(error)
			.with({ _tag: "StartupError" }, (startupError) =>
				Console.error(`StartupError: ${startupError.reason}`),
			)
			.exhaustive(),
	),
);

Effect.runSync(program);
