import { initializeApp, type FirebaseApp } from "firebase/app";
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

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || "",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: env.VITE_FIREBASE_APP_ID || "",
};

const isFirebaseConfigured = Boolean(
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

const MOCK_STORAGE_KEY = "exu_mock_firebase_user";
const MOCK_ACCOUNTS_KEY = "exu_mock_firebase_accounts";

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
      localStorage.removeItem(MOCK_STORAGE_KEY);
      mockAuth.currentUser = null;
      notifyListeners();
    },
  };
}

function loadStoredMockUser(): MockFirebaseUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(MOCK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.uid && parsed.email) {
      return createMockUserObject({
        uid: parsed.uid,
        email: parsed.email,
        emailVerified: true,
      });
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

function loadMockAccounts(): Record<
  string,
  { uid: string; email: string; password: string }
> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(MOCK_ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveMockAccounts(
  accounts: Record<string, { uid: string; email: string; password: string }>
) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MOCK_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    // ignore
  }
}

const mockAuth: {
  currentUser: MockFirebaseUser | null;
  languageCode: string | null;
} = {
  currentUser: loadStoredMockUser(),
  languageCode: "pt-BR",
};

function notifyListeners() {
  for (const listener of listeners) {
    listener(mockAuth.currentUser);
  }
}

let app: FirebaseApp | null = null;
let realAuth: Auth | null = null;

if (isFirebaseConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    realAuth = getAuth(app);
  } catch (err) {
    console.warn("[AI Studio] Failed to initialize Firebase client, using mock auth:", err);
  }
}

export const auth: Auth = (realAuth || (mockAuth as unknown as Auth));

export function onAuthStateChanged(
  authInstance: Auth,
  callback: (user: any) => void
) {
  if (realAuth) {
    return fbOnAuthStateChanged(authInstance, callback);
  }
  listeners.add(callback);
  setTimeout(() => callback(mockAuth.currentUser), 0);
  return () => {
    listeners.delete(callback);
  };
}

export async function signOut(authInstance: Auth): Promise<void> {
  if (realAuth) {
    return fbSignOut(authInstance);
  }
  if (typeof window !== "undefined") {
    localStorage.removeItem(MOCK_STORAGE_KEY);
  }
  mockAuth.currentUser = null;
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
  const accounts = loadMockAccounts();
  if (accounts[normalizedEmail]) {
    const err: any = new Error("Email already in use");
    err.code = "auth/email-already-in-use";
    throw err;
  }
  const uid = "mock_uid_" + Math.random().toString(36).substring(2, 11);
  accounts[normalizedEmail] = { uid, email: normalizedEmail, password };
  saveMockAccounts(accounts);

  const user = createMockUserObject({
    uid,
    email: normalizedEmail,
    emailVerified: true,
  });
  mockAuth.currentUser = user;
  if (typeof window !== "undefined") {
    localStorage.setItem(
      MOCK_STORAGE_KEY,
      JSON.stringify({ uid, email: normalizedEmail, emailVerified: true })
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
  const normalizedEmail = email.trim().toLowerCase();
  const accounts = loadMockAccounts();
  const existing = accounts[normalizedEmail];
  if (existing && existing.password !== password) {
    const err: any = new Error("Invalid credential");
    err.code = "auth/invalid-credential";
    throw err;
  }
  const uid =
    existing?.uid ||
    "mock_uid_" + normalizedEmail.replace(/[^a-z0-9]/g, "_");
  if (!existing) {
    accounts[normalizedEmail] = { uid, email: normalizedEmail, password };
    saveMockAccounts(accounts);
  }
  const user = createMockUserObject({
    uid,
    email: normalizedEmail,
    emailVerified: true,
  });
  mockAuth.currentUser = user;
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
  if (user) {
    user.emailVerified = true;
  }
}

export async function sendPasswordResetEmail(
  authInstance: Auth,
  email: string
): Promise<void> {
  if (realAuth) {
    return fbSendPasswordResetEmail(authInstance, email);
  }
  if (!email || !email.includes("@")) {
    const err: any = new Error("Invalid email");
    err.code = "auth/invalid-email";
    throw err;
  }
}

export default app;
