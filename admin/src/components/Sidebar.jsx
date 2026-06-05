import React from 'react';
import { T } from '../lib/utils';
import { useAdmin } from '../App';

const NAV = [
  { id:'dashboard',     label:'Tableau de bord', icon:'▦' },
  { id:'users',         label:'Utilisateurs',    icon:'◎' },
  { id:'capsules',      label:'Capsules',        icon:'◈' },
  { id:'souvenirs',     label:'Souvenirs',       icon:'◻' },
  { id:'notifications', label:'Notifications',   icon:'◬' },
  { id:'content',       label:'Contenu app',     icon:'✦' },
  { id:'analytics',     label:'Analytics',       icon:'◌' },
  { id:'monetisation',  label:'Monétisation',    icon:'💰' },
  { id:'codes_promo',   label:'Codes promo',     icon:'🏷️' },
  { id:'gamification',  label:'Gamification',    icon:'🏆' },
  { id:'moderation',    label:'Modération',      icon:'◉' },
  { id:'parrainage',    label:'Parrainage',      icon:'✦' },
  { id:'settings',      label:'Paramètres',      icon:'⊕' },
];

// Logo Blooom : trois cercles concentriques en dégradé
function Logo() {
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="slg" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#FF8A3D" />
          <stop offset="50%"  stopColor="#FF5C9D" />
          <stop offset="100%" stopColor="#C65CE8" />
        </linearGradient>
      </defs>
      <circle cx="14" cy="34" r="10" fill="none" stroke="url(#slg)" strokeWidth="2.5" />
      <circle cx="26" cy="26" r="13" fill="none" stroke="url(#slg)" strokeWidth="2.5" />
      <circle cx="38" cy="18" r="15" fill="none" stroke="url(#slg)" strokeWidth="2.5" />
    </svg>
  );
}

export default function Sidebar({ currentPage, onNavigate }) {
  const { user, logout, monetAlerts } = useAdmin();
  const [hovered, setHovered] = React.useState(null);

  // Nombre d'alertes financières actives — déclenche le badge rouge sur Monétisation
  const nbAlertesMonet = monetAlerts
    ? Object.values(monetAlerts).filter(Boolean).length
    : 0;

  return (
    <aside style={{
      width: 220, flexShrink: 0,
      background: T.surface,
      borderRight: `1px solid ${T.border}`,
      display: 'flex', flexDirection: 'column',
      height: '100vh', overflowY: 'auto',
    }}>
      {/* En-tête logo */}
      <div style={{ padding:'28px 20px 20px', borderBottom:`1px solid ${T.border}` }}>
        <Logo />
        <div style={{ marginTop:10, fontFamily: T.ff_titre, fontWeight:800, fontSize:18, background: T.grad, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
          Blooom Admin
        </div>
        <div style={{ fontSize:10, color: T.muted, marginTop:2, letterSpacing:1.5 }}>BACKOFFICE</div>
      </div>

      {/* Navigation */}
      <nav style={{ flex:1, padding:'12px 10px' }}>
        {NAV.map(item => {
          const active = currentPage === item.id;
          const hover  = hovered === item.id;
          return (
            <button key={item.id}
              onClick={() => onNavigate(item.id)}
              onMouseEnter={() => setHovered(item.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display:'flex', alignItems:'center', gap:10,
                width:'100%', padding:'10px 12px', borderRadius:10,
                border:'none', cursor:'pointer',
                textAlign:'left', fontSize:13, fontWeight: active ? 700 : 500,
                fontFamily: T.ff_corps,
                background: active ? `${T.a2}18` : hover ? `${T.border}40` : 'transparent',
                color: active ? T.a2 : hover ? T.text : T.muted,
                transition:'all 0.15s ease',
                marginBottom:2,
              }}>
              <span style={{
                fontSize:15,
                background: active ? T.grad : 'none',
                WebkitBackgroundClip: active ? 'text' : 'unset',
                WebkitTextFillColor: active ? 'transparent' : 'currentColor',
              }}>{item.icon}</span>
              {item.label}
              {/* Point rouge fixe sur Modération */}
              {item.id === 'moderation' && (
                <span style={{ marginLeft:'auto', width:7, height:7, borderRadius:'50%', background: T.danger }} />
              )}
              {/* Badge rouge dynamique sur Monétisation : nb d'alertes actives */}
              {item.id === 'monetisation' && nbAlertesMonet > 0 && (
                <span style={{
                  marginLeft:'auto', minWidth:18, height:18, borderRadius:999,
                  background: T.danger, color:'#fff',
                  fontSize:10, fontWeight:700, fontFamily: T.ff_corps,
                  display:'inline-flex', alignItems:'center', justifyContent:'center', padding:'0 5px',
                }}>
                  {nbAlertesMonet}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Profil admin en bas */}
      <div style={{ padding:'16px 14px', borderTop:`1px solid ${T.border}` }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
          <div style={{
            width:32, height:32, borderRadius:'50%',
            background: T.grad, display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:13, fontWeight:700, color:'#fff', flexShrink:0,
          }}>
            {(user?.email || '?').charAt(0).toUpperCase()}
          </div>
          <div style={{ flex:1, overflow:'hidden' }}>
            <div style={{ fontSize:11, fontWeight:700, color: T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {user?.email || ''}
            </div>
            <div style={{ fontSize:10, color: T.muted }}>Administrateur</div>
          </div>
        </div>
        <button onClick={logout}
          style={{ width:'100%', padding:'8px 12px', borderRadius:8, border:`1px solid ${T.border}`, background:'transparent', color: T.muted, cursor:'pointer', fontSize:12, fontFamily: T.ff_corps, transition:'all 0.15s' }}
          onMouseEnter={e => { e.target.style.borderColor = T.danger; e.target.style.color = T.danger; }}
          onMouseLeave={e => { e.target.style.borderColor = T.border; e.target.style.color = T.muted; }}>
          Déconnexion
        </button>
      </div>
    </aside>
  );
}
