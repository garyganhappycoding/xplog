"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";

const AuthContext = createContext({ user: null, loading: true, login: () => {}, logout: () => {} });

// ?demo=1 switches on demo mode for the browser tab: a fake signed-in user and sample data.
const wantsDemo = () => {
  try {
    if (new URLSearchParams(window.location.search).get("demo") === "1") sessionStorage.setItem("xplog-demo", "1");
    return sessionStorage.getItem("xplog-demo") === "1";
  } catch {
    return false;
  }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (wantsDemo()) {
      Promise.resolve().then(() => {
        setUser({ uid: "demo", displayName: "演示账号", demo: true });
        setLoading(false);
      });
      return undefined;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Popups are unreliable in installed/mobile browsers; fall back to a full-page redirect.
  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
        return signInWithRedirect(auth, googleProvider);
      }
      throw e;
    }
  };
  const logout = () => {
    if (user?.demo) {
      try { sessionStorage.removeItem("xplog-demo"); } catch {}
      window.location.href = "/";
      return Promise.resolve();
    }
    return signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
