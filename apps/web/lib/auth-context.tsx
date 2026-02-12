"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  EventRole,
  Permission,
  ROLE_PERMISSIONS,
} from "@event-platform/shared";
import { toast } from "sonner";

/* ---------- Types ---------- */

export interface User {
  id: string;
  email: string;
  isGlobalAdmin: boolean;
  fullName?: string;
  emailVerified?: boolean;
  emailVerificationRequired?: boolean;
  mustVerifyEmail?: boolean;
  sessionCreatedAt?: number | null;
  eventRoles?: Array<{
    eventId: string;
    role: string;
  }>;
}

interface AuthState {
  user: User | null;
  csrfToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<User | null>;
  signup: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/* ---------- Constants ---------- */

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

/* ---------- Provider ---------- */

export function AuthProvider({
  children,
  bootstrapOnMount = true,
}: {
  children: React.ReactNode;
  bootstrapOnMount?: boolean;
}) {
  const [state, setState] = useState<AuthState>({
    user: null,
    csrfToken: null,
    isLoading: bootstrapOnMount,
    isAuthenticated: false,
  });
  const hasBootstrapped = useRef(false);

  /** Fetch CSRF token - establishes session cookie */
  const fetchCsrf = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch(`${API_URL}/auth/csrf`, {
        credentials: "include",
      });
      if (!res.ok) return null;
      const data = await res.json();
      const token = data.csrfToken ?? data.token ?? null;
      setState((s) => ({ ...s, csrfToken: token }));
      return token;
    } catch {
      return null;
    }
  }, []);

  /** Fetch current user profile */
  const fetchUser = useCallback(async (): Promise<User | null> => {
    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        credentials: "include",
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.user ?? data;
    } catch {
      return null;
    }
  }, []);

  /** Initialize auth on mount */
  useEffect(() => {
    if (!bootstrapOnMount) {
      return;
    }
    if (hasBootstrapped.current) {
      return;
    }
    hasBootstrapped.current = true;

    let cancelled = false;
    (async () => {
      await fetchCsrf();
      const user = await fetchUser();
      if (!cancelled) {
        setState((s) => ({
          ...s,
          user,
          isAuthenticated: !!user,
          isLoading: false,
        }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootstrapOnMount, fetchCsrf, fetchUser]);

  /** Login */
  const login = useCallback(
    async (email: string, password: string): Promise<User | null> => {
      try {
        let token = state.csrfToken;
        if (!token) token = await fetchCsrf();

        const res = await fetch(`${API_URL}/auth/login`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { "X-CSRF-Token": token } : {}),
          },
          body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(err.message ?? "Invalid credentials");
          return null;
        }

        // Re-fetch CSRF (session may have rotated) + user
        await fetchCsrf();
        const user = await fetchUser();
        setState((s) => ({
          ...s,
          user,
          isAuthenticated: !!user,
        }));
        return user;
      } catch {
        toast.error("Network error. Please try again.");
        return null;
      }
    },
    [state.csrfToken, fetchCsrf, fetchUser],
  );

  /** Signup */
  const signup = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      try {
        let token = state.csrfToken;
        if (!token) token = await fetchCsrf();

        const res = await fetch(`${API_URL}/auth/signup`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { "X-CSRF-Token": token } : {}),
          },
          body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(err.message ?? "Signup failed");
          return false;
        }
        return true;
      } catch {
        toast.error("Network error. Please try again.");
        return false;
      }
    },
    [state.csrfToken, fetchCsrf],
  );

  /** Logout */
  const logout = useCallback(async () => {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: {
          ...(state.csrfToken ? { "X-CSRF-Token": state.csrfToken } : {}),
        },
      });
    } catch {
      /* swallow */
    }
    setState({
      user: null,
      csrfToken: null,
      isLoading: false,
      isAuthenticated: false,
    });
    await fetchCsrf();
  }, [state.csrfToken, fetchCsrf]);

  /** Refresh user data */
  const refreshUser = useCallback(async () => {
    const user = await fetchUser();
    setState((s) => ({ ...s, user, isAuthenticated: !!user }));
  }, [fetchUser]);

  const value = useMemo(
    () => ({ ...state, login, signup, logout, refreshUser }),
    [state, login, signup, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* ---------- Hooks ---------- */

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

export function useOptionalAuth() {
  return useContext(AuthContext);
}

export function useRequireAuth() {
  const auth = useAuth();
  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      const returnUrl = encodeURIComponent(
        `${window.location.pathname}${window.location.search}`,
      );
      window.location.assign(`/login?returnUrl=${returnUrl}`);
    }
  }, [auth.isLoading, auth.isAuthenticated]);
  return auth;
}

export function useRequireAdmin() {
  const auth = useAuth();
  useEffect(() => {
    if (auth.isLoading) return;
    if (!auth.isAuthenticated) {
      const returnUrl = encodeURIComponent(
        `${window.location.pathname}${window.location.search}`,
      );
      window.location.assign(`/login?returnUrl=${returnUrl}`);
    } else if (!auth.user?.isGlobalAdmin) {
      if ((auth.user?.eventRoles?.length ?? 0) > 0) {
        window.location.assign("/staff");
      } else {
        window.location.assign("/dashboard");
      }
    }
  }, [
    auth.isLoading,
    auth.isAuthenticated,
    auth.user?.isGlobalAdmin,
    auth.user?.eventRoles,
  ]);
  return auth;
}

/* ---------- Permission Helpers ---------- */

export function usePermissions(eventId?: string) {
  const { user } = useAuth();

  return useMemo(() => {
    if (!user)
      return { hasPermission: () => false, isStaff: false, role: null };

    if (user.isGlobalAdmin) {
      return {
        hasPermission: () => true,
        isStaff: true,
        role: "GLOBAL_ADMIN" as const,
      };
    }

    const rolesForEvent = eventId
      ? (user.eventRoles ?? [])
          .filter((r) => r.eventId === eventId)
          .map((r) => String(r.role ?? "").toLowerCase())
          .filter((role): role is EventRole =>
            (Object.values(EventRole) as string[]).includes(role),
          )
      : [];

    const uniqueRoles = Array.from(new Set(rolesForEvent));
    const ROLE_PRIORITY: EventRole[] = [
      EventRole.ORGANIZER,
      EventRole.CONTENT_EDITOR,
      EventRole.REVIEWER,
      EventRole.CHECKIN_STAFF,
    ];
    const primaryRole =
      ROLE_PRIORITY.find((role) => uniqueRoles.includes(role)) ?? null;

    return {
      hasPermission: (permission: string) => {
        if (uniqueRoles.length === 0) return false;
        return uniqueRoles.some((role) =>
          (ROLE_PERMISSIONS[role] ?? []).includes(permission as Permission),
        );
      },
      isStaff: uniqueRoles.length > 0,
      role: primaryRole,
    };
  }, [user, eventId]);
}
