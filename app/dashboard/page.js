"use client";
import { useCollection } from "@/lib/useCollection";

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
      {!skillsLoading && skills.length === 0 ? (
        <div className="xl-panel">还没有技能。点左边导航栏最下面的「+ 新增」创建你的第一个技能吧。</div>
      ) : (
        <div className="xl-subtitle">从左边导航栏点一个技能开始打卡,或者点「+ 新增」建立新的。</div>
      )}
    </>
  );
}
