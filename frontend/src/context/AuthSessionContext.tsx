import {
    createContext,
    useCallback,
    useContext,
    type ReactNode,
} from "react";
import { useAuth } from "@clerk/react";
import { useClerk } from "@clerk/react";

type AuthSessionAPI = {
    authUserId: string | null;
    isAuthLoaded: boolean;
    isSignedIn: boolean;
    getAuthToken: () => Promise<string | null>;
    signOut: () => Promise<void>;
};

const AuthSessionContext = createContext<AuthSessionAPI>({
    authUserId: null,
    isAuthLoaded: true,
    isSignedIn: false,
    getAuthToken: async () => null,
    signOut: async () => undefined,
});

export function AnonymousAuthSessionProvider({ children }: { children: ReactNode }) {
    return (
        <AuthSessionContext.Provider
            value={{
                authUserId: null,
                isAuthLoaded: true,
                isSignedIn: false,
                getAuthToken: async () => null,
                signOut: async () => undefined,
            }}
        >
            {children}
        </AuthSessionContext.Provider>
    );
}

export function ClerkAuthSessionProvider({ children }: { children: ReactNode }) {
    const { isLoaded, isSignedIn, getToken, userId } = useAuth();
    const { signOut: clerkSignOut } = useClerk();

    const getAuthToken = useCallback(async () => {
        if (!isLoaded || !isSignedIn) {
            return null;
        }

        return await getToken();
    }, [getToken, isLoaded, isSignedIn]);

    const signOut = useCallback(async () => {
        await clerkSignOut();
    }, [clerkSignOut]);

    return (
        <AuthSessionContext.Provider
            value={{
                authUserId: userId ?? null,
                isAuthLoaded: isLoaded,
                isSignedIn: !!isSignedIn,
                getAuthToken,
                signOut,
            }}
        >
            {children}
        </AuthSessionContext.Provider>
    );
}

export function useAuthSession() {
    return useContext(AuthSessionContext);
}
