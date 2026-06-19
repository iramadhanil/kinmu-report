/*
 * cloud.js — cloud-first storage via Supabase (the user's own private project).
 *
 * Auth: email + password (new users are auto-confirmed by a DB trigger, so no
 * confirmation email is needed). The whole app state is stored as one JSONB row
 * per user in public.app_state, protected by row-level security. localStorage is
 * only a cache; the cloud is the source of truth — so clearing the browser just
 * logs the user out, and logging back in restores everything on any device.
 *
 * The URL + anon key below are PUBLIC by design (safe to ship); access is gated
 * by login + RLS.
 */
const Cloud = (() => {
  const URL = 'https://lliciapiaxhcolznubcd.supabase.co';
  const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsaWNpYXBpYXhoY29sem51YmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4ODQ2MzMsImV4cCI6MjA5NzQ2MDYzM30.555DyoSHTRHyX5hfEG3sZsQiF_cHCEPjJkFUkHJ99N8';

  let sb = null;
  let cachedUser = null;

  function available() { return typeof window !== 'undefined' && window.supabase && window.supabase.createClient; }
  function client() {
    if (!sb) {
      sb = window.supabase.createClient(URL, ANON, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'kinmu.auth' },
      });
    }
    return sb;
  }

  async function refreshUser() {
    if (!available()) return null;
    const { data } = await client().auth.getSession();
    cachedUser = data.session ? data.session.user : null;
    return cachedUser;
  }
  const user = () => cachedUser;
  const loggedIn = () => !!cachedUser;

  async function signIn(email, password) {
    const { data, error } = await client().auth.signInWithPassword({ email, password });
    if (error) throw new Error(humanize(error.message));
    cachedUser = data.user;
    return data.user;
  }
  async function signUp(email, password) {
    const { data, error } = await client().auth.signUp({ email, password });
    if (error) {
      // already registered? just sign in
      if (/already|registered|exists/i.test(error.message)) return signIn(email, password);
      throw new Error(humanize(error.message));
    }
    if (!data.session) return signIn(email, password); // fallback (shouldn't happen w/ auto-confirm)
    cachedUser = data.user;
    return data.user;
  }
  async function signOut() { await client().auth.signOut(); cachedUser = null; }
  async function changePassword(newPassword) {
    const { error } = await client().auth.updateUser({ password: newPassword });
    if (error) throw new Error(humanize(error.message));
  }

  async function load() {
    const u = await refreshUser();
    if (!u) return null;
    const { data, error } = await client().from('app_state').select('data').eq('user_id', u.id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? data.data : null;
  }
  async function save(payload) {
    const u = user() || await refreshUser();
    if (!u) throw new Error('Belum masuk');
    const { error } = await client().from('app_state')
      .upsert({ user_id: u.id, data: payload, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
  }

  function humanize(msg) {
    if (/Invalid login credentials/i.test(msg)) return 'Email atau password salah';
    if (/Password should be at least/i.test(msg)) return 'Password minimal 6 karakter';
    if (/Unable to validate email|invalid format/i.test(msg)) return 'Format email tidak valid';
    return msg;
  }

  return { available, refreshUser, user, loggedIn, signIn, signUp, signOut, changePassword, load, save };
})();
