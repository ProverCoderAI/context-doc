declare global {
	namespace NodeJS {
		interface ProcessEnv {
			readonly CODEX_SOURCE_DIR?: string;
			readonly QWEN_SOURCE_DIR?: string;
		}
	}
}

export {};
