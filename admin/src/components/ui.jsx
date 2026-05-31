// Composants UI réutilisables dans tout le backoffice
import React, { useState } from 'react';
import { T } from '../lib/utils';

// ── Skeleton loader animé ─────────────────────────────────────────────────────
const SK_ANIM = `@keyframes skPulse{0%,100%{opacity:.35}50%{opacity:.7}}`;

export function Skeleton({ w='100%', h=18, radius=6, style={} }) {
  return (
    <>
      <style>{SK_ANIM}</style>
      <div style={{ width:w, height:h, borderRadius:radius, background: T.elevated, animation:'skPulse 1.4s ease-in-out infinite', ...style }} />
    </>
  );
}

export function SkeletonCard({ rows=3, style={} }) {
  return (
    <div style={{ background: T.card, borderRadius:16, padding:24, border:`1px solid ${T.border}`, ...style }}>
      <Skeleton h={14} w="40%" style={{ marginBottom:16 }} />
      {Array.from({length:rows}).map((_,i)=>(
        <Skeleton key={i} h={12} w={`${60+i*15}%`} style={{ marginBottom:10 }} />
      ))}
    </div>
  );
}

// ── Modale de confirmation — oblige à saisir "CONFIRMER" ──────────────────────
export function ConfirmModal({ open, title, message, danger=true, onConfirm, onCancel }) {
  const [saisie, setSaisie] = useState('');
  if (!open) return null;
  const ok = saisie === 'CONFIRMER';
  return (
    <div style={{ position:'fixed', inset:0, zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.75)', backdropFilter:'blur(4px)' }}
      onClick={onCancel}>
      <div style={{ background: T.elevated, borderRadius:20, padding:'32px 28px', maxWidth:420, width:'90%', border:`1px solid ${danger ? T.danger+'40' : T.border}`, boxShadow:`0 0 60px ${danger ? T.danger+'20' : '#0006'}` }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontSize:32, marginBottom:12 }}>{danger ? '⚠️' : '❓'}</div>
        <h2 style={{ fontFamily: T.ff_titre, fontWeight:800, fontSize:20, marginBottom:8, color: T.text }}>{title}</h2>
        <p style={{ color: T.muted, fontSize:13, lineHeight:1.6, marginBottom:20 }}>{message}</p>
        <p style={{ fontSize:12, color: T.muted, marginBottom:8 }}>
          Tapez <strong style={{ color: danger ? T.danger : T.a2 }}>CONFIRMER</strong> pour continuer
        </p>
        <input value={saisie} onChange={e=>setSaisie(e.target.value)}
          placeholder="CONFIRMER"
          style={{ width:'100%', padding:'10px 14px', borderRadius:10, border:`1px solid ${T.border}`, background: T.card, color: T.text, fontFamily: T.ff_corps, fontSize:14, outline:'none', marginBottom:16 }} />
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onCancel}
            style={{ flex:1, padding:'10px', borderRadius:10, border:`1px solid ${T.border}`, background:'transparent', color: T.muted, cursor:'pointer', fontFamily: T.ff_corps, fontSize:13 }}>
            Annuler
          </button>
          <button onClick={ok ? onConfirm : undefined}
            disabled={!ok}
            style={{ flex:1, padding:'10px', borderRadius:10, border:'none', background: ok ? (danger ? T.danger : T.grad) : T.elevated, color: ok ? '#fff' : T.muted, cursor: ok ? 'pointer' : 'not-allowed', fontFamily: T.ff_corps, fontWeight:700, fontSize:13, transition:'all .2s' }}>
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Carte KPI ─────────────────────────────────────────────────────────────────
export function KPICard({ label, value, icon, delta, loading=false, help=null }) {
  const [showHelp, setShowHelp] = useState(false);
  const up = delta > 0;
  return (
    <div style={{ background: T.card, borderRadius:16, padding:'22px 24px', border:`1px solid ${T.border}`, flex:1, minWidth:150, position:'relative' }}>
      {help && (
        <div style={{ position:'absolute', top:14, right:14 }}
          onMouseEnter={()=>setShowHelp(true)} onMouseLeave={()=>setShowHelp(false)}>
          <span style={{ color: T.muted, fontSize:11, cursor:'help', border:`1px solid ${T.border}`, borderRadius:'50%', width:18, height:18, display:'inline-flex', alignItems:'center', justifyContent:'center' }}>?</span>
          {showHelp && (
            <div style={{ position:'absolute', right:0, top:22, background: T.elevated, border:`1px solid ${T.border}`, borderRadius:10, padding:'8px 12px', fontSize:11, color: T.mutedHover, maxWidth:200, whiteSpace:'normal', lineHeight:1.5, zIndex:100 }}>
              {help}
            </div>
          )}
        </div>
      )}
      <div style={{ fontSize:22, marginBottom:10 }}>{icon}</div>
      {loading
        ? <Skeleton h={32} w="60%" style={{ marginBottom:8 }} />
        : <div style={{ fontFamily: T.ff_titre, fontWeight:800, fontSize:30, color: T.text, lineHeight:1 }}>{value}</div>
      }
      <div style={{ fontSize:12, color: T.muted, marginTop:6 }}>{label}</div>
      {delta !== undefined && delta !== null && (
        <div style={{ marginTop:8, fontSize:11, fontWeight:700, color: up ? T.success : T.danger, display:'flex', alignItems:'center', gap:3 }}>
          {up ? '↑' : '↓'} {Math.abs(delta)}% vs hier
        </div>
      )}
    </div>
  );
}

// ── En-tête de section ────────────────────────────────────────────────────────
export function SectionHeader({ title, subtitle, icon, children }) {
  return (
    <div style={{ marginBottom:28, display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
      <div>
        <h1 style={{ fontFamily: T.ff_titre, fontWeight:800, fontSize:26, color: T.text, display:'flex', alignItems:'center', gap:10 }}>
          <span>{icon}</span>
          <span style={{ background: T.grad, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>{title}</span>
        </h1>
        {subtitle && <p style={{ marginTop:6, fontSize:13, color: T.muted, lineHeight:1.5 }}>{subtitle}</p>}
      </div>
      {children && <div style={{ display:'flex', gap:10, alignItems:'center' }}>{children}</div>}
    </div>
  );
}

// ── Bouton ────────────────────────────────────────────────────────────────────
export function Btn({ children, onClick, variant='primary', size='md', disabled=false, style={} }) {
  const [hov, setHov] = useState(false);
  const base = {
    border:'none', cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: T.ff_corps, fontWeight:600, borderRadius:10, transition:'all .15s',
    opacity: disabled ? .5 : 1,
  };
  const sizes = { sm:'6px 12px', md:'9px 18px', lg:'12px 24px' };
  const fsize  = { sm:12, md:13, lg:14 };
  const vars = {
    primary: { background: hov ? T.gradHover : T.grad, color:'#fff', ...base, padding: sizes[size], fontSize: fsize[size] },
    secondary: { background: hov ? `${T.border}80` : 'transparent', border:`1px solid ${T.border}`, color: T.muted, ...base, padding: sizes[size], fontSize: fsize[size] },
    danger: { background: hov ? '#FF4444' : T.danger, color:'#fff', ...base, padding: sizes[size], fontSize: fsize[size] },
    ghost: { background: hov ? `${T.border}40` : 'transparent', border:`1px solid ${T.border}`, color: T.text, ...base, padding: sizes[size], fontSize: fsize[size] },
  };
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ ...vars[variant], ...style }}>{children}</button>
  );
}

// ── Input de recherche ────────────────────────────────────────────────────────
export function SearchInput({ value, onChange, placeholder='Rechercher…' }) {
  return (
    <div style={{ position:'relative', display:'inline-flex', alignItems:'center' }}>
      <span style={{ position:'absolute', left:12, color: T.muted, fontSize:14 }}>🔍</span>
      <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{ paddingLeft:36, paddingRight:14, paddingTop:9, paddingBottom:9, borderRadius:10, border:`1px solid ${T.border}`, background: T.card, color: T.text, fontFamily: T.ff_corps, fontSize:13, outline:'none', minWidth:240, transition:'border-color .15s' }}
        onFocus={e=>e.target.style.borderColor=T.a2}
        onBlur={e=>e.target.style.borderColor=T.border}
      />
    </div>
  );
}

// ── Badge statut ──────────────────────────────────────────────────────────────
export function Badge({ label, color }) {
  const map = {
    success: T.success, danger: T.danger, warning: T.warning,
    info: T.info, muted: T.muted,
  };
  const c = map[color] || color || T.muted;
  return (
    <span style={{ display:'inline-block', padding:'2px 10px', borderRadius:999, fontSize:11, fontWeight:700, background:`${c}20`, color:c, border:`1px solid ${c}40`, letterSpacing:.4 }}>
      {label}
    </span>
  );
}

// ── Tableau générique ─────────────────────────────────────────────────────────
export function Table({ columns, data, onRowClick, loading=false, emptyMsg='Aucune donnée' }) {
  if (loading) return (
    <div style={{ background: T.card, borderRadius:16, border:`1px solid ${T.border}`, padding:24 }}>
      {Array.from({length:5}).map((_,i)=>( <Skeleton key={i} h={40} radius={8} style={{ marginBottom:6 }} /> ))}
    </div>
  );
  if (!data?.length) return (
    <div style={{ background: T.card, borderRadius:16, border:`1px solid ${T.border}`, padding:'48px 24px', textAlign:'center', color: T.muted, fontSize:14 }}>
      {emptyMsg}
    </div>
  );
  return (
    <div style={{ background: T.card, borderRadius:16, border:`1px solid ${T.border}`, overflow:'hidden' }}>
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead>
          <tr style={{ borderBottom:`1px solid ${T.border}` }}>
            {columns.map(col => (
              <th key={col.key} style={{ padding:'12px 16px', textAlign:'left', fontSize:11, fontWeight:700, color: T.muted, letterSpacing:.8, textTransform:'uppercase', whiteSpace:'nowrap' }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, ri) => (
            <tr key={row.id || ri}
              onClick={() => onRowClick?.(row)}
              style={{ borderBottom:`1px solid ${T.border}40`, cursor: onRowClick ? 'pointer' : 'default', transition:'background .1s' }}
              onMouseEnter={e => { if (onRowClick) e.currentTarget.style.background = `${T.border}30`; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
              {columns.map(col => (
                <td key={col.key} style={{ padding:'12px 16px', fontSize:13, color: T.text, maxWidth: col.maxW || 'unset', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────
export function Pagination({ page, total, pageSize=50, onChange }) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:12 }}>
      <span style={{ fontSize:12, color: T.muted }}>
        {(page-1)*pageSize+1}–{Math.min(page*pageSize, total)} sur {total}
      </span>
      <div style={{ display:'flex', gap:6 }}>
        <Btn onClick={()=>onChange(page-1)} disabled={page<=1} variant='ghost' size='sm'>← Préc.</Btn>
        <span style={{ fontSize:12, color: T.muted, alignSelf:'center' }}>Page {page}/{pages}</span>
        <Btn onClick={()=>onChange(page+1)} disabled={page>=pages} variant='ghost' size='sm'>Suiv. →</Btn>
      </div>
    </div>
  );
}

// ── Panneau latéral droit ─────────────────────────────────────────────────────
export function SidePanel({ open, onClose, title, children }) {
  return (
    <>
      {open && <div style={{ position:'fixed', inset:0, zIndex:400, background:'rgba(0,0,0,.5)', backdropFilter:'blur(2px)' }} onClick={onClose} />}
      <div style={{
        position:'fixed', top:0, right:0, height:'100vh', zIndex:500,
        width: open ? 480 : 0, background: T.elevated, borderLeft:`1px solid ${T.border}`,
        overflow: open ? 'auto' : 'hidden', transition:'width .2s ease',
        display:'flex', flexDirection:'column',
      }}>
        {open && (
          <>
            <div style={{ padding:'20px 24px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
              <h3 style={{ fontFamily: T.ff_titre, fontWeight:800, fontSize:17 }}>{title}</h3>
              <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color: T.muted, fontSize:20, lineHeight:1 }}>✕</button>
            </div>
            <div style={{ padding:'20px 24px', flex:1, overflow:'auto' }}>{children}</div>
          </>
        )}
      </div>
    </>
  );
}

// ── Tooltip d'aide contextuelle ───────────────────────────────────────────────
export function HelpTooltip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position:'relative', display:'inline-flex' }}
      onMouseEnter={()=>setShow(true)} onMouseLeave={()=>setShow(false)}>
      <span style={{ fontSize:11, color: T.muted, border:`1px solid ${T.border}`, borderRadius:'50%', width:16, height:16, display:'inline-flex', alignItems:'center', justifyContent:'center', cursor:'help' }}>?</span>
      {show && (
        <div style={{ position:'absolute', bottom:'120%', left:'50%', transform:'translateX(-50%)', background: T.elevated, border:`1px solid ${T.border}`, borderRadius:10, padding:'8px 12px', fontSize:11, color: T.mutedHover, maxWidth:220, lineHeight:1.5, zIndex:200, whiteSpace:'normal', pointerEvents:'none' }}>
          {text}
        </div>
      )}
    </span>
  );
}

// ── Select stylisé ────────────────────────────────────────────────────────────
export function Select({ value, onChange, options, placeholder='Tous' }) {
  return (
    <select value={value} onChange={e=>onChange(e.target.value)}
      style={{ padding:'9px 32px 9px 12px', borderRadius:10, border:`1px solid ${T.border}`, background: T.card, color: value ? T.text : T.muted, fontFamily: T.ff_corps, fontSize:13, cursor:'pointer', outline:'none', appearance:'none',
        backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6' fill='none' stroke='%238070A0' stroke-width='1.5'/%3E%3C/svg%3E")`,
        backgroundRepeat:'no-repeat', backgroundPosition:'right 10px center' }}>
      <option value="">{placeholder}</option>
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ── Modale générique ──────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, width=520 }) {
  if (!open) return null;
  return (
    <div style={{ position:'fixed', inset:0, zIndex:8000, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.7)', backdropFilter:'blur(4px)' }}
      onClick={onClose}>
      <div style={{ background: T.elevated, borderRadius:20, padding:'28px 28px', width, maxWidth:'95vw', border:`1px solid ${T.border}`, maxHeight:'90vh', overflowY:'auto' }}
        onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <h2 style={{ fontFamily: T.ff_titre, fontWeight:800, fontSize:18 }}>{title}</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color: T.muted, fontSize:20 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Champ texte stylisé ───────────────────────────────────────────────────────
export function Field({ label, value, onChange, placeholder='', multiline=false, type='text' }) {
  const shared = {
    width:'100%', padding:'10px 14px', borderRadius:10, border:`1px solid ${T.border}`,
    background: T.card, color: T.text, fontFamily: T.ff_corps, fontSize:13, outline:'none',
    transition:'border-color .15s',
  };
  return (
    <label style={{ display:'block', marginBottom:14 }}>
      <span style={{ display:'block', fontSize:12, fontWeight:700, color: T.muted, marginBottom:6, letterSpacing:.5 }}>{label}</span>
      {multiline
        ? <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={4}
            style={{ ...shared, resize:'vertical' }}
            onFocus={e=>e.target.style.borderColor=T.a2} onBlur={e=>e.target.style.borderColor=T.border} />
        : <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
            style={shared}
            onFocus={e=>e.target.style.borderColor=T.a2} onBlur={e=>e.target.style.borderColor=T.border} />
      }
    </label>
  );
}

// ── Indicateur de rafraîchissement ────────────────────────────────────────────
export function RefreshDot({ loading }) {
  return (
    <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%',
      background: loading ? T.warning : T.success,
      animation: loading ? 'skPulse 1s infinite' : 'none',
      boxShadow: `0 0 6px ${loading ? T.warning : T.success}`,
    }} title={loading ? 'Chargement…' : 'Données à jour'} />
  );
}
