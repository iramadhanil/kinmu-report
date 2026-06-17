/*
 * excel.js — the export engine.
 *
 * Loads the scrubbed template.xlsx, rewrites ONLY the input cells (and the 本人印 seal),
 * flips on "recalculate on open", and re-zips. Every formula, style, merged cell, and the
 * stamp boxes stay byte-for-byte identical — the spreadsheet recomputes all derived values
 * (hours, overtime, totals, dates, weekdays) when opened in Excel.
 */
const Excel = (() => {
  const enc = new TextEncoder();
  const dec = new TextDecoder('utf-8');

  function xmlEscape(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Rewrite cell `addr`, preserving its existing style (s="..") attribute.
  // Handles both self-closing (<c r=".." s=".."/>) and paired (<c ..><v>..</v></c>) cells.
  function setCell(xml, addr, type, value) {
    const reShort = new RegExp('<c r="' + addr + '"([^>]*?)/>');
    const reLong = new RegExp('<c r="' + addr + '"([^>]*?)>.*?</c>');
    const build = (attrs) => {
      const sm = attrs.match(/ s="(\d+)"/);
      const sAttr = sm ? ' s="' + sm[1] + '"' : '';
      if (type === 'n') return '<c r="' + addr + '"' + sAttr + ' t="n"><v>' + value + '</v></c>';
      return '<c r="' + addr + '"' + sAttr + ' t="inlineStr"><is><t xml:space="preserve">' +
        xmlEscape(value) + '</t></is></c>';
    };
    if (reShort.test(xml)) return xml.replace(reShort, (m, a) => build(a));
    if (reLong.test(xml)) return xml.replace(reLong, (m, a) => build(a));
    return xml; // address not found — leave untouched
  }

  const frac = (t) => {
    const f = TimeUtil.toFraction(t);
    return f == null ? null : String(f);
  };

  async function build(month, settings) {
    const resp = await fetch('assets/template.xlsx', { cache: 'no-store' });
    if (!resp.ok) throw new Error('Gagal memuat template (HTTP ' + resp.status + ')');
    const buf = new Uint8Array(await resp.arrayBuffer());
    const files = fflate.unzipSync(buf);

    let sheet = dec.decode(files['xl/worksheets/sheet1.xml']);
    let wb = dec.decode(files['xl/workbook.xml']);
    let draw = files['xl/drawings/drawing1.xml'] ? dec.decode(files['xl/drawings/drawing1.xml']) : null;

    // --- header: year / month ---
    sheet = setCell(sheet, 'A2', 'n', month.year);
    sheet = setCell(sheet, 'E2', 'n', month.month);

    // --- header: company / personal (only when provided) ---
    const hmap = {
      P2: 'client', AA2: 'clientDept', P3: 'orgUnit', AA3: 'bizContent',
      C4: 'agency', P4: 'address', AA4: 'name',
    };
    for (const addr in hmap) {
      const val = settings[hmap[addr]];
      if (val != null && val !== '') sheet = setCell(sheet, addr, 'inlineStr', val);
    }

    // --- day rows (day d -> row 7+d) ---
    for (let day = 1; day <= 31; day++) {
      const d = month.days[day];
      if (!d) continue;
      const r = 7 + day;

      if (d.start) { const f = frac(d.start); if (f) sheet = setCell(sheet, 'C' + r, 'n', f); }
      if (d.end) { const f = frac(d.end); if (f) sheet = setCell(sheet, 'E' + r, 'n', f); }
      if (d.start && d.brk) { const f = frac(d.brk); if (f) sheet = setCell(sheet, 'G' + r, 'n', f); }

      if (d.hStart) { const f = frac(d.hStart); if (f) sheet = setCell(sheet, 'P' + r, 'n', f); }
      if (d.hEnd) { const f = frac(d.hEnd); if (f) sheet = setCell(sheet, 'R' + r, 'n', f); }
      if (d.hStart && d.hBrk) { const f = frac(d.hBrk); if (f) sheet = setCell(sheet, 'T' + r, 'n', f); }

      if (d.paidLeave) sheet = setCell(sheet, 'X' + r, 'n', Number(d.paidLeave));

      const hasWork = d.start || d.hStart;
      const activityId = d.activityId || month.defaultActivityId;
      let activityText = '';
      if (activityId) { const p = Presets.find(activityId); if (p) activityText = p.textJa; }
      if (!activityText && d.note) activityText = d.note;
      if (hasWork && activityText) sheet = setCell(sheet, 'Y' + r, 'inlineStr', activityText);
    }

    // --- workbook: force full recalculation when opened ---
    if (!/fullCalcOnLoad/.test(wb)) {
      if (/<calcPr/.test(wb)) wb = wb.replace('<calcPr', '<calcPr fullCalcOnLoad="1"');
      else wb = wb.replace('</workbook>', '<calcPr calcId="0" fullCalcOnLoad="1"/></workbook>');
    }

    // --- drawing: 本人印 personal seal name ---
    if (draw && settings.sealKatakana) {
      draw = draw.replace('<a:t></a:t>', '<a:t>' + xmlEscape(settings.sealKatakana) + '</a:t>');
    }

    files['xl/worksheets/sheet1.xml'] = enc.encode(sheet);
    files['xl/workbook.xml'] = enc.encode(wb);
    if (draw) files['xl/drawings/drawing1.xml'] = enc.encode(draw);

    return fflate.zipSync(files, { level: 6 });
  }

  function filename(month) {
    return '勤務時間記録表_' + month.year + '-' + String(month.month).padStart(2, '0') + '.xlsx';
  }

  async function download(month, settings) {
    const bytes = await build(month, settings);
    const blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename(month);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  return { build, download, filename, setCell, xmlEscape };
})();
