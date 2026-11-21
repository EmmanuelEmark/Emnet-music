
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

// ==========================================
// 1. BACKEND CONFIGURATION
// ==========================================

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000"
).replace(/\/$/, "");

const AUTH_PATH = "/api/auth";

const TOKEN_KEY = "emnet_session_token";

// ==========================================
// 2. USER ROLES
// ==========================================

export type UserRole =
  | "listener"
  | "artist"
  | "admin"
  | "superadmin";

// ==========================================
// 3. AUTHENTICATED USER TYPE
// ==========================================

export type AuthUser = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  emailVerified: boolean;
  profileImage?: string;
};

// ==========================================
// 4. API RESPONSE TYPE
// ==========================================

type ApiResponse = {
  success: boolean;
  message?: string;
  token?: string;
  user?: Record<string, unknown>;
};

// ==========================================
// 5. REGISTER INPUT TYPE
// ==========================================

type RegisterInput = {
  fullName: string;
  email: string;
  password: string;
  dateOfBirth: string;
};

// ==========================================
// 6. AUTH CONTEXT TYPE
// ==========================================

type AuthContextType = {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;

  login: (
    email: string,
    password: string
  ) => Promise<AuthUser>;

  register: (
    data: RegisterInput
  ) => Promise<string>;

  logout: () => void;

  refreshUser: () => Promise<void>;
};

// ==========================================
// 7. CREATE AUTH CONTEXT
// ==========================================

const AuthContext =
  createContext<AuthContextType | undefined>(
    undefined
  );

// ==========================================
// 8. NORMALIZE BACKEND USER
// ==========================================

function normalizeUser(
  value: Record<string, unknown>
): AuthUser {
  const role = String(
    value.role || "listener"
  );

  const allowedRoles: UserRole[] = [
    "listener",
    "artist",
    "admin",
    "superadmin",
  ];

  if (
    !allowedRoles.includes(
      role as UserRole
    )
  ) {
    throw new Error(
      "Unknown account role."
    );
  }

  const id = String(
    value.id ||
    value._id ||
    ""
  );

  if (!id) {
    throw new Error(
      "Invalid user information."
    );
  }

  return {
    id,

    fullName: String(
      value.fullName || ""
    ),

    email: String(
      value.email || ""
    ),

    role: role as UserRole,

    emailVerified:
      value.emailVerified === true,

    profileImage:
      typeof value.profileImage === "string"
        ? value.profileImage
        : undefined,
  };
}

// ==========================================
// 9. PARSE BACKEND RESPONSE
// ==========================================

async function parseResponse(
  response: Response
): Promise<ApiResponse> {
  const data: unknown =
    await response.json().catch(
      () => null
    );

  if (
    !data ||
    typeof data !== "object"
  ) {
    throw new Error(
      "Invalid response from server."
    );
  }

  const result = data as ApiResponse;

  if (
    !response.ok ||
    result.success !== true
  ) {
    throw new Error(
      result.message ||
      "Request was unsuccessful."
    );
  }

  return result;
}

// ==========================================
// 10. AUTH PROVIDER
// ==========================================

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  // ========================================
  // USER STATE
  // ========================================

  const [user, setUser] =
    useState<AuthUser | null>(null);

  const [loading, setLoading] =
    useState(true);

  // Prevent older requests from replacing
  // a newer login, logout or refresh.
  const sessionVersionRef = useRef(0);

  // ========================================
  // LOGOUT
  // ========================================

  const logout = useCallback(() => {
    sessionVersionRef.current += 1;

    sessionStorage.removeItem(
      TOKEN_KEY
    );

    setUser(null);
    setLoading(false);
  }, []);

  // ========================================
  // REFRESH USER INFORMATION
  // ========================================

  const refreshUser =
    useCallback(async () => {
      const token =
        sessionStorage.getItem(
          TOKEN_KEY
        );

      const version =
        sessionVersionRef.current;

      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(
          `${API_BASE_URL}${AUTH_PATH}/me`,
          {
            method: "GET",

            headers: {
              Authorization:
                `Bearer ${token}`,
            },

            cache: "no-store",
          }
        );

        // Only an invalid or unauthorized
        // session should cause logout.
        if (
          response.status === 401 ||
          response.status === 403
        ) {
          if (
            version ===
              sessionVersionRef.current &&
            sessionStorage.getItem(
              TOKEN_KEY
            ) === token
          ) {
            logout();
          }

          return;
        }

        const result =
          await parseResponse(
            response
          );

        if (!result.user) {
          throw new Error(
            "User information is missing."
          );
        }

        const latestUser =
          normalizeUser(
            result.user
          );

        // Ignore stale results from older
        // requests or a previous session.
        if (
          version !==
            sessionVersionRef.current ||
          sessionStorage.getItem(
            TOKEN_KEY
          ) !== token
        ) {
          return;
        }

        setUser(latestUser);
      } catch (error) {
        // A temporary server or network
        // failure should not erase the
        // listener or artist session.
        console.error(
          "Unable to refresh user:",
          error
        );
      } finally {
        if (
          version ===
          sessionVersionRef.current
        ) {
          setLoading(false);
        }
      }
    }, [logout]);

  // ========================================
  // INITIAL AUTHENTICATION CHECK
  // ========================================

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  // ========================================
  // REFRESH WHEN USER RETURNS TO APP
  // ========================================

  useEffect(() => {
    function handleWindowFocus() {
      if (
        sessionStorage.getItem(
          TOKEN_KEY
        )
      ) {
        void refreshUser();
      }
    }

    function handleVisibilityChange() {
      if (
        document.visibilityState ===
          "visible" &&
        sessionStorage.getItem(
          TOKEN_KEY
        )
      ) {
        void refreshUser();
      }
    }

    window.addEventListener(
      "focus",
      handleWindowFocus
    );

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      window.removeEventListener(
        "focus",
        handleWindowFocus
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [refreshUser]);

  // ========================================
  // LOGIN
  // ========================================

  async function login(
    email: string,
    password: string
  ): Promise<AuthUser> {
    const response = await fetch(
      `${API_BASE_URL}${AUTH_PATH}/login`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          email:
            email.trim().toLowerCase(),

          password,
        }),
      }
    );

    const result =
      await parseResponse(
        response
      );

    if (
      !result.token ||
      !result.user
    ) {
      throw new Error(
        "Login succeeded but session data is missing."
      );
    }

    const authenticatedUser =
      normalizeUser(
        result.user
      );

    // Invalidate pending refreshes from
    // any previous session.
    sessionVersionRef.current += 1;

    sessionStorage.setItem(
      TOKEN_KEY,
      result.token
    );

    setUser(
      authenticatedUser
    );

    setLoading(false);

    return authenticatedUser;
  }

  // ========================================
  // REGISTER
  // ========================================

  async function register(
    data: RegisterInput
  ): Promise<string> {
    const response = await fetch(
      `${API_BASE_URL}${AUTH_PATH}/register`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          fullName:
            data.fullName.trim(),

          email:
            data.email
              .trim()
              .toLowerCase(),

          password:
            data.password,

          dateOfBirth:
            data.dateOfBirth,
        }),
      }
    );

    const result =
      await parseResponse(
        response
      );

    return (
      result.message ||
      "Account created successfully."
    );
  }

  // ========================================
  // PROVIDE AUTHENTICATION DATA
  // ========================================

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,

        isAuthenticated:
          Boolean(user),

        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ==========================================
// 11. CUSTOM AUTH HOOK
// ==========================================

export function useAuth():
  AuthContextType {
  const context =
    useContext(
      AuthContext
    );

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider."
    );
  }

  return context;
}