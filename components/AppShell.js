"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ListTodo, NotebookPen, Sparkles, Share2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const NAV_ITEMS = [
  { href: "/todo", cn: "待办", Icon: ListTodo },
  { href: "/diary", cn: "日记", Icon: NotebookPen },
  { href: "/skills", cn: "技能成长", Icon: Sparkles },
  { href: "/graph", cn: "关系图", Icon: Share2 },
];

export default function AppShell({ children }) {
  const { user, loading, login, logout } = useAuth();
  const pathname = usePathname();

  if (loading) return <div className="xl-login"><div className="xl-subtitle">加载中...</div></div>;

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
      <div className="xl-topbar">
        <div className="xl-topbar__brand">XPLog<span>累经簿</span></div>
        <button className="xl-topbar__logout" onClick={logout} type="button">登出</button>
      </div>

      <main className="xl-main">{children}</main>

      <nav className="xl-bottomnav">
        {NAV_ITEMS.map(({ href, cn, Icon }) => (
          <Link
            key={href}
            href={href}
            className={`xl-bottomnav__item ${pathname?.startsWith(href) ? "xl-bottomnav__item--active" : ""}`}
          >
            <Icon size={20} />
            <span className="xl-bottomnav__cn">{cn}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
