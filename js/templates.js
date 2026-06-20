/*
 * templates.js — the fixed activity (業務内容) options.
 *
 * Activities are chosen from a FIXED list only (no free typing, no machine
 * translation). Each option has an Indonesian label for the UI and a pre-approved
 * business-Japanese sentence that is written verbatim into the exported sheet.
 * To add/adjust wording, edit this list.
 */
const Templates = (() => {
  const LIST = [
    {
      id: 't1',
      label: 'Perbaikan biaya & identitas part + penyelesaian target part harian',
      ja: '部品の原価および識別情報の修正、ならびに当日の部品完了目標の達成。',
    },
    {
      id: 't2',
      label: 'Perbaikan biaya & identitas part',
      ja: '部品の原価および識別情報の修正。',
    },
    {
      id: 't3',
      label: 'Penyelesaian target part harian',
      ja: '当日の部品完了目標の達成。',
    },
  ];
  const all = () => LIST;
  const find = (id) => LIST.find((t) => t.id === id) || null;
  return { all, find, LIST };
})();
