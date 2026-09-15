// Cumulative XP required to REACH level L (L=1 starts at 0xp)
export const xpToReach = (L) => (L <= 1 ? 0 : Math.round(100 * Math.pow(L - 1, 1.5)));

export const levelFromXp = (xp) => {
  let L = 1;
  while (xpToReach(L + 1) <= xp) L++;
  return L;
};

export const progressInLevel = (xp) => {
  const L = levelFromXp(xp);
  const lo = xpToReach(L);
  const hi = xpToReach(L + 1);
  return { level: L, pct: Math.min(100, Math.round(((xp - lo) / (hi - lo)) * 100)), lo, hi };
};

export const EFFORT_SCORE = { small: 3, medium: 7, large: 10 };
export const EFFORT_LABEL = { small: "小", medium: "中", large: "大" };

export const xpGainForEntry = (result, reflection) =>
  (result === "success" ? 10 : 1) + ((reflection || "").trim() ? 50 : 0);
