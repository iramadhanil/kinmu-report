/*
 * storage.js — localStorage persistence. Everything the app knows lives here, in the
 * user's browser only. Nothing is ever sent anywhere.
 */
const Store = (() => {
  const K = {
    settings: 'kinmu.settings',
    presets: 'kinmu.presets',
    months: 'kinmu.months',
    active: 'kinmu.activeMonth',
    tm: 'kinmu.tm', // translation memory cache: { indonesianText: japaneseText }
  };

  function get(key, def) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : def;
    } catch (e) {
      return def;
    }
  }
  function set(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }

  // Header info. Defaults are intentionally blank for the PII fields so nothing
  // personal ships in the repo; the user fills them once.
  const DEFAULT_SETTINGS = {
    name: '',          // 氏名
    sealKatakana: '',  // 本人印 (katakana)
    client: '',        // 就業先
    clientDept: '',    // 就業部署
    orgUnit: '-',      // 組織単位
    bizContent: '（委託業務）', // 業務内容 (label value)
    agency: '',        // 派遣元
    address: '',       // 所在地
  };
  function getSettings() { return Object.assign({}, DEFAULT_SETTINGS, get(K.settings, {})); }
  function saveSettings(s) { set(K.settings, s); }

  function getMonths() { return get(K.months, {}); }
  function saveMonths(m) { set(K.months, m); }
  function getActive() { return get(K.active, null); }
  function setActive(key) { set(K.active, key); }

  function monthKey(year, month) {
    return year + '-' + String(month).padStart(2, '0');
  }

  return { K, get, set, getSettings, saveSettings, getMonths, saveMonths, getActive, setActive, monthKey, DEFAULT_SETTINGS };
})();
