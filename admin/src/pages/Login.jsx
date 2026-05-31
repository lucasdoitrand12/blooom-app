// Page de connexion — email + mot de passe uniquement (pas de magic link)
// Vérifie ensuite que l'email est dans la table admins avant de laisser entrer
import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { T } from '../lib/utils';

function Logo() {
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
      <defs>
        <linearGradient id="llg" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%"  stopColor="#FF8A3D" />
          <stop offset="50%" stopColor="#FF5C9D" />
          <stop offset="100%" stopColor="#C65CE8" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="52" r="15" fill="none" stroke="url(#llg)" strokeWidth="3" />
      <circle cx="40" cy="40" r="20" fill="none" stroke="url(#llg)" strokeWidth="3" />
      <circle cx="60" cy="28" r="24" fill="none" stroke="url(#llg)" strokeWidth="3" />
    </svg>
  );
}

export default function Login() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError('');

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) { setError('Email ou mot de passe incorrect.'); return; }
      // La vérification admin se fait dans App.jsx après la mise à jour de la session
    } catch {
      setError('Erreur de connexion. Réessayez.');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    width:'100%', padding:'12px 16px', borderRadius:12, border:`1px solid ${T.border}`,
    background: T.card, color: T.text, fontFamily: T.ff_corps, fontSize:14, outline:'none',
    transition:'border-color .15s',
  };

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background: T.bg, padding:20 }}>
      {/* Fond décoratif */}
      <div style={{ position:'fixed', inset:0, pointerEvents:'none', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:'-20%', right:'-10%', width:600, height:600, borderRadius:'50%', background:'radial-gradient(circle, #C65CE820 0%, transparent 70%)' }} />
        <div style={{ position:'absolute', bottom:'-20%', left:'-10%',  width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle, #FF8A3D15 0%, transparent 70%)' }} />
      </div>

      <div style={{ width:'100%', maxWidth:420, position:'relative' }}>
        {/* Carte principale */}
        <div style={{ background: T.surface, borderRadius:24, padding:'44px 40px', border:`1px solid ${T.border}`, boxShadow:`0 40px 80px rgba(0,0,0,.5)` }}>
          {/* Logo + titre */}
          <div style={{ textAlign:'center', marginBottom:36 }}>
            <div style={{ display:'inline-block', marginBottom:16 }}><Logo /></div>
            <h1 style={{ fontFamily: T.ff_titre, fontWeight:800, fontSize:26, background: T.grad, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', marginBottom:6 }}>
              Blooom Admin
            </h1>
            <p style={{ color: T.muted, fontSize:13 }}>Réservé aux administrateurs autorisés</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom:16 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color: T.muted, marginBottom:6, letterSpacing:.5 }}>ADRESSE EMAIL</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@blooom.app" style={inputStyle}
                onFocus={e=>e.target.style.borderColor=T.a2} onBlur={e=>e.target.style.borderColor=T.border} />
            </div>

            <div style={{ marginBottom:24 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color: T.muted, marginBottom:6, letterSpacing:.5 }}>MOT DE PASSE</label>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••••" style={inputStyle}
                onFocus={e=>e.target.style.borderColor=T.a2} onBlur={e=>e.target.style.borderColor=T.border} />
            </div>

            {error && (
              <div style={{ marginBottom:16, padding:'10px 14px', borderRadius:10, background:`${T.danger}18`, border:`1px solid ${T.danger}40`, color: T.danger, fontSize:12, textAlign:'center' }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading || !email || !password}
              style={{ width:'100%', padding:'13px', borderRadius:12, border:'none', background: (loading||!email||!password) ? T.elevated : T.grad, color:'#fff', fontFamily: T.ff_corps, fontWeight:700, fontSize:15, cursor: (loading||!email||!password) ? 'not-allowed' : 'pointer', transition:'all .2s' }}>
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>

          <p style={{ marginTop:24, textAlign:'center', fontSize:11, color: T.muted, lineHeight:1.6 }}>
            Accès restreint. Si vous pensez être administrateur,<br/>
            contactez l'équipe technique.
          </p>
        </div>
      </div>
    </div>
  );
}
