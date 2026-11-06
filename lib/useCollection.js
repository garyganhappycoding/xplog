"use client";
import { useEffect, useState, useCallback } from "react";
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc, doc, orderBy, query,
} from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "@/context/AuthContext";
import { demoAdd, demoRemove, demoSet, demoSubscribe, demoUpdate } from "./demo";
import { scheduleGoogleSync } from "./api";

// Events and time-blocked to-dos are mirrored to Google Calendar after they change.
const SYNCED = new Set(["events", "todos"]);

// path e.g. "todos" -> resolves to users/{uid}/todos. In demo mode (?demo=1) the same calls are
// served from an in-memory sample dataset instead, so the app can be explored without logging in.
const EMPTY = [];

export function useCollection(path, orderField = null) {
  const { user } = useAuth();
  const demo = user?.uid === "demo";
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return undefined;
    if (demo) {
      return demoSubscribe(path, (rows) => {
        const sorted = orderField ? [...rows].sort((a, b) => (b[orderField] ?? 0) - (a[orderField] ?? 0)) : rows;
        setData(sorted);
        setLoading(false);
      });
    }
    const colRef = collection(db, "users", user.uid, path);
    const q = orderField ? query(colRef, orderBy(orderField, "desc")) : colRef;
    const unsub = onSnapshot(q, (snap) => {
      setData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [user, demo, path, orderField]);

  const add = useCallback((data) => {
    if (!user) return Promise.reject(new Error("not signed in"));
    if (demo) return Promise.resolve(demoAdd(path, data));
    if (SYNCED.has(path)) scheduleGoogleSync();
    return addDoc(collection(db, "users", user.uid, path), data);
  }, [user, demo, path]);

  const update = useCallback((id, data) => {
    if (!user) return Promise.reject(new Error("not signed in"));
    if (demo) return Promise.resolve(demoUpdate(path, id, data));
    if (SYNCED.has(path)) scheduleGoogleSync();
    return updateDoc(doc(db, "users", user.uid, path, id), data);
  }, [user, demo, path]);

  // Creates or merges a document with a known id (e.g. settings/app).
  const set = useCallback((id, data) => {
    if (!user) return Promise.reject(new Error("not signed in"));
    if (demo) return Promise.resolve(demoSet(path, id, data));
    return setDoc(doc(db, "users", user.uid, path, id), data, { merge: true });
  }, [user, demo, path]);

  const remove = useCallback((id) => {
    if (!user) return Promise.reject(new Error("not signed in"));
    if (demo) return Promise.resolve(demoRemove(path, id));
    if (SYNCED.has(path)) scheduleGoogleSync();
    return deleteDoc(doc(db, "users", user.uid, path, id));
  }, [user, demo, path]);

  return { data: user ? data : EMPTY, loading: user ? loading : false, add, update, set, remove };
}
