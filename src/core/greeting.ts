import { Option } from "effect";

export interface AppProfile {
	readonly name: string;
	readonly mission: string;
}

export interface Greeting {
	readonly message: string;
}

const normalize = (value: string): string => value.trim();

const isNonEmpty = (value: string): boolean => value.length > 0;

/**
 * CHANGE: Introduce pure greeting synthesis for console entrypoint
 * WHY: Provide mathematically checkable construction of startup banner without side effects
 * QUOTE(ТЗ): "Каждая функция — это теорема."
 * REF: REQ-GREETING-CORE
 * SOURCE: AGENTS.md – функциональное ядро без побочных эффектов
 * FORMAT THEOREM: ∀p ∈ AppProfile: valid(p) → nonEmpty(buildGreeting(p).message)
 * PURITY: CORE
 * EFFECT: None (pure)
 * INVARIANT: output.message.length > 0 when Option is Some
 * COMPLEXITY: O(1)/O(1)
 */
export const buildGreeting = (profile: AppProfile): Option.Option<Greeting> => {
	const trimmedName = normalize(profile.name);
	const trimmedMission = normalize(profile.mission);

	if (!isNonEmpty(trimmedName) || !isNonEmpty(trimmedMission)) {
		return Option.none();
	}

	return Option.some({
		message: `${trimmedName}: ${trimmedMission}`,
	});
};
