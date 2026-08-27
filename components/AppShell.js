"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useGraphWindow } from "@/context/GraphWindowContext";
import { useCollection } from "@/lib/useCollection";
import FloatingGraphWindow from "@/components/FloatingGraphWindow";
import { ConfirmDialog } from "@/components/ui";

const BOTTOM_NAV_ITEMS = [
  { href: "/insights", cn: "Daily Insights", en: "INSIGHTS" },
  { href: "/reflections", cn: "反省回顾", en: "REFLECT" },
  { href: "/merit", cn: "功过格", en: "MERIT LOG" },
];

export default function AppShell({ children }) {
  const { user, loading, login, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { openWindow } = useGraphWindow();
  const { data: skills, remove: removeSkill } = useCollection("skills");
  const { data: allEntries, remove: removeEntry } = useCollection("entries");

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const skillEntries = allEntries.filter((e) => e.skillId === deleteTarget.id);
    await Promise.all(skillEntries.map((e) => removeEntry(e.id)));
    await removeSkill(deleteTarget.id);
    setDeleting(false);
    const wasActive = pathname === `/skill/${deleteTarget.id}`;
    setDeleteTarget(null);
    if (wasActive) router.push("/dashboard");
  };

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
      <ConfirmDialog
        open={!!deleteTarget}
        title={deleteTarget ? `删除「${deleteTarget.name}」?` : ""}
        message={
          deleteTarget
            ? `这会永久删除这个技能以及它的 ${allEntries.filter((e) => e.skillId === deleteTarget.id).length} 条打卡记录,无法恢复。`
            : ""
        }
        confirmLabel={deleting ? "删除中..." : "确认删除"}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <nav className="xl-nav">
        <div className="xl-nav__brand">XPLog<span>累经簿</span></div>

        <Link href="/dashboard" className={`xl-navitem ${pathname === "/dashboard" ? "xl-navitem--active" : ""}`}>
          <span className="xl-navitem__cn">总览</span>
          <span className="xl-navitem__en">DASHBOARD</span>
        </Link>

        {skills.length > 0 && (
          <div className="xl-navgroup">
            {skills.map((s) => (
              <div key={s.id} className="xl-navitem-row">
                <Link href={`/skill/${s.id}`} className={`xl-navitem xl-navitem--skill ${pathname === `/skill/${s.id}` ? "xl-navitem--active" : ""}`}>
                  <span className="xl-navitem__icon">{s.icon || "✦"}</span>
                  <span className="xl-navitem__skillname">{s.name}</span>
                </Link>
                <button
                  className="xl-navitem__delete"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(s); }}
                  type="button"
                  title="删除技能"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="xl-navgroup">
          {BOTTOM_NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className={`xl-navitem ${pathname?.startsWith(item.href) ? "xl-navitem--active" : ""}`}>
              <span className="xl-navitem__cn">{item.cn}</span>
              <span className="xl-navitem__en">{item.en}</span>
            </Link>
          ))}
          <button className="xl-navitem" onClick={openWindow} type="button">
            <span className="xl-navitem__cn">关系图</span>
            <span className="xl-navitem__en">GRAPH</span>
          </button>
        </div>

        <Link href="/entry" className="xl-navitem xl-navitem--skill xl-navitem--addskill">
          <span className="xl-navitem__icon"><Plus size={14} /></span>
          <span className="xl-navitem__skillname">新增</span>
        </Link>

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