/*
 * app.js — daily-input UX. The hero is a single-day card (defaults to today);
 * a month calendar gives an overview and lets you jump between days. Everything
 * autosaves to localStorage. Export still produces the whole active month.
 */
(() => {
  const WD_FULL = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
    'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const $ = (id) => document.getElementById(id);

  const daysInMonth = (y, m) => new Date(y, m, 0).getDate();
  const dow = (y, m, d) => new Date(y, m - 1, d).getDay();      // 0=Sun..6=Sat
  const monIdx = (y, m, d) => (dow(y, m, d) + 6) % 7;            // 0=Mon..6=Sun
  const fmt = (n) => String(TimeUtil.round2(n));
  const fmt2 = (n) => n.toFixed(2);
  // <input type="time"> requires zero-padded "HH:MM" or it silently rejects the value.
  const padTime = (t) => {
    if (!t) return '';
    const m = String(t).match(/^(\d{1,2}):(\d{2})$/);
    return m ? String(m[1]).padStart(2, '0') + ':' + m[2] : t;
  };
  const DEFAULT_BREAK = '01:00';
  const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  let settings = Store.getSettings();
  let months = Store.getMonths();
  let activeKey, month, selectedDay;

  function newMonth(y, m) {
    const p = Presets.getAll();
    return { year: y, month: m, defaultActivityId: p[0] ? p[0].id : '', days: {} };
  }
  function saveMonth() { months[activeKey] = month; Store.saveMonths(months); }
  const dayData = (d) => month.days[d] || {};

  // ---------- toast / saved ----------
  let toastTimer, savedTimer;
  function toast(msg, kind) {
    const t = $('toast');
    t.textContent = msg; t.className = 'toast' + (kind ? ' ' + kind : ''); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function flashSaved() {
    const s = $('savedInd'); s.hidden = false; s.classList.add('show');
    clearTimeout(savedTimer); savedTimer = setTimeout(() => s.classList.remove('show'), 1200);
  }

  // ---------- activity option list ----------
  function activityOptions(selected) {
    const opt = (v, t, sel) => '<option value="' + v + '"' + (sel ? ' selected' : '') + '>' + t + '</option>';
    let html = opt('', '— pakai default bulan —', selected === '' || selected == null);
    html += opt('__none__', '— kosong —', selected === '__none__');
    for (const p of Presets.getAll()) html += opt(p.id, escapeHtml(p.labelId), p.id === selected);
    return html;
  }

  // ---------- summary ----------
  function computeSummary() {
    let hari = 0, within = 0, ot = 0, night = 0, holiday = 0, leave = 0;
    for (const k in month.days) {
      const d = month.days[k];
      const c = TimeUtil.computeDay(d.start, d.end, d.brk);
      if (c) { within += c.within; ot += c.overtime; night += c.night; }
      holiday += TimeUtil.computeHoliday(d.hStart, d.hEnd, d.hBrk);
      const pl = Number(d.paidLeave) || 0;
      leave += pl;
      if (d.start || pl > 0) hari++;
    }
    return { hari, within, ot, night, holiday, leave };
  }
  function renderSummary() {
    const s = computeSummary();
    const card = (label, val, accent) => '<div class="metric' + (accent ? ' accent' : '') +
      '"><div class="ml">' + label + '</div><div class="mv">' + val + '</div></div>';
    let html = card('Hari kerja (稼働日)', s.hari) + card('Jam kerja (時間内)', fmt2(s.within)) +
      card('Lembur (時間外)', fmt2(s.ot), true) + card('Cuti (有給)', fmt(s.leave));
    if (s.night > 0) html += card('Lembur malam (深夜)', fmt2(s.night));
    if (s.holiday > 0) html += card('Hari libur (休日出勤)', fmt2(s.holiday));
    $('summary').innerHTML = html;
  }

  // ---------- month bar ----------
  function renderMonthBar() {
    $('monthLabel').textContent = MONTHS_ID[month.month - 1] + ' ' + month.year;
    $('month').innerHTML = MONTHS_ID.map((nm, i) => '<option value="' + (i + 1) + '"' +
      (i + 1 === month.month ? ' selected' : '') + '>' + nm + '</option>').join('');
    $('year').value = month.year;
    $('defaultActivity').innerHTML = '<option value="">— kosong —</option>' +
      Presets.getAll().map((p) => '<option value="' + p.id + '"' +
        (p.id === month.defaultActivityId ? ' selected' : '') + '>' + escapeHtml(p.labelId) + '</option>').join('');
  }

  // ---------- calendar ----------
  function renderCalendar() {
    const n = daysInMonth(month.year, month.month);
    const today = new Date();
    const isThisMonth = today.getFullYear() === month.year && today.getMonth() + 1 === month.month;
    let html = '';
    for (let i = 0; i < monIdx(month.year, month.month, 1); i++) html += '<span class="calcell empty"></span>';
    for (let d = 1; d <= n; d++) {
      const data = dayData(d);
      const c = TimeUtil.computeDay(data.start, data.end, data.brk);
      const worked = !!data.start;
      const cuti = Number(data.paidLeave) || 0;
      const hol = !!data.hStart;
      const weekend = dow(month.year, month.month, d) % 6 === 0; // Sun(0) or Sat(6)
      const cls = ['calcell'];
      if (weekend) cls.push('weekend');
      if (d === selectedDay) cls.push('selected');
      if (isThisMonth && today.getDate() === d) cls.push('today');
      if (worked) cls.push('has-work'); else if (cuti > 0) cls.push('has-leave'); else if (hol) cls.push('has-hol');
      let ind = '';
      if (worked) ind = '<span class="cind i-work">' + (c && c.overtime > 0 ? '+' + fmt(c.overtime) : '✓') + '</span>';
      else if (cuti > 0) ind = '<span class="cind i-leave">cuti</span>';
      else if (hol) ind = '<span class="cind i-hol">libur</span>';
      html += '<button type="button" class="' + cls.join(' ') + '" data-day="' + d + '">' +
        '<span class="cd">' + d + '</span>' + ind + '</button>';
    }
    $('calendar').innerHTML = html;
  }

  // ---------- day card ----------
  function renderDayCard() {
    const d = dayData(selectedDay);
    const dw = dow(month.year, month.month, selectedDay);
    $('dTitle').textContent = WD_FULL[dw] + ', ' + selectedDay + ' ' + MONTHS_ID[month.month - 1] + ' ' + month.year;
    const badge = $('dBadge');
    if (dw % 6 === 0) { badge.hidden = false; badge.textContent = 'Akhir pekan'; badge.className = 'dbadge we'; }
    else { badge.hidden = true; }

    $('d-start').value = padTime(d.start);
    $('d-end').value = padTime(d.end);
    $('d-brk').value = padTime(d.brk);
    $('d-activity').innerHTML = activityOptions(d.activityId == null ? '' : d.activityId);
    $('d-paid').value = d.paidLeave != null ? String(d.paidLeave) : '';
    const hasHol = !!(d.hStart || d.hEnd || d.hBrk);
    $('d-holiday').checked = hasHol;
    $('holidayBox').hidden = !hasHol;
    $('d-hstart').value = padTime(d.hStart);
    $('d-hend').value = padTime(d.hEnd);
    $('d-hbrk').value = padTime(d.hBrk);
    $('d-note').value = d.note || '';
    updateOvertime();
    updateActHint();
  }

  function updateOvertime() {
    const start = $('d-start').value, end = $('d-end').value;
    let brk = $('d-brk').value;
    if (start && !brk) brk = DEFAULT_BREAK; // reflect the break that will be auto-saved
    const c = TimeUtil.computeDay(start, end, brk);
    if (c) {
      $('d-ot').textContent = fmt(c.overtime);
      $('d-worksub').textContent = 'Jam kerja ' + fmt(c.within) + ' jam' + (c.night ? ' · 深夜 ' + fmt(c.night) : '');
    } else {
      $('d-ot').textContent = '0';
      $('d-worksub').textContent = 'Belum ada jam masuk/keluar';
    }
  }
  function updateActHint() {
    const v = $('d-activity').value;
    const hint = $('d-actHint');
    if (v === '') {
      const def = Presets.find(month.defaultActivityId);
      hint.textContent = def ? '→ memakai default: ' + def.labelId : '→ default bulan kosong (業務内容 dibiarkan kosong)';
    } else { hint.textContent = ''; }
  }

  function readDayCard() {
    const d = {};
    const start = $('d-start').value, end = $('d-end').value;
    if (start) d.start = start;
    if (end) d.end = end;
    let brk = $('d-brk').value;
    if (start && !brk) { brk = DEFAULT_BREAK; $('d-brk').value = DEFAULT_BREAK; }
    if (brk) d.brk = brk;
    const act = $('d-activity').value;
    if (act !== '') d.activityId = act; // '' = use month default (not stored)
    const paid = $('d-paid').value;
    if (paid) d.paidLeave = Number(paid);
    if ($('d-holiday').checked) {
      const hs = $('d-hstart').value, he = $('d-hend').value;
      let hb = $('d-hbrk').value;
      if (hs) d.hStart = hs;
      if (he) d.hEnd = he;
      if (hs && !hb) { hb = DEFAULT_BREAK; $('d-hbrk').value = DEFAULT_BREAK; }
      if (hb) d.hBrk = hb;
    }
    const note = $('d-note').value.trim();
    if (note) d.note = note;
    return d;
  }

  function onDayChange(e) {
    if (e && e.target && e.target.id === 'd-holiday') {
      $('holidayBox').hidden = !$('d-holiday').checked;
    }
    const d = readDayCard();
    if (Object.keys(d).length === 0) delete month.days[selectedDay];
    else month.days[selectedDay] = d;
    saveMonth();
    updateOvertime();
    updateActHint();
    renderSummary();
    renderCalendar();
    flashSaved();
  }

  function selectDay(d, scroll) {
    selectedDay = d;
    renderDayCard();
    renderCalendar();
    if (scroll) $('dayCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- month switching ----------
  function defaultDayFor(y, m) {
    const t = new Date();
    if (t.getFullYear() === y && t.getMonth() + 1 === m) return t.getDate();
    return 1;
  }
  function switchMonth(y, m, day) {
    if (month) saveMonth();
    activeKey = Store.monthKey(y, m);
    Store.setActive(activeKey);
    month = months[activeKey] || newMonth(y, m);
    saveMonth();
    const n = daysInMonth(y, m);
    selectedDay = Math.min(day || defaultDayFor(y, m), n);
    renderMonthBar();
    renderSummary();
    renderDayCard();
    renderCalendar();
  }

  // ---------- settings / presets ----------
  function renderSettings() {
    $('set-name').value = settings.name || '';
    $('set-seal').value = settings.sealKatakana || '';
    $('set-client').value = settings.client || '';
    $('set-dept').value = settings.clientDept || '';
    $('set-org').value = settings.orgUnit || '';
    $('set-biz').value = settings.bizContent || '';
    $('set-agency').value = settings.agency || '';
    $('set-address').value = settings.address || '';
  }
  function renderPresets() {
    const ps = Presets.getAll();
    $('presetList').innerHTML = !ps.length ? '<p class="muted">Belum ada preset.</p>' :
      ps.map((p) => '<div class="presetitem" data-id="' + p.id + '">' +
        '<div class="pi-text"><input class="pi-label" type="text" value="' + escapeHtml(p.labelId) + '">' +
        '<textarea class="pi-ja" rows="2">' + escapeHtml(p.textJa) + '</textarea></div>' +
        '<div class="pi-actions"><button type="button" class="btn small pi-save">Simpan</button>' +
        '<button type="button" class="btn small danger pi-del">Hapus</button></div></div>').join('');
  }

  // ---------- export / backup ----------
  async function doExport() {
    saveMonth();
    if (!settings.name) {
      if (!confirm('氏名 (Nama) belum diisi di Pengaturan. Export tanpa nama?')) return;
    }
    const btn = $('exportBtn'); btn.disabled = true; const old = btn.textContent; btn.textContent = 'Memproses…';
    try {
      await Excel.download(month, settings);
      toast('Excel dibuat: ' + Excel.filename(month), 'ok');
    } catch (err) { console.error(err); toast('Gagal export: ' + err.message, 'err'); }
    finally { btn.disabled = false; btn.textContent = old; }
  }
  function doBackup() {
    const data = { _app: 'kinmu-report', _v: 1, exportedAt: new Date().toISOString(),
      settings: Store.getSettings(), presets: Presets.getAll(), months: Store.getMonths() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'kinmu-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Backup diunduh', 'ok');
  }
  function doRestore(e) {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        if (data.settings) Store.saveSettings(data.settings);
        if (data.presets) Store.set(Store.K.presets, data.presets);
        if (data.months) Store.saveMonths(data.months);
        toast('Restore berhasil, memuat ulang…', 'ok');
        setTimeout(() => location.reload(), 800);
      } catch (err) { toast('File backup tidak valid', 'err'); }
    };
    r.readAsText(file); e.target.value = '';
  }

  // ---------- events ----------
  function bindEvents() {
    $('dayCard').addEventListener('change', onDayChange);
    $('dayCard').addEventListener('input', (e) => {
      // live overtime feedback while typing times, without full re-render churn
      if (['d-start', 'd-end', 'd-brk'].includes(e.target.id)) updateOvertime();
    });

    $('calendar').addEventListener('click', (e) => {
      const cell = e.target.closest('.calcell[data-day]');
      if (cell) selectDay(+cell.getAttribute('data-day'), true);
    });

    $('dPrev').addEventListener('click', () => { if (selectedDay > 1) selectDay(selectedDay - 1); });
    $('dNext').addEventListener('click', () => {
      if (selectedDay < daysInMonth(month.year, month.month)) selectDay(selectedDay + 1);
    });

    $('prevMonth').addEventListener('click', () => {
      let y = month.year, m = month.month - 1; if (m < 1) { m = 12; y--; } switchMonth(y, m);
    });
    $('nextMonth').addEventListener('click', () => {
      let y = month.year, m = month.month + 1; if (m > 12) { m = 1; y++; } switchMonth(y, m);
    });
    $('todayBtn').addEventListener('click', () => {
      const t = new Date(); switchMonth(t.getFullYear(), t.getMonth() + 1, t.getDate());
    });
    $('month').addEventListener('change', () => switchMonth(month.year, +$('month').value));
    $('year').addEventListener('change', () => {
      const y = +$('year').value; if (y >= 2000 && y <= 2100) switchMonth(y, month.month);
    });
    $('defaultActivity').addEventListener('change', () => {
      month.defaultActivityId = $('defaultActivity').value; saveMonth();
      updateActHint(); renderCalendar(); flashSaved();
    });

    $('saveSettings').addEventListener('click', () => {
      settings = {
        name: $('set-name').value.trim(), sealKatakana: $('set-seal').value.trim(),
        client: $('set-client').value.trim(), clientDept: $('set-dept').value.trim(),
        orgUnit: $('set-org').value.trim(), bizContent: $('set-biz').value.trim(),
        agency: $('set-agency').value.trim(), address: $('set-address').value.trim(),
      };
      Store.saveSettings(settings); toast('Pengaturan tersimpan', 'ok');
    });

    $('addPreset').addEventListener('click', () => {
      const label = $('newLabel').value.trim(), ja = $('newJa').value.trim();
      if (!label || !ja) { toast('Isi label dan teks Jepang', 'err'); return; }
      Presets.add(label, ja);
      $('newLabel').value = ''; $('newJa').value = '';
      renderPresets(); renderMonthBar(); renderDayCard(); toast('Preset ditambahkan', 'ok');
    });
    $('presetList').addEventListener('click', (e) => {
      const item = e.target.closest('.presetitem'); if (!item) return;
      const id = item.getAttribute('data-id');
      if (e.target.classList.contains('pi-save')) {
        Presets.update(id, item.querySelector('.pi-label').value, item.querySelector('.pi-ja').value);
        renderMonthBar(); renderDayCard(); toast('Preset disimpan', 'ok');
      } else if (e.target.classList.contains('pi-del')) {
        if (confirm('Hapus preset ini?')) {
          Presets.remove(id); renderPresets(); renderMonthBar(); renderDayCard(); toast('Preset dihapus');
        }
      }
    });

    $('exportBtn').addEventListener('click', doExport);
    $('backupBtn').addEventListener('click', doBackup);
    $('restoreFile').addEventListener('change', doRestore);
  }

  // ---------- init ----------
  function init() {
    const t = new Date();
    activeKey = Store.getActive();
    if (activeKey && months[activeKey]) {
      month = months[activeKey];
    } else {
      month = newMonth(t.getFullYear(), t.getMonth() + 1);
      activeKey = Store.monthKey(month.year, month.month);
      saveMonth(); Store.setActive(activeKey);
    }
    selectedDay = defaultDayFor(month.year, month.month);
    renderMonthBar();
    renderSettings();
    renderPresets();
    renderSummary();
    renderDayCard();
    renderCalendar();
    bindEvents();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
