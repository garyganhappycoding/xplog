import { fromKey, occurrenceDates, toKey } from "../date.js";

const REPEAT_LABEL = { daily: "每天重复", weekly: "每周重复", monthly: "每月重复" };

// Calendar events inside [from, to] (YYYY-MM-DD), with recurring events expanded into the days
// they fall on. Used for answering questions and for reminders.
export function eventsInRange(events, from, to) {
  const lo = fromKey(from);
  const hi = fromKey(to);
  const out = [];
  for (const e of events) {
    if (!e.date) continue;
    const until = e.repeatUntil ? fromKey(e.repeatUntil) : null;
    for (const occ of occurrenceDates(fromKey(e.date), e.repeat, until, lo, hi)) {
      const day = toKey(occ);
      const when = e.startTime ? `${e.startTime}${e.endTime ? `–${e.endTime}` : ""}` : "全天";
      out.push({
        id: `${e.id}::${day}`,
        eventId: e.id,
        kind: "event",
        title: e.title,
        day,
        startTime: e.startTime || null,
        location: e.location || "",
        prepNote: e.prepNote || "",
        multiDay: !!e.multiDay,
        displayDate: day,
        sortKey: `${day} ${e.startTime || "00:00"}`,
        content: [
          `${day} ${when}`,
          e.location && `地点:${e.location}`,
          e.notes && `备注:${e.notes}`,
          e.prepNote && `需要准备:${e.prepNote}${e.prepDate ? `(${e.prepDate})` : ""}`,
          REPEAT_LABEL[e.repeat],
        ].filter(Boolean).join(" | "),
      });
    }
  }
  return out.sort((a, b) => a.sortKey.localeCompare(b.sortKey)).slice(0, 60);
}
