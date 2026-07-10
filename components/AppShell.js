"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useGraphWindow } from "@/context/GraphWindowContext";
import FloatingGraphWindow from "@/components/FloatingGraphWindow";

const NAV_ITEMS = [
  { href: "/dashboard", cn: "总览", en: "DASHBOARD" },
  { href: "/entry", cn: "新增记录", en: "NEW ENTRY" },
  { href: "/insights", cn: "Daily Insights", en: "INSIGHTS" },
  { href: "/reflections", cn: "反省回顾", en: "REFLECT" },
  { href: "/merit", cn: "功过格", en: "MERIT LOG" },
];

export default function AppShell({ children }) {
  const { user, loading, login, logout } = useAuth();
  const pathname = usePathname();
  const { openWindow } = useGraphWindow();

  if (loading) {
    return <div className="xl-login"><div className="xl-subtitle">加载中...</div></div>;
  }

  if (!user) {
    return (
      <div className="xl-login">
        <div className="xl-title" style={{ fontSize: 32 }}>XPLog <span className="xl-mono" style={{ fontSize: 14, color: "var(--muted)" }}>累经簿</span></div>
        <div className="xl-subtitle">记录每日行动,累积经验值,复盘成长</div>
        <button className="xl-btn" onClick={login}>使用 Google 登录</button>
      </div>
    );
  }

  return (
    <div className="xl-shell">
      <nav className="xl-nav">
        <div className="xl-nav__brand">XPLog<span>累经簿</span></div>
        {NAV_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className={`xl-navitem ${pathname?.startsWith(item.href) ? "xl-navitem--active" : ""}`}>
            <span className="xl-navitem__cn">{item.cn}</span>
            <span className="xl-navitem__en">{item.en}</span>
          </Link>
        ))}
        <button className="xl-navitem" onClick={openWindow} type="button">
          <span className="xl-navitem__cn">关系图</span>
          <span className="xl-navitem__en">GRAPH</span>
        </button>
        <div style={{ marginTop: "auto", paddingTop: 16 }}>
          <button className="xl-navitem" onClick={logout} type="button">
            <span className="xl-navitem__cn">登出</span>
            <span className="xl-navitem__en">LOGOUT</span>
          </button>
        </div>
      </nav>
      <main className="xl-main">{children}</main>
      <FloatingGraphWindow />
    </div>
  );
}
