/*
 * excel.js — the export engine.
 *
 * Loads the scrubbed template.xlsx, rewrites ONLY the input cells (and the 本人印 seal),
 * flips on "recalculate on open", and re-zips. Every formula, style, merged cell, and the
 * stamp boxes stay byte-for-byte identical.
 *
 * Activity (業務内容) is entered in Indonesian and translated to Japanese at export time:
 *   1) glossary  — exact match to a saved preset label uses that preset's approved Japanese
 *   2) cache     — previously translated phrases are reused (kinmu.tm), stable & offline
 *   3) machine   — Google (primary) then MyMemory (fallback), id -> ja
 * If translation fails (offline), the day's Indonesian text is kept and the day is reported.
 */
const Excel = (() => {
  const enc = new TextEncoder();
  const dec = new TextDecoder('utf-8');

  function xmlEscape(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

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
    return xml;
  }

  const frac = (t) => { const f = TimeUtil.toFraction(t); return f == null ? null : String(f); };

  // ---- translation ----
  async function googleT(src) {
    const u = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=id&tl=ja&dt=t&q=' + encodeURIComponent(src);
    const r = await fetch(u);
    if (!r.ok) throw new Error('google ' + r.status);
    const d = await r.json();
    return d[0].map((s) => s[0]).join('').trim();
  }
  async function mymemoryT(src) {
    const u = 'https://api.mymemory.translated.net/get?langpair=id|ja&q=' + encodeURIComponent(src);
    const r = await fetch(u);
    if (!r.ok) throw new Error('mymemory ' + r.status);
    const d = await r.json();
    const t = d && d.responseData && d.responseData.translatedText;
    if (!t) throw new Error('mymemory empty');
    return String(t).trim();
  }
  // returns Japanese string, or null if MT failed (caller keeps Indonesian + warns)
  async function translateOne(src) {
    src = (src || '').trim();
    if (!src) return '';
    const g = Presets.getAll().find((p) => (p.labelId || '').trim() === src && (p.textJa || '').trim());
    if (g) return g.textJa.trim();
    const tm = Store.get(Store.K.tm, {});
    if (tm[src]) return tm[src];
    let ja = null;
    try { ja = await googleT(src); } catch (e) { /* fall through */ }
    if (!ja) { try { ja = await mymemoryT(src); } catch (e) { /* fall through */ } }
    if (ja) { tm[src] = ja; Store.set(Store.K.tm, tm); return ja; }
    return null;
  }

  async function build(month, settings) {
    const resp = await fetch('assets/template.xlsx', { cache: 'no-store' });
    if (!resp.ok) throw new Error('Gagal memuat template (HTTP ' + resp.status + ')');
    const buf = new Uint8Array(await resp.arrayBuffer());
    const files = fflate.unzipSync(buf);

    let sheet = dec.decode(files['xl/worksheets/sheet1.xml']);
    let wb = dec.decode(files['xl/workbook.xml']);
    let draw = files['xl/drawings/drawing1.xml'] ? dec.decode(files['xl/drawings/drawing1.xml']) : null;
    const warnings = [];

    sheet = setCell(sheet, 'A2', 'n', month.year);
    sheet = setCell(sheet, 'E2', 'n', month.month);

    const hmap = { P2: 'client', AA2: 'clientDept', P3: 'orgUnit', AA3: 'bizContent', C4: 'agency', P4: 'address', AA4: 'name' };
    for (const addr in hmap) {
      const val = settings[hmap[addr]];
      if (val != null && val !== '') sheet = setCell(sheet, addr, 'inlineStr', val);
    }

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
      const src = (d.act || d.note || month.defaultAct || '').trim();
      if (hasWork && src) {
        const ja = await translateOne(src);
        if (ja) {
          sheet = setCell(sheet, 'Y' + r, 'inlineStr', ja);
        } else {
          sheet = setCell(sheet, 'Y' + r, 'inlineStr', src); // keep Indonesian, report
          warnings.push(day);
        }
      }
    }

    if (!/fullCalcOnLoad/.test(wb)) {
      if (/<calcPr/.test(wb)) wb = wb.replace('<calcPr', '<calcPr fullCalcOnLoad="1"');
      else wb = wb.replace('</workbook>', '<calcPr calcId="0" fullCalcOnLoad="1"/></workbook>');
    }
    if (draw && settings.sealKatakana) {
      draw = draw.replace('<a:t></a:t>', '<a:t>' + xmlEscape(settings.sealKatakana) + '</a:t>');
    }

    files['xl/worksheets/sheet1.xml'] = enc.encode(sheet);
    files['xl/workbook.xml'] = enc.encode(wb);
    if (draw) files['xl/drawings/drawing1.xml'] = enc.encode(draw);

    return { bytes: fflate.zipSync(files, { level: 6 }), warnings };
  }

  function filename(month) {
    return '勤務時間記録表_' + month.year + '-' + String(month.month).padStart(2, '0') + '.xlsx';
  }

  async function download(month, settings) {
    const { bytes, warnings } = await build(month, settings);
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename(month);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return warnings;
  }

  return { build, download, filename, setCell, xmlEscape, translateOne };
})();
