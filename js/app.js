/*
 * app.js — daily-input UX. Hero = single-day card (defaults to today); a month
 * calendar gives an overview/navigation. Cloud-first storage (Supabase) when
 * logged in; localStorage is the offline cache. Export produces the active month.
 */
(() => {
  const WD_FULL = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
    'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const $ = (id) => document.getElementById(id);

  const daysInMonth = (y, m) => new Date(y, m, 0).getDate();
  const dow = (y, m, d) => new Date(y, m - 1, d).getDay();   // 0=Sun..6=Sat
  const monIdx = (y, m, d) => (dow(y, m, d) + 6) % 7;        // 0=Mon..6=Sun
  const fmt = (n) => String(TimeUtil.round2(n));
  const fmt2 = (n) => n.toFixed(2);
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
    return { year: y, month: m, defaultAct: Templates.all()[0].id, days: {} };
  }
  // normalize stored data to the fixed-template model (drops old free-text / preset ids / notes)
  function normalizeMonths() {
    let changed = false;
    for (const k in months) {
      const mo = months[k];
      if (mo.defaultActivityId !== undefined) { delete mo.defaultActivityId; changed = true; }
      if (mo.defaultAct === undefined || !Templates.find(mo.defaultAct)) { mo.defaultAct = Templates.all()[0].id; changed = true; }
      for (const dk in (mo.days || {})) {
        const dd = mo.days[dk];
        if (dd.activityId !== undefined) { delete dd.activityId; changed = true; }
        if (dd.note !== undefined) { delete dd.note; changed = true; }
        if (dd.act !== undefined && dd.act !== '__none__' && !Templates.find(dd.act)) { delete dd.act; changed = true; }
      }
    }
    if (changed) Store.saveMonths(months);
  }

  function markChanged() { Store.set('kinmu.updatedAt', Date.now()); scheduleSync(); }
  function saveMonth() { month._u = Date.now(); months[activeKey] = month; Store.saveMonths(months); markChanged(); }
  const dayData = (d) => month.days[d] || {};

  // ---------- toast / saved ----------
  let toastTimer, savedTimer;
  function toast(msg, kind) {
    const t = $('toast');
    t.textContent = msg; t.className = 'toast' + (kind ? ' ' + kind : ''); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }
  function flashSaved() {
    const s = $('savedInd'); s.hidden = false; s.classList.add('show');
    clearTimeout(savedTimer); savedTimer = setTimeout(() => s.classList.remove('show'), 1200);
  }

  // ---------- activity option lists ----------
  function activityOptions(selected) {
    const opt = (v, t, sel) => '<option value="' + v + '"' + (sel ? ' selected' : '') + '>' + t + '</option>';
    let html = opt('', '— pakai default bulan —', !selected);
    html += opt('__none__', '— kosongkan —', selected === '__none__');
    for (const t of Templates.all()) html += opt(t.id, escapeHtml(t.label), selected === t.id);
    return html;
  }
  function defaultOptions(selected) {
    let html = '';
    for (const t of Templates.all()) html += '<option value="' + t.id + '"' + (selected === t.id ? ' selected' : '') + '>' + escapeHtml(t.label) + '</option>';
    html += '<option value=""' + (!selected ? ' selected' : '') + '>— kosong —</option>';
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
    $('defaultActivity').innerHTML = defaultOptions(month.defaultAct);
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
      const weekend = dow(month.year, month.month, d) % 6 === 0;
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
    const now = new Date();
    const isToday = now.getFullYear() === month.year && now.getMonth() + 1 === month.month && now.getDate() === selectedDay;
    const weekend = dw % 6 === 0;
    if (isToday) { badge.hidden = false; badge.textContent = weekend ? 'Hari ini · akhir pekan' : 'Hari ini'; badge.className = 'dbadge today'; }
    else if (weekend) { badge.hidden = false; badge.textContent = 'Akhir pekan'; badge.className = 'dbadge we'; }
    else { badge.hidden = true; badge.textContent = ''; badge.className = 'dbadge'; }

    $('d-start').value = padTime(d.start);
    $('d-end').value = padTime(d.end);
    $('d-brk').value = padTime(d.brk);
    $('d-act').innerHTML = activityOptions(d.act);
    $('d-paid').value = d.paidLeave != null ? String(d.paidLeave) : '';
    const hasHol = !!(d.hStart || d.hEnd || d.hBrk);
    $('d-holiday').checked = hasHol;
    $('holidayBox').hidden = !hasHol;
    $('d-hstart').value = padTime(d.hStart);
    $('d-hend').value = padTime(d.hEnd);
    $('d-hbrk').value = padTime(d.hBrk);
    updateOvertime();
    updateActHint();
  }

  function updateOvertime() {
    const start = $('d-start').value, end = $('d-end').value;
    let brk = $('d-brk').value;
    if (start && !brk) brk = DEFAULT_BREAK;
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
    const hint = $('d-actHint'); if (!hint) return;
    const v = $('d-act').value;
    if (v === '__none__') { hint.className = 'acthint'; hint.textContent = '業務内容 dikosongkan untuk hari ini'; return; }
    if (!v) {
      const def = Templates.find(month.defaultAct);
      hint.className = 'acthint';
      hint.textContent = def ? '→ pakai default bulan: ' + def.label : '→ default bulan kosong';
      return;
    }
    const t = Templates.find(v);
    hint.className = 'acthint ok';
    hint.textContent = t ? '日本語: ' + t.ja : '';
  }

  function readDayCard() {
    const d = {};
    const start = $('d-start').value, end = $('d-end').value;
    if (start) d.start = start;
    if (end) d.end = end;
    let brk = $('d-brk').value;
    if (start && !brk) { brk = DEFAULT_BREAK; $('d-brk').value = DEFAULT_BREAK; }
    if (brk) d.brk = brk;
    const act = $('d-act').value;
    if (act) d.act = act; // template id; '' = use month default (not stored)
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
    return d;
  }

  function onDayChange(e) {
    if (e && e.target && e.target.id === 'd-holiday') $('holidayBox').hidden = !$('d-holiday').checked;
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
    selectedDay = Math.min(day || defaultDayFor(y, m), daysInMonth(y, m));
    renderMonthBar(); renderSummary(); renderDayCard(); renderCalendar();
  }

  // ---------- settings ----------
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
      settings: Store.getSettings(), months: Store.getMonths() };
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
        if (data.months) Store.saveMonths(data.months);
        markChanged();
        toast('Restore berhasil, memuat ulang…', 'ok');
        setTimeout(() => location.reload(), 800);
      } catch (err) { toast('File backup tidak valid', 'err'); }
    };
    r.readAsText(file); e.target.value = '';
  }

  // ---------- cloud storage (Supabase) ----------
  let syncTimer, syncSuspended = false;
  const nowTime = () => new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  function collectData() {
    return { _app: 'kinmu-report', _v: 1,
      updatedAt: Store.get('kinmu.updatedAt', 0) || Date.now(),
      settings: Store.getSettings(), months: Store.getMonths() };
  }
  function applyData(d) {
    if (!d) return;
    if (d.settings) Store.saveSettings(d.settings);
    if (d.months) Store.saveMonths(d.months);
    Store.set('kinmu.updatedAt', d.updatedAt || Date.now());
  }
  function mergeData(L, R) {
    if (!R || !R._app) return L || R;
    const out = { _app: 'kinmu-report', _v: 1, months: {} };
    const lm = (L && L.months) || {}, rm = R.months || {};
    for (const k of new Set([...Object.keys(lm), ...Object.keys(rm)])) {
      if (!lm[k]) out.months[k] = rm[k];
      else if (!rm[k]) out.months[k] = lm[k];
      else out.months[k] = ((rm[k]._u || 0) > (lm[k]._u || 0)) ? rm[k] : lm[k];
    }
    const rNewer = (R.updatedAt || 0) > ((L && L.updatedAt) || 0);
    out.settings = rNewer ? (R.settings || (L && L.settings) || {}) : ((L && L.settings) || R.settings || {});
    out.updatedAt = Math.max((L && L.updatedAt) || 0, R.updatedAt || 0);
    return out;
  }
  function setSyncStatus(msg, kind) {
    const el = $('syncStatus');
    if (el) { el.textContent = msg ? '☁ ' + msg : ''; el.className = 'syncstatus' + (kind ? ' ' + kind : ''); }
  }
  function renderAuthUI() {
    const on = Cloud.loggedIn();
    if ($('authLoggedOut')) $('authLoggedOut').hidden = on;
    if ($('authLoggedIn')) $('authLoggedIn').hidden = !on;
    if ($('authBox')) $('authBox').open = !on;
    if ($('authSummary')) $('authSummary').textContent = on ? '· tersambung' : '· belum masuk';
    if (on && $('authUserEmail')) $('authUserEmail').textContent = (Cloud.user() && Cloud.user().email) || '';
    if (!on) setSyncStatus('belum masuk — data belum di cloud', 'err');
  }
  function scheduleSync() {
    if (syncSuspended || !Cloud.loggedIn()) return;
    setSyncStatus('menyimpan…', 'pending');
    clearTimeout(syncTimer);
    syncTimer = setTimeout(flushSync, 2000);
  }
  async function flushSync() {
    clearTimeout(syncTimer);
    if (!Cloud.loggedIn()) return;
    try { await Cloud.save(collectData()); setSyncStatus('tersimpan ' + nowTime(), 'ok'); }
    catch (e) { setSyncStatus('gagal simpan: ' + e.message, 'err'); }
  }
  async function pullMergeApply() {
    const remote = await Cloud.load();
    const merged = mergeData(collectData(), remote);
    syncSuspended = true;
    applyData(merged);
    loadState(); renderAll();
    syncSuspended = false;
    await Cloud.save(merged);
  }
  async function initialSync() {
    if (!Cloud.available()) { renderAuthUI(); return; }
    await Cloud.refreshUser();
    renderAuthUI();
    if (!Cloud.loggedIn()) return;
    setSyncStatus('menyinkronkan…', 'pending');
    try { await pullMergeApply(); setSyncStatus('tersinkron ✓ ' + nowTime(), 'ok'); }
    catch (e) { syncSuspended = false; setSyncStatus('gagal sync: ' + e.message, 'err'); }
  }
  async function doAuth(mode) {
    if (!Cloud.available()) { toast('Cloud belum siap — cek koneksi internet', 'err'); return; }
    const email = $('authEmail').value.trim(), password = $('authPass').value;
    if (!email || !password) { toast('Isi email & password dulu', 'err'); return; }
    const btn = mode === 'signup' ? $('authSignup') : $('authLogin');
    btn.disabled = true; const old = btn.textContent; btn.textContent = '…';
    setSyncStatus('masuk…', 'pending');
    try {
      if (mode === 'signup') await Cloud.signUp(email, password);
      else await Cloud.signIn(email, password);
      $('authPass').value = '';
      renderAuthUI();
      await pullMergeApply();
      setSyncStatus('tersinkron ✓ ' + nowTime(), 'ok');
      toast('Berhasil masuk ✓ data Anda kini tersimpan di cloud', 'ok');
    } catch (e) {
      setSyncStatus('gagal masuk', 'err');
      toast((mode === 'signup' ? 'Gagal daftar: ' : 'Gagal masuk: ') + e.message, 'err');
    } finally { btn.disabled = false; btn.textContent = old; }
  }

  // ---------- events ----------
  function bindEvents() {
    $('dayCard').addEventListener('change', onDayChange);
    $('dayCard').addEventListener('input', (e) => {
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
      month.defaultAct = $('defaultActivity').value; saveMonth(); updateActHint(); flashSaved();
    });

    $('saveSettings').addEventListener('click', () => {
      settings = {
        name: $('set-name').value.trim(), sealKatakana: $('set-seal').value.trim(),
        client: $('set-client').value.trim(), clientDept: $('set-dept').value.trim(),
        orgUnit: $('set-org').value.trim(), bizContent: $('set-biz').value.trim(),
        agency: $('set-agency').value.trim(), address: $('set-address').value.trim(),
      };
      Store.saveSettings(settings); markChanged(); toast('Pengaturan tersimpan', 'ok');
    });

    $('authLogin').addEventListener('click', () => doAuth('login'));
    $('authSignup').addEventListener('click', () => doAuth('signup'));
    const authEnter = (e) => { if (e.key === 'Enter') doAuth('login'); };
    $('authEmail').addEventListener('keydown', authEnter);
    $('authPass').addEventListener('keydown', authEnter);
    $('authLogout').addEventListener('click', async () => {
      await flushSync();
      try { await Cloud.signOut(); } catch (e) { /* ignore */ }
      renderAuthUI();
      toast('Sudah keluar. Data tetap aman di cloud — masuk lagi untuk mengaksesnya.', 'ok');
    });
    $('cloudPull').addEventListener('click', async () => {
      setSyncStatus('memuat…', 'pending');
      try { await pullMergeApply(); setSyncStatus('tersinkron ✓ ' + nowTime(), 'ok'); toast('Data dimuat dari cloud', 'ok'); }
      catch (e) { syncSuspended = false; toast('Gagal muat: ' + e.message, 'err'); }
    });
    $('authChangePass').addEventListener('click', async () => {
      const p = prompt('Password baru (min. 6 karakter):');
      if (!p) return;
      try { await Cloud.changePassword(p); toast('Password berhasil diganti', 'ok'); }
      catch (e) { toast('Gagal ganti password: ' + e.message, 'err'); }
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSync(); });

    $('exportBtn').addEventListener('click', doExport);
    $('backupBtn').addEventListener('click', doBackup);
    $('restoreFile').addEventListener('change', doRestore);
  }

  // ---------- init ----------
  function loadState() {
    months = Store.getMonths();
    settings = Store.getSettings();
    activeKey = Store.getActive();
    if (!(activeKey && months[activeKey])) {
      const t = new Date();
      month = newMonth(t.getFullYear(), t.getMonth() + 1);
      activeKey = Store.monthKey(month.year, month.month);
      months[activeKey] = month; Store.saveMonths(months); Store.setActive(activeKey);
    } else {
      month = months[activeKey];
    }
    normalizeMonths();
    month = months[activeKey];
    selectedDay = Math.min(selectedDay || defaultDayFor(month.year, month.month), daysInMonth(month.year, month.month));
  }
  function renderAll() {
    renderMonthBar(); renderSettings(); renderSummary();
    renderDayCard(); renderCalendar(); renderAuthUI();
  }
  function init() {
    selectedDay = null;
    loadState();
    renderAll();
    bindEvents();
    initialSync();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
