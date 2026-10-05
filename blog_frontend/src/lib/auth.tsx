import React, {createContext, useContext, useEffect, useState, type ReactNode} from "react";
import ExecutionEnvironment from "@docusaurus/ExecutionEnvironment";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import {createAuth0Client, type Auth0Client} from "@auth0/auth0-spa-js";
import type {AuthUser} from "./types";
import {elevateAuth, getAuthMe, setAuthTokenProvider} from "./api";

interface KalidassWindow extends Window {
  AUTH0_DOMAIN?: string;
  AUTH0_CLIENT_ID?: string;
  AUTH0_AUDIENCE?: string;
  ADMIN_EMAILS?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSuperuserEligible: boolean;
  isLoading: boolean;
  isAuth0Configured: boolean;
  loginWithAuth0: () => Promise<void>;
  logout: () => Promise<void>;
  elevateToSuperuser: (candidateToken: string) => Promise<boolean>;
  dropSuperuser: () => Promise<void>;
  unlockWithAdminToken: (candidateToken: string) => Promise<boolean>;
  clearAuth: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

let auth0ClientInstance: Auth0Client | null = null;

export function AuthProvider({children}: {children: ReactNode}) {
  const {siteConfig} = useDocusaurusContext();
  const customFields = (siteConfig.customFields || {}) as Record<string, string>;

  const kw = (typeof window !== "undefined" ? (window as unknown as KalidassWindow) : {}) as KalidassWindow;
  const auth0Domain = customFields.auth0Domain || kw.AUTH0_DOMAIN || "";
  const auth0ClientId = customFields.auth0ClientId || kw.AUTH0_CLIENT_ID || "";
  const auth0Audience = customFields.auth0Audience || kw.AUTH0_AUDIENCE || "";
  const adminEmailsStr = customFields.adminEmails || kw.ADMIN_EMAILS || "";
  const adminEmailsList = adminEmailsStr
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  // PRIVATE_APP=true: Auth0 is dead from the UI — no button, no client, no token
  // provider. Only the admin-token unlock works; the worker still 401s anything else.
  const privateApp = String(customFields.privateApp) === "true";
  const isAuth0Configured = !privateApp && Boolean(auth0Domain && auth0ClientId);

  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Dynamic token provider registration for api.ts
  useEffect(() => {
    if (isAuth0Configured) {
      setAuthTokenProvider(async (): Promise<string | null> => {
        if (!auth0ClientInstance) return null;
        try {
          const isAuth = await auth0ClientInstance.isAuthenticated();
          if (isAuth) {
            const raw = await auth0ClientInstance.getTokenSilently({
              authorizationParams: auth0Audience ? {audience: auth0Audience} : undefined,
            });
            return raw || null;
          }
        } catch {
          // Token silent refresh failed or user unauthenticated
        }
        return null;
      });
    } else {
      setAuthTokenProvider(null);
    }
    return () => {
      setAuthTokenProvider(null);
    };
  }, [isAuth0Configured, auth0Audience]);

  // Initialize auth state
  useEffect(() => {
    if (!ExecutionEnvironment.canUseDOM) return;

    let isMounted = true;

    async function init() {
      try {
        // 1. Primary path: Auth0 Client authentication
        if (isAuth0Configured) {
          if (!auth0ClientInstance) {
            auth0ClientInstance = await createAuth0Client({
              domain: auth0Domain,
              clientId: auth0ClientId,
              authorizationParams: {
                redirect_uri: window.location.origin,
                ...(auth0Audience ? {audience: auth0Audience} : {}),
                scope: "openid profile email",
              },
              cacheLocation: "memory",
            });
          }

          // Handle redirect callback from Auth0 Universal Login
          const search = window.location.search;
          if (search.includes("error=") && search.includes("state=")) {
            console.warn("Auth0 returned error on callback:", search);
            window.history.replaceState({}, document.title, window.location.pathname);
          } else if (search.includes("code=") && search.includes("state=")) {
            const callbackResult = await auth0ClientInstance.handleRedirectCallback();
            const returnTo = callbackResult.appState?.returnTo || window.location.pathname || "/";
            window.history.replaceState({}, document.title, returnTo);
          }

          const isAuth = await auth0ClientInstance.isAuthenticated();
          if (isAuth) {
            const auth0User = await auth0ClientInstance.getUser();
            let rawToken = "";
            try {
              rawToken = (await auth0ClientInstance.getTokenSilently({
                authorizationParams: auth0Audience ? {audience: auth0Audience} : undefined,
              })) || "";
            } catch (err) {
              console.warn("Silent token fetch failed:", err);
            }

            if (rawToken && auth0User) {
              if (typeof window !== "undefined") {
                sessionStorage.removeItem("kalidass-elevation-token");
              }
              const adminToken = localStorage.getItem("kalidass-admin-token");

              try {
                const data = await getAuthMe(rawToken, adminToken || undefined);
                if (isMounted) {
                  const email = (auth0User.email || data.user.email || "").toLowerCase().trim();
                  const isEligible = Boolean(
                    data.user.isSuperuserEligible ||
                    (email && adminEmailsList.includes(email))
                  );
                  setToken(rawToken);
                  setUser({
                    sub: data.user.sub || auth0User.sub || "user",
                    email,
                    name: auth0User.name || auth0User.nickname || data.user.name || email || "Author",
                    avatar: auth0User.picture || data.user.avatar || "",
                    role: data.user.role || "author",
                    isSuperuserEligible: isEligible,
                  });
                  setIsLoading(false);
                  return;
                }
              } catch {
                if (isMounted) {
                  const email = (auth0User.email || "").toLowerCase().trim();
                  const isEligible = Boolean(email && adminEmailsList.includes(email));
                  setToken(rawToken);
                  setUser({
                    sub: auth0User.sub || "user",
                    email,
                    name: auth0User.name || auth0User.nickname || email || "Author",
                    avatar: auth0User.picture || "",
                    role: "author",
                    isSuperuserEligible: isEligible,
                  });
                  setIsLoading(false);
                  return;
                }
              }
            }
          }
        }

        // 2. Secondary fallback path: Standalone Admin Token (solo / offline mode)
        const storedAdminToken = localStorage.getItem("kalidass-admin-token");
        if (storedAdminToken) {
          try {
            const data = await getAuthMe(storedAdminToken);
            if (isMounted) {
              setToken(storedAdminToken);
              setUser(data.user);
              setIsLoading(false);
              return;
            }
          } catch (err: unknown) {
            const msg = String((err as Error)?.message || "").toLowerCase();
            if (msg.includes("unauthorized") || msg.includes("401") || msg.includes("forbidden") || msg.includes("403")) {
              localStorage.removeItem("kalidass-admin-token");
            }
          }
        }
      } catch (err) {
        console.warn("Auth initialization error:", err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    init();

    return () => {
      isMounted = false;
    };
  }, [auth0Domain, auth0ClientId, auth0Audience, isAuth0Configured]);

  const loginWithAuth0 = async () => {
    if (!auth0ClientInstance && isAuth0Configured) {
      auth0ClientInstance = await createAuth0Client({
        domain: auth0Domain,
        clientId: auth0ClientId,
        authorizationParams: {
          redirect_uri: window.location.origin,
          ...(auth0Audience ? {audience: auth0Audience} : {}),
          scope: "openid profile email",
        },
        cacheLocation: "memory",
      });
    }

    if (auth0ClientInstance) {
      await auth0ClientInstance.loginWithRedirect({
        appState: {
          returnTo: window.location.pathname + window.location.search,
        },
      });
    }
  };

  const logout = async () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("kalidass-elevation-token");
    }
    localStorage.removeItem("kalidass-admin-token");
    setUser(null);
    setToken(null);
    setAuthTokenProvider(null);
    if (auth0ClientInstance) {
      try {
        const isAuth = await auth0ClientInstance.isAuthenticated();
        if (isAuth) {
          await auth0ClientInstance.logout({
            logoutParams: {
              returnTo: window.location.origin,
            },
          });
          return;
        }
      } catch (err) {
        console.warn("Auth0 logout error:", err);
      }
    }
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  };

  const elevateToSuperuser = async (candidateToken: string): Promise<boolean> => {
    const trimmed = candidateToken.trim();
    if (!trimmed) return false;
    try {
      let rawToken = token;
      if (!rawToken && auth0ClientInstance) {
        try {
          rawToken = (await auth0ClientInstance.getTokenSilently({
            authorizationParams: auth0Audience ? {audience: auth0Audience} : undefined,
          })) || "";
        } catch {
          // silent refresh failed
        }
      }

      const res = await elevateAuth(trimmed, rawToken || undefined);
      if (res.ok) {
        localStorage.setItem("kalidass-admin-token", trimmed);
        const auth0User = auth0ClientInstance ? await auth0ClientInstance.getUser() : null;
        try {
          const me = await getAuthMe(rawToken || undefined, trimmed);
          const email = (auth0User?.email || me.user.email || user?.email || "").toLowerCase().trim();
          setUser({
            sub: me.user.sub || auth0User?.sub || user?.sub || "user",
            email,
            name: auth0User?.name || auth0User?.nickname || me.user.name || user?.name || email || "Author",
            avatar: auth0User?.picture || me.user.avatar || user?.avatar || "",
            role: "admin",
            isSuperuserEligible: true,
          });
        } catch {
          setUser((prev) => (prev ? {...prev, role: "admin", isSuperuserEligible: true} : null));
        }
        return true;
      }
      return false;
    } catch (err) {
      console.warn("Superuser elevation failed:", err);
      localStorage.removeItem("kalidass-admin-token");
      return false;
    }
  };

  const dropSuperuser = async () => {
    localStorage.removeItem("kalidass-admin-token");
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("kalidass-elevation-token");
    }
    if (token && auth0ClientInstance) {
      try {
        const isAuth = await auth0ClientInstance.isAuthenticated();
        if (isAuth) {
          const auth0User = await auth0ClientInstance.getUser();
          const email = (auth0User?.email || user?.email || "").toLowerCase().trim();
          const isEligible = Boolean(
            user?.isSuperuserEligible ||
            (email && adminEmailsList.includes(email))
          );
          setUser({
            sub: auth0User?.sub || user?.sub || "user",
            email,
            name: auth0User?.name || auth0User?.nickname || user?.name || email || "Author",
            avatar: auth0User?.picture || user?.avatar || "",
            role: "author",
            isSuperuserEligible: isEligible,
          });
          return;
        }
      } catch {
        setUser((prev) => (prev ? {...prev, role: "author"} : null));
        return;
      }
    }
    setUser(null);
    setToken(null);
    setAuthTokenProvider(null);
  };

  const unlockWithAdminToken = async (candidateToken: string): Promise<boolean> => {
    const trimmed = candidateToken.trim();
    if (!trimmed) return false;
    try {
      const data = await getAuthMe(trimmed);
      localStorage.setItem("kalidass-admin-token", trimmed);
      setToken(trimmed);
      setUser(data.user);
      return true;
    } catch {
      localStorage.removeItem("kalidass-admin-token");
      return false;
    }
  };

  const clearAuth = () => {
    localStorage.removeItem("kalidass-admin-token");
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("kalidass-elevation-token");
    }
    setUser(null);
    setToken(null);
  };

  const value: AuthContextValue = {
    user,
    token,
    isAuthenticated: Boolean(user && token),
    isAdmin: user?.role === "admin",
    isSuperuserEligible: Boolean(user?.isSuperuserEligible),
    isLoading,
    isAuth0Configured,
    loginWithAuth0,
    logout,
    elevateToSuperuser,
    dropSuperuser,
    unlockWithAdminToken,
    clearAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
