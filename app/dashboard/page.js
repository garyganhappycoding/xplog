"use client";
import Link from "next/link";
import { useCollection } from "@/lib/useCollection";
import { progressInLevel } from "@/lib/xp";
import { ProgressBar } from "@/components/ui";

export default function DashboardPage() {
  const { data: skills, loading: skillsLoading } = useCollection("skills");
  const { data: entries } = useCollection("entries");

  const totalReflections = entries.filter((e) => e.reflection && e.reflection.trim()).length;

  return (
    <>
      <div className="xl-header">
        <div>
          <div className="xl-title">今日总览</div>
          <div className="xl-subtitle">{new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}</div>
        </div>
      </div>

      <div className="xl-stat-row">
        <div><div className="xl-stat__num">{skills.length}</div><div className="xl-stat__label">追踪技能</div></div>
        <div><div className="xl-stat__num">{entries.length}</div><div className="xl-stat__label">总记录数</div></div>
        <div><div className="xl-stat__num">{totalReflections}</div><div className="xl-stat__label">已写反省</div></div>
      </div>

      {skillsLoading && <div className="xl-subtitle">加载中...</div>}

      {!skillsLoading && skills.length === 0 && (
        <div className="xl-panel">
          还没有技能。去 <Link href="/entry" style={{ color: "var(--gold-bright)" }}>新增记录</Link> 页面创建你的第一个技能吧。
        </div>
      )}

      <div className="xl-ledger">
        {skills.map((s, i) => {
          const { level, pct } = progressInLevel(s.totalXp || 0);
          return (
            <Link className="xl-row" key={s.id} href={`/skill/${s.id}`}>
              <div className="xl-row__idx">{String(i + 1).padStart(2, "0")}</div>
              <div>
                <div className="xl-row__name">{s.name}<small>{(s.nameEn || s.name).toUpperCase()}</small></div>
                <ProgressBar pct={pct} />
              </div>
              <div className="xl-row__lvl">LV.{level}</div>
              <div className="xl-row__pct">{pct}%</div>
              <div className="xl-row__chev">›</div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
