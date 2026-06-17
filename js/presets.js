/*
 * presets.js — the Indonesian->Japanese activity phrasebook (業務内容).
 *
 * Seeded with the user's existing recurring sentence so the app is useful immediately.
 * The user picks a preset per day (or one default for all working days) and can add,
 * edit, or delete presets. No machine translation: the Japanese is always something the
 * user has approved, which matters for a formal company document.
 */
const Presets = (() => {
  const SEED = [
    {
      id: 'p_default',
      labelId: 'Koreksi biaya komponen bermasalah + tugas rutin',
      textJa: '問題のある部品の原価計算の修正、未完了分の処理、および余力に応じた目標業務の実施。',
    },
  ];

  function getAll() {
    let p = Store.get(Store.K.presets, null);
    if (!p || !Array.isArray(p)) {
      p = SEED.map((x) => Object.assign({}, x));
      Store.set(Store.K.presets, p);
    }
    return p;
  }
  function saveAll(p) { Store.set(Store.K.presets, p); }
  function find(id) { return getAll().find((x) => x.id === id) || null; }

  function add(labelId, textJa) {
    const p = getAll();
    const item = { id: 'p_' + Date.now().toString(36), labelId: labelId.trim(), textJa: textJa.trim() };
    p.push(item);
    saveAll(p);
    return item;
  }
  function update(id, labelId, textJa) {
    const p = getAll();
    const it = p.find((x) => x.id === id);
    if (it) { it.labelId = labelId.trim(); it.textJa = textJa.trim(); saveAll(p); }
  }
  function remove(id) { saveAll(getAll().filter((x) => x.id !== id)); }

  return { getAll, saveAll, find, add, update, remove, SEED };
})();
