"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useCollection } from "@/lib/useCollection";
import { addDays, fromKey, toKey } from "@/lib/date";

// One-off import of the Sem 2026 academic schedule. Re-running replaces the events it
// created before (matched by SEED) instead of duplicating them.
const SEED = "sem-2026-10";
const RED = "#A23B3B";
const JADE = "#5C8A72";

const one = (title, date, extra = {}) => ({
  title, date, startTime: null, endTime: null, notes: "", color: RED, repeat: "none", repeatUntil: null, ...extra,
});
// All-day banner across consecutive days (stored as a daily repeat that ends on `to`).
const span = (title, from, to, extra = {}) => one(title, from, { repeat: "daily", repeatUntil: to, multiDay: true, ...extra });
const timed = (title, date, startTime, endTime, extra = {}) => one(title, date, { startTime, endTime, ...extra });

// Weeks run Sun-Sat; week 7 = Oct 4-10 2026 (matches the Fri Oct 9 / Fri Nov 13 deadlines).
const weeks = Array.from({ length: 11 }, (_, i) => {
  const start = addDays(fromKey("2026-10-04"), i * 7);
  return span(`第${i + 7}周`, toKey(start), toKey(addDays(start, 6)), { notes: `Academic Week ${i + 7}` });
});

const EVENTS = [
  ...weeks,

  // Sem break
  span("学期假期 Sem break", "2026-12-20", "2027-01-09", { color: JADE }),
  one("开学 School starts", "2027-01-10", { color: JADE }),

  // Exams
  timed("111 考试 Exam", "2026-12-07", "14:00", "16:00", { notes: "HLT1.6-1.8" }),
  timed("113 考试 Exam", "2026-12-10", "14:00", "17:00", { notes: "HLT1.6-1.8" }),

  // HGA
  span("HGA MCQ 作答期间 (30题)", "2026-10-16", "2026-10-17", { notes: "第1-6周内容,30道选择题。10/16 9am 开放 → 10/17 11pm 截止" }),
  timed("HGA MCQ 开放", "2026-10-16", "09:00", "09:30", { notes: "30 questions, week 1-6" }),
  timed("HGA MCQ 截止 11pm", "2026-10-17", "22:30", "23:00", { notes: "30 questions, week 1-6" }),
  span("HGA 一周 Wellness plan", "2026-10-14", "2026-10-20", { notes: "第8周周三开始,为期一周" }),
  timed("HGA Wellness plan 截止 11pm", "2026-11-20", "22:30", "23:00"),
  timed("HGA Collaborative Teamwork Challenge", "2026-11-04", "14:00", "16:00", { notes: "第11周" }),
  timed("HGA Who Am I 演讲", "2026-11-14", "08:00", "14:00", { notes: "准备演讲稿,在全班面前发表" }),

  // 3912 Philosophy
  one("3912 Philosophical research report 截止", "2026-10-26", { notes: "第10周周一" }),
  one("3912 Digital poster presentation 截止", "2026-11-02", { notes: "第11-12周,周一" }),
  one("3912 Digital poster presentation 截止", "2026-11-09", { notes: "第11-12周,周一" }),
  span("3912 Final assessment 进行中", "2026-11-16", "2026-11-18", { notes: "11/16 10am → 11/18 10am" }),
  timed("3912 Final assessment 开始", "2026-11-16", "10:00", "10:30"),
  timed("3912 Final assessment 截止 10am", "2026-11-18", "09:30", "10:00"),
  one("3912 Reflective report 截止", "2026-11-23", { notes: "第14周周一" }),

  // 3182 Etika
  one("3182 Etika MCQ (30题, Bab 1-6)", "2026-10-26", { notes: "第10周周一" }),
  timed("3182 Short drama + report 截止 12pm", "2026-11-21", "11:30", "12:00", { notes: "第13周" }),
  timed("3182 Individual assessment", "2026-11-25", "11:00", "12:00"),
  timed("3182 Individual assessment 提交截止 12pm", "2026-11-27", "11:30", "12:00"),

  // 113
  timed("113 个人作业 截止 12pm", "2026-10-09", "11:30", "12:00", { notes: "第7周周五" }),
  timed("113 小组作业 截止 12pm", "2026-11-13", "11:30", "12:00", { notes: "第12周周五" }),

  // 111
  one("111 Psychology exhibition 题目发布", "2026-11-09", { notes: "第12周发布" }),
];

export default function ImportSchedulePage() {
  const { data: events, add, remove, loading } = useCollection("events");
  const [busy, setBusy] = useState(false);
  const [doneCount, setDoneCount] = useState(null);

  const preview = useMemo(
    () => [...EVENTS].sort((a, b) => (a.date + (a.startTime || "")).localeCompare(b.date + (b.startTime || ""))),
    []
  );
  const existing = events.filter((e) => e.seed === SEED).length;

  const run = async () => {
    setBusy(true);
    await Promise.all(events.filter((e) => e.seed === SEED).map((e) => remove(e.id)));
    await Promise.all(EVENTS.map((e) => add({ ...e, seed: SEED, createdAt: Date.now() })));
    setDoneCount(EVENTS.length);
    setBusy(false);
  };

  return (
    <>
      <div className="xl-header"><div className="xl-title">导入学期日程</div></div>
      <div className="xl-subtitle" style={{ marginBottom: 14 }}>
        一次性把本学期的课程、考试和截止日期加入日程(学业事件为红色,学期假期为绿色)。
        {existing > 0 && ` 已导入过 ${existing} 个,再次导入会替换它们,不会重复。`}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18 }}>
        <button className="xl-btn" onClick={run} disabled={busy || loading} type="button">
          {busy ? "导入中..." : `导入 ${EVENTS.length} 个事件`}
        </button>
        <Link href="/timetable" className="xl-btn--ghost" style={{ textDecoration: "none" }}>去日程查看</Link>
        {doneCount != null && <span className="xl-subtitle" style={{ margin: 0 }}>✓ 已导入 {doneCount} 个事件</span>}
      </div>

      {preview.map((e, i) => (
        <div key={i} className="xl-entry" style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "8px 12px", marginBottom: 6 }}>
          <span className="xl-project-dot" style={{ background: e.color, flexShrink: 0 }} />
          <span className="xl-mono" style={{ fontSize: 11, color: "var(--muted)", flexShrink: 0, minWidth: 150 }}>
            {e.date}{e.repeatUntil ? ` → ${e.repeatUntil}` : ""} {e.startTime ? `${e.startTime}–${e.endTime}` : ""}
          </span>
          <span style={{ fontSize: 13 }}>{e.title}</span>
        </div>
      ))}
    </>
  );
}
