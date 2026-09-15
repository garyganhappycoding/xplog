"use client";
import { useCollection } from "@/lib/useCollection";
import GraphView from "@/components/GraphView";

export default function GraphPage() {
  const { data: entries } = useCollection("diaryEntries");

  return (
    <>
      <div className="xl-header">
        <div>
          <div className="xl-title">关系图</div>
          <div className="xl-subtitle">日记与它们被打上的技能标签 · 拖拽节点重新排列</div>
        </div>
      </div>
      <GraphView entries={entries} width={800} height={520} />
    </>
  );
}
