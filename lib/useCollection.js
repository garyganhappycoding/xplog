"use client";
import { useEffect, useState, useCallback } from "react";
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, orderBy, query,
} from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "@/context/AuthContext";

// path e.g. "skills" -> resolves to users/{uid}/skills
export function useCollection(path, orderField = null) {
  const { user } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setData([]); setLoading(false); return; }
    const colRef = collection(db, "users", user.uid, path);
    const q = orderField ? query(colRef, orderBy(orderField, "desc")) : colRef;
    const unsub = onSnapshot(q, (snap) => {
      setData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [user, path, orderField]);

  const add = useCallback((data) => {
    if (!user) return Promise.reject(new Error("not signed in"));
    return addDoc(collection(db, "users", user.uid, path), data);
  }, [user, path]);

  const update = useCallback((id, data) => {
    if (!user) return Promise.reject(new Error("not signed in"));
    return updateDoc(doc(db, "users", user.uid, path, id), data);
  }, [user, path]);

  const remove = useCallback((id) => {
    if (!user) return Promise.reject(new Error("not signed in"));
    return deleteDoc(doc(db, "users", user.uid, path, id));
  }, [user, path]);

  return { data, loading, add, update, remove };
}
