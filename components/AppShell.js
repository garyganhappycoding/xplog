"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { BookOpen, CalendarCheck, CalendarDays, Inbox, ListChecks } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useCollection } from "@/lib/useCollection";
import { googleStatus, runGoogleSync, setGoogleSyncEnabled } from "@/lib/api";

const NAV_ITEMS = [
  { href: "/today", cn: "今天", Icon: CalendarCheck },
  { href: "/calendar", cn: "日历", Icon: CalendarDays },
  { href: "/todo", cn: "待办", Icon: ListChecks },
  { href: "/dump", cn: "倒出", Icon: Inbox },
  { href: "/diary", cn: "日记", Icon: BookOpen },
];

function BottomNav() {
  const pathname = usePathname();
  const { data: dumps } = useCollection("dumps");
  const waiting = dumps.filter((d) => d.status === "new").length;
  return (
    <nav className="nav">
      {NAV_ITEMS.map(({ href, cn, Icon }) => {
        const active = pathname?.startsWith(href);
        return (
          <Link key={href} href={href} className={`nav__item ${active ? "nav__item--active" : ""}`}>
            <span className="nav__pill">
              <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
              {href === "/dump" && waiting > 0 && <span className="nav__badge">{waiting}</span>}
            </span>
            {cn}
          </Link>
        );
      })}
    </nav>
  );
}

// Keeps Google Calendar in step: once when the app opens, when you come back to it, and every 5 minutes.
function useGoogleSync(user) {
  useEffect(() => {
    if (!user || user.demo) return undefined;
    let alive = true;
    googleStatus().then((s) => {
      if (!alive || !s.connected) return;
      setGoogleSyncEnabled(true);
      runGoogleSync();
    }).catch(() => {});
    const visible = () => document.visibilityState === "visible" && runGoogleSync();
    const timer = setInterval(visible, 5 * 60000);
    document.addEventListener("visibilitychange", visible);
    return () => { alive = false; clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [user]);
}

export default function AppShell({ children }) {
  const { user, loading, login } = useAuth();
  useGoogleSync(user);

  if (loading) return <div className="login"><div className="muted">加载中…</div></div>;

  if (!user) {
    return (
      <div className="app" style={{ paddingBottom: 0 }}>
        <div className="login">
          <div className="login__logo">X</div>
          <h1>XPLog</h1>
          <p>把日程、待办、想法和日记,放在一个地方。</p>
          <button className="btn btn--lg" onClick={login} type="button">使用 Google 登录</button>
          {/* full page load on purpose: the demo flag is read once when the app starts */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className="btn btn--text" href="/?demo=1">先看看演示</a>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <main className="page">{children}</main>
      <BottomNav />
    </div>
  );
}
