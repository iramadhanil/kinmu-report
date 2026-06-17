/*
 * timeutil.js — time parsing and hour computation.
 *
 * Times are kept in state as "HH:MM" 24-hour strings (e.g. "8:30"). Excel stores
 * times as a fraction of a day (8:30 -> 510/1440 = 0.354166...). The day-hour math
 * below mirrors the template's own formulas exactly, so the live preview totals match
 * the values the spreadsheet recomputes on open.
 */
const TimeUtil = (() => {
  const STD = 8 / 24; // 所定労働時間/日 = 8h, matches $C$46 in the template

  // "8:30" / "25:00" -> {h, m} or null
  function parse(str) {
    if (str == null) return null;
    const m = String(str).trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = +m[1], min = +m[2];
    if (min > 59) return null;
    return { h, m: min };
  }

  // "8:30" -> 0.354166...  (fraction of a day; supports values > 24h)
  function toFraction(str) {
    const t = parse(str);
    if (!t) return null;
    return (t.h * 60 + t.m) / 1440;
  }

  // fraction -> "H:MM"
  function fromFraction(frac) {
    if (frac == null || frac === '') return '';
    let mins = Math.round(frac * 1440);
    const h = Math.floor(mins / 60), m = mins % 60;
    return h + ':' + String(m).padStart(2, '0');
  }

  const round2 = (n) => Math.round(n * 100) / 100;

  // Mirrors the regular-hours formulas (I=E-C-G, 時間内=min(I,8h),
  // 深夜=before 5:00 + after 22:00, 時間外=I-8h-深夜).
  function computeDay(start, end, brk) {
    if (!start || !end) return null;
    const C = toFraction(start), E = toFraction(end);
    const G = brk ? toFraction(brk) : 0;
    if (C == null || E == null) return null;
    let I = E - C - G;
    if (I < 0) I = 0;
    const within = Math.min(I, STD);
    const overnight = E < C ? 1 : 0;
    const night = Math.max(0, 5 / 24 - Math.min(C, 5 / 24)) +
                  Math.max(0, (overnight + E) - 22 / 24);
    const overtime = I > STD ? Math.max(0, I - STD - night) : 0;
    return {
      work: round2(I * 24),
      within: round2(within * 24),
      overtime: round2(overtime * 24),
      night: round2(night * 24),
    };
  }

  // 休日出勤: V = R - P - T
  function computeHoliday(start, end, brk) {
    if (!start || !end) return 0;
    const P = toFraction(start), R = toFraction(end);
    const T = brk ? toFraction(brk) : 0;
    if (P == null || R == null) return 0;
    return round2(Math.max(0, R - P - T) * 24);
  }

  return { parse, toFraction, fromFraction, computeDay, computeHoliday, round2, STD };
})();
