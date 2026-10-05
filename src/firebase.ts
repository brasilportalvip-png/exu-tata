import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  CustomProvider,
  getToken,
  type AppCheck,
} from "firebase/app-check";
import {
  getAuth,
  onAuthStateChanged as fbOnAuthStateChanged,
  signOut as fbSignOut,
  signInWithEmailAndPassword as fbSignInWithEmailAndPassword,
  createUserWithEmailAndPassword as fbCreateUserWithEmailAndPassword,
  sendEmailVerification as fbSendEmailVerification,
  sendPasswordResetEmail as fbSendPasswordResetEmail,
  type Auth,
} from "firebase/auth";

const env = (import.meta as any).env || {};
const isProduction = Boolean(env.PROD || env.MODE === "production");

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || "",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: env.VITE_FIREBASE_APP_ID || "",
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId
);

export interface MockFirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
  reload: () => Promise<void>;
  delete: () => Promise<void>;
}

const MOCK_STORAGE_KEY = "exu_dev_user_session";

type AuthListener = (user: MockFirebaseUser | null) => void;
const listeners = new Set<AuthListener>();

function createMockUserObject(data: {
  uid: string;
  email: string;
  emailVerified: boolean;
}): MockFirebaseUser {
  return {
    uid: data.uid,
    email: data.email,
    emailVerified: data.emailVerified,
    async getIdToken() {
      if (isProduction) {
        throw new Error("Mock token is strictly forbidden in production.");
      }
      return btoa(
        JSON.stringify({
          uid: this.uid,
          email: this.email,
          email_verified: this.emailVerified,
        })
      );
    },
    async reload() {
      this.emailVerified = true;
    },
    async delete() {
      if (typeof window !== "undefined") {
        localStorage.removeItem(MOCK_STORAGE_KEY);
      }
      devAuth.currentUser = null;
      notifyListeners();
    },
  };
}

function loadStoredDevUser(): MockFirebaseUser | null {
  if (isProduction || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(MOCK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.uid && parsed.email) {
      return createMockUserObject({
        uid: parsed.uid,
        email: parsed.email,
        emailVerified: parsed.emailVerified !== false,
      });
    }
  } catch {
    // Ignore invalid stored session
  }
  return null;
}

const devAuth: {
  currentUser: MockFirebaseUser | null;
  languageCode: string | null;
} = {
  currentUser: isProduction ? null : loadStoredDevUser(),
  languageCode: "pt-BR",
};

function notifyListeners() {
  for (const listener of listeners) {
    listener(devAuth.currentUser);
  }
}

let app: FirebaseApp | null = null;
let realAuth: Auth | null = null;
let appCheck: AppCheck | null = null;

if (isFirebaseConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    realAuth = getAuth(app);

    if (typeof window !== "undefined") {
      const recaptchaKey = env.VITE_RECAPTCHA_SITE_KEY || "";
      if (recaptchaKey) {
        appCheck = initializeAppCheck(app, {
          provider: new ReCaptchaV3Provider(recaptchaKey),
          isTokenAutoRefreshEnabled: true,
        });
      } else if (!isProduction) {
        appCheck = initializeAppCheck(app, {
          provider: new CustomProvider({
            getToken: async () => ({
              token: "dev_app_check_token_" + Math.random().toString(36).substring(2),
              expireTimeMillis: Date.now() + 3600 * 1000,
            }),
          }),
          isTokenAutoRefreshEnabled: true,
        });
      }
    }
  } catch (err) {
    console.error("[Firebase] Falha ao inicializar Firebase Auth / App Check do cliente:", err);
  }
}

export async function getClientAppCheckToken(): Promise<string | null> {
  if (!appCheck) return null;
  try {
    const result = await getToken(appCheck, false);
    return result?.token || null;
  } catch (err) {
    console.warn("[AppCheck] Falha ao obter token:", err);
    return null;
  }
}

// In production, NEVER use mock auth fallback.
export const auth: Auth = realAuth
  ? realAuth
  : isProduction
  ? ({
      currentUser: null,
      languageCode: "pt-BR",
    } as unknown as Auth)
  : (devAuth as unknown as Auth);

export function onAuthStateChanged(
  authInstance: Auth,
  callback: (user: any) => void
) {
  if (realAuth) {
    return fbOnAuthStateChanged(authInstance, callback);
  }
  if (isProduction) {
    // Production without Firebase: always unauthenticated
    setTimeout(() => callback(null), 0);
    return () => {};
  }
  listeners.add(callback);
  setTimeout(() => callback(devAuth.currentUser), 0);
  return () => {
    listeners.delete(callback);
  };
}

export async function signOut(authInstance: Auth): Promise<void> {
  if (realAuth) {
    return fbSignOut(authInstance);
  }
  if (isProduction) {
    return;
  }
  if (typeof window !== "undefined") {
    localStorage.removeItem(MOCK_STORAGE_KEY);
  }
  devAuth.currentUser = null;
  notifyListeners();
}

export async function createUserWithEmailAndPassword(
  authInstance: Auth,
  email: string,
  password: string
): Promise<{ user: any }> {
  if (realAuth) {
    return fbCreateUserWithEmailAndPassword(authInstance, email, password);
  }
  if (isProduction) {
    throw new Error(
      "Serviço de autenticação temporariamente indisponível. Firebase Authentication não está configurado neste ambiente."
    );
  }

  // Development/Test mock only — NEVER store password
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail.includes("@")) {
    const err: any = new Error("Invalid email");
    err.code = "auth/invalid-email";
    throw err;
  }
  if (!password || password.length < 6) {
    const err: any = new Error("Weak password");
    err.code = "auth/weak-password";
    throw err;
  }

  const uid = "dev_uid_" + Math.random().toString(36).substring(2, 11);
  const user = createMockUserObject({
    uid,
    email: normalizedEmail,
    emailVerified: false,
  });
  devAuth.currentUser = user;
  if (typeof window !== "undefined") {
    localStorage.setItem(
      MOCK_STORAGE_KEY,
      JSON.stringify({ uid, email: normalizedEmail, emailVerified: false })
    );
  }
  notifyListeners();
  return { user };
}

export async function signInWithEmailAndPassword(
  authInstance: Auth,
  email: string,
  password: string
): Promise<{ user: any }> {
  if (realAuth) {
    return fbSignInWithEmailAndPassword(authInstance, email, password);
  }
  if (isProduction) {
    throw new Error(
      "Serviço de autenticação temporariamente indisponível. Firebase Authentication não está configurado neste ambiente."
    );
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail.includes("@") || !password) {
    const err: any = new Error("Invalid credential");
    err.code = "auth/invalid-credential";
    throw err;
  }

  const uid = "dev_uid_" + normalizedEmail.replace(/[^a-z0-9]/g, "_");
  const user = createMockUserObject({
    uid,
    email: normalizedEmail,
    emailVerified: true,
  });
  devAuth.currentUser = user;
  if (typeof window !== "undefined") {
    localStorage.setItem(
      MOCK_STORAGE_KEY,
      JSON.stringify({ uid, email: normalizedEmail, emailVerified: true })
    );
  }
  notifyListeners();
  return { user };
}

export async function sendEmailVerification(user: any): Promise<void> {
  if (realAuth) {
    return fbSendEmailVerification(user);
  }
  if (isProduction) {
    throw new Error("Firebase não configurado em produção.");
  }
  if (user) {
    user.emailVerified = true;
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(MOCK_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          parsed.emailVerified = true;
          localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(parsed));
        } catch {
          // Ignore
        }
      }
    }
  }
}

export async function sendPasswordResetEmail(
  authInstance: Auth,
  email: string
): Promise<void> {
  if (realAuth) {
    return fbSendPasswordResetEmail(authInstance, email);
  }
  if (isProduction) {
    throw new Error("Firebase não configurado em produção.");
  }
  if (!email || !email.includes("@")) {
    const err: any = new Error("Invalid email");
    err.code = "auth/invalid-email";
    throw err;
  }
}

export default app;
