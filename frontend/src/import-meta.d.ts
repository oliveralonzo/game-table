interface ImportMetaEnv {
    readonly DEV: boolean;
    readonly VITE_PLAYTEST_TOKENS?: string;
    readonly VITE_BACKEND_URL?: string;
    readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
    readonly VITE_SOCKET_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
