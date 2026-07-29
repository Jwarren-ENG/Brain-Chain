"use client";

import { getStoredUser, getToken } from "@/lib/api";
import type { UserInfo } from "@brainchain/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 },
  },
});

interface SessionContextValue {
  user: UserInfo | null;
  setUser: (user: UserInfo | null) => void;
}

export const SessionContext = React.createContext<SessionContextValue>({
  user: null,
  setUser: () => {},
});

export function useSession() {
  return React.useContext(SessionContext);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<UserInfo | null>(null);
  const [ready, setReady] = React.useState(false);
  const pathname = usePathname();
  const router = useRouter();

  React.useEffect(() => {
    const stored = getStoredUser();
    setUser(stored);
    setReady(true);
    if (!getToken() && !pathname.startsWith("/login")) {
      router.replace("/login");
    }
  }, [pathname, router]);

  return (
    <QueryClientProvider client={queryClient}>
      <SessionContext.Provider value={{ user, setUser }}>
        {ready ? children : null}
      </SessionContext.Provider>
    </QueryClientProvider>
  );
}

/* ------------------------------------------------------------------- theme */
export function useTheme() {
  // Dark is the reference theme of the adopted design language.
  const [theme, setThemeState] = React.useState<"light" | "dark">("dark");
  React.useEffect(() => {
    const stored = (window.localStorage.getItem("brainchain_theme") as "light" | "dark") || "dark";
    setThemeState(stored);
    document.documentElement.classList.toggle("dark", stored === "dark");
  }, []);
  const setTheme = (next: "light" | "dark") => {
    setThemeState(next);
    window.localStorage.setItem("brainchain_theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };
  return { theme, setTheme };
}
