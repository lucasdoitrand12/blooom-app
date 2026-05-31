import React, { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from './lib/supabase';
import { T } from './lib/utils';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Capsules from './pages/Capsules';
import Souvenirs from './pages/Souvenirs';
import Notifications from './pages/Notifications';
import Content from './pages/Content';
import Analytics from './pages/Analytics';
import Moderation from './pages/Moderation';
import Settings from './pages/Settings';
import Parrainage from './pages/Parrainage';

// Contexte partagé : session admin + helpers navigation
export const AdminCtx = createContext(null);
export function useAdmin() { return useContext(AdminCtx); }

// Vérifie si l'utilisateur connecté est dans la table admins
async function checkIsAdmin(email) {
  const { data } = await supabase.from('admins').select('id').eq('email', email).maybeSingle();
  return !!data;
}

function LoadingScreen() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background: T.bg, flexDirection:'column', gap:20 }}>
      <svg width="60" height="24" viewBox="0 0 60 24">
        <defs>
          <linearGradient id="lg" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#FF8A3D" />
            <stop offset="50%"  stopColor="#FF5C9D" />
            <stop offset="100%" stopColor="#C65CE8" />
          </linearGradient>
        </defs>
        {[10,30,50].map((cx,i) => (
          <circle key={i} cx={cx} cy={12} r={9} fill="none" stroke="url(#lg)" strokeWidth="2"
            style={{ animation:`pulse 1.4s ${i*0.2}s ease-in-out infinite` }} />
        ))}
      </svg>
      <div style={{ color: T.muted, fontSize:13 }}>Chargement…</div>
      <style>{`@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}`}</style>
    </div>
  );
}

function Page403({ onLogout }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', background: T.bg, gap:16 }}>
      <div style={{ fontSize:64 }}>🔒</div>
      <h1 style={{ fontFamily: T.ff_titre, fontSize:28, fontWeight:800 }}>Accès refusé</h1>
      <p style={{ color: T.muted, maxWidth:360, textAlign:'center', lineHeight:1.6 }}>
        Votre compte n'est pas autorisé à accéder au panneau d'administration Blooom.
        Contactez un administrateur existant pour obtenir l'accès.
      </p>
      <button onClick={onLogout}
        style={{ marginTop:8, padding:'10px 24px', background: T.surface, border:`1px solid ${T.border}`, borderRadius:10, color: T.text, cursor:'pointer', fontFamily: T.ff_corps, fontSize:14 }}>
        Se déconnecter
      </button>
    </div>
  );
}

export default function App() {
  const [session,  setSession]  = useState(undefined); // undefined = en cours de chargement
  const [isAdmin,  setIsAdmin]  = useState(null);
  const [page,     setPage]     = useState('dashboard');

  useEffect(() => {
    // Charge la session persistée, puis écoute les changements
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) checkIsAdmin(session.user.email).then(setIsAdmin);
      else setIsAdmin(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) checkIsAdmin(session.user.email).then(setIsAdmin);
      else { setIsAdmin(false); setPage('dashboard'); }
    });

    return () => subscription.unsubscribe();
  }, []);

  const logout = () => supabase.auth.signOut();

  // Journalise une action admin dans la table admin_logs
  async function logAction(action, cible = null, details = null) {
    if (!session) return;
    await supabase.from('admin_logs').insert({
      admin_id: session.user.id,
      action,
      cible: cible ? String(cible) : null,
      details: details ? JSON.stringify(details) : null,
    });
  }

  if (session === undefined || (session && isAdmin === null)) return <LoadingScreen />;
  if (!session) return <Login />;
  if (!isAdmin)  return <Page403 onLogout={logout} />;

  const ctx = { user: session.user, logout, navigate: setPage, logAction };

  const PAGES = {
    dashboard: Dashboard, users: Users, capsules: Capsules,
    souvenirs: Souvenirs, notifications: Notifications, content: Content,
    analytics: Analytics, moderation: Moderation, settings: Settings,
    parrainage: Parrainage,
  };
  const PageComponent = PAGES[page] || Dashboard;

  return (
    <AdminCtx.Provider value={ctx}>
      <div style={{ display:'flex', height:'100vh', overflow:'hidden', background: T.bg, fontFamily: T.ff_corps }}>
        <Sidebar currentPage={page} onNavigate={setPage} />
        <main style={{ flex:1, overflowY:'auto', padding:'32px 36px' }}>
          <PageComponent />
        </main>
      </div>
    </AdminCtx.Provider>
  );
}
