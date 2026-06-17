# 勤務時間記録表 — Web Input + Japanese Excel Export

Design spec — 2026-06-17

## Goal

A static web app (GitHub Pages) where the user inputs their monthly work data in
**Indonesian** (clock-in/out, break, overtime, activities, paid leave) and exports a
**Japanese** `.xlsx` that is byte-for-byte faithful to the company timesheet template
(`勤務時間記録表`), ready to send.

## Source file analysis

The original `勤務時間記録表「225026」.xls` is a 派遣 (dispatch worker) monthly
timesheet (client and dispatch agency are entered by the user at runtime and are not
stored in this repository). It is **formula-driven**
(379 formulas). The app must NOT recompute anything — it fills input cells and lets the
spreadsheet's own formulas recompute on open.

### Input cells (the "colored cells")

Per day-row `r` where `r = 7 + day` (day 1..31 → rows 8..38):

| Cell | Meaning | Type |
|------|---------|------|
| `C{r}` | 始業時間 start | time fraction (8:30 → 0.354166…) |
| `E{r}` | 終業時間 end | time fraction |
| `G{r}` | 休憩時間 break | time fraction (default 1:00) |
| `P{r}` | 休日出勤 start (holiday work) | time fraction |
| `R{r}` | 休日出勤 end | time fraction |
| `T{r}` | 休日出勤 break | time fraction |
| `X{r}` | 有給休暇 paid leave | number (e.g. 1.0) |
| `Y{r}` | 業務内容 activity (merged Y:AE) | inline string (Japanese) |

Header inputs:

| Cell | Meaning |
|------|---------|
| `A2` | year (number) |
| `E2` | month (number) |
| `P2` | 就業先 client name |
| `AA2` | 就業部署 work department (optional) |
| `P3` | 組織単位 org unit (default `-`) |
| `AA3` | 業務内容 label value (default `（委託業務）`) |
| `C4` | 派遣元 agency |
| `P4` | 所在地 address |
| `AA4` | 氏名 name |

Drawing (`xl/drawings/drawing1.xml`): the 本人印 personal-seal text box → katakana name.
In the shipped template this is blanked to `<a:t></a:t>`; injected at export.

`$C$46` = 所定労働時間/日 (standard 8:00) — referenced by overtime formulas; left intact.

Everything else (勤務時間, 時間内, 時間外, 深夜残業, 稼働日 flag, dates, weekdays,
monthly totals) is computed by the template's formulas.

## Architecture

Pure static site — HTML/CSS/vanilla JS, no build step, no backend. All data lives in the
browser (localStorage). Runs fully offline once loaded.

```
index.html              app shell + layout
css/styles.css          styling (Indonesian UI)
js/timeutil.js          "8:30" <-> fraction, 15-min validation, 24:00+ handling, overtime preview
js/storage.js           localStorage: settings, presets, months
js/presets.js           Indonesian→Japanese activity phrasebook (seeded), CRUD
js/excel.js             fetch template -> surgical zip patch -> download
js/app.js               daily-input UX (focused day card + month calendar), autosave, summary, settings/presets
vendor/fflate.min.js    tiny zip lib (vendored, not CDN)
assets/template.xlsx    scrubbed blank template (no PII, formulas intact)
```

### Export mechanism (surgical patch)

1. `fetch('assets/template.xlsx')` → ArrayBuffer.
2. `fflate.unzipSync` → get `xl/worksheets/sheet1.xml`, `xl/drawings/drawing1.xml`,
   `xl/workbook.xml` as text.
3. Patch `sheet1.xml`: set each input cell (preserving its `s="..."` style attribute):
   - times → numeric cells `<c r=".." s=".." t="n"><v>fraction</v></c>`
   - paid leave → numeric
   - activity / header text → inline string `<c r=".." s=".." t="inlineStr"><is><t xml:space="preserve">…</t></is></c>` (XML-escaped)
   - A2/E2 → replace existing value
4. Patch `drawing1.xml`: replace the unique `<a:t></a:t>` with the katakana seal name.
5. Patch `workbook.xml`: ensure `<calcPr ... fullCalcOnLoad="1"/>` so Excel recomputes on open.
6. `fflate.zipSync` → Blob → download as `勤務時間記録表_YYYY-MM.xlsx`.

A `setCell(xml, addr, innerXml, type)` helper finds `<c r="ADDR" …(/>|>…</c>)`, extracts the
existing `s` style, and rewrites the cell — handling both empty and value cells.

### Translation (Indonesian → Japanese)

Activity (業務内容) is typed in **Indonesian** (per-day `act` or a month `defaultAct`) and
translated to Japanese **at export time**, with three layers for accuracy:

1. **Glossary** — saved phrases `{ labelId (Indonesian), textJa (Japanese) }`. If the activity
   text matches a label exactly, the export uses that approved Japanese (no machine call). Seeded
   with the user's recurring sentence; used as month default so routine days are always exact.
2. **Cache** (`kinmu.tm`) — every machine translation is stored, so re-exports are stable/instant
   and work offline for already-seen phrases.
3. **Machine** — Google (`translate_a/single`, primary) then MyMemory (fallback), `id→ja`.

If a phrase can't be translated (offline, not cached, not in glossary), the Indonesian text is
kept in the cell and that day is reported back to the user via `build()`'s `warnings`.
Phrases/quick-insert and the glossary are managed in the "Frasa cepat & glosarium" panel.

### Data model (localStorage)

- `kinmu.settings` — `{ name, sealKatakana, client, clientDept, orgUnit, bizContent, agency, address }`
- `kinmu.presets` — `[{ id, labelId, textJa }]` (glossary + quick-insert)
- `kinmu.tm` — `{ indonesianText: japaneseText }` (translation cache)
- `kinmu.months` — `{ "2026-05": { year, month, defaultAct, days: { 7: { start, end, brk, act, paidLeave, hStart, hEnd, hBrk, note } } } }` (`act`/`defaultAct` are Indonesian)
- `kinmu.activeMonth` — `"2026-05"`

Autosave on every edit.

### Time rules (from the sheet's notes)

- 24-hour notation, 15-minute increments.
- Fractional times: start rounds **up**, end rounds **down** (e.g. 8:25→8:30, 17:47→17:45).
- End past midnight entered as 24:30 / 25:00 / 26:15 → fraction may exceed 1.0.

## Privacy

The committed template carries **no** personal data (name, employer, agency, address, seal
all cleared). The user enters these once in Settings; they live only in their browser and are
injected at export. Safe for a public GitHub Pages repo.

## Deployment

New public repo `kinmu-report` under `iramadhanil` → push → enable GitHub Pages (root of
`main`) → `https://iramadhanil.github.io/kinmu-report/`.

## Verification

Round-trip fidelity test: reproduce the original May 2026 data via the app's export, convert
the result to PDF (LibreOffice), and compare against the original file's PDF. Computed values
(totals, overtime) and layout must match. Also run the real export in a headless browser
(Preview) to confirm the JS path end-to-end.

## Known limitations (MVP)

- Output is `.xlsx` (preserves formulas + formatting). `.xls` not produced; user can Save As if
  strictly required.
- "Golden Week"-style banners spanning multiple holiday days are not recreated as a merged
  cross-day cell; a simple per-day note is supported instead. Normal working days are exact.
