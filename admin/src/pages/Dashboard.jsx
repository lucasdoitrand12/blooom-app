// Tableau de bord — vue d'ensemble en temps réel de la santé de Blooom
// Rafraîchissement automatique toutes les 30 secondes
import React, { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { supabase } from '../lib/supabase';
import { T, CHART_COLORS, TYPES_CAPSULES, TYPES_CONTRIB, bucketByDay, countByField, fmtNum, fmtRelative } from '../lib/utils';
import { KPICard, SectionHeader, SkeletonCard, RefreshDot } from '../components/ui';

// Tooltip personnalisé pour Recharts (adapté au fond sombre)
function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: T.elevated, border:`1px solid ${T.border}`, borderRadius:10, padding:'8px 12px', fontSize:12 }}>
      <div style={{ color: T.muted, marginBottom:4 }}>{label}</div>
      {payload.map((p,i) => (
        <div key={i} style={{ color: p.color, fontWeight:700 }}>{p.name}: {fmtNum(p.value)}</div>
      ))}
    </div>
  );
}

// Entrée du flux temps réel (inscriptions, souvenirs, capsules)
function FeedItem({ icon, primary, secondary, time }) {
  return (
    <div style={{ display:'flex', gap:10, padding:'10px 0', borderBottom:`1px solid ${T.border}30` }}>
      <span style={{ fontSize:20, flexShrink:0 }}>{icon}</span>
      <div style={{ flex:1, overflow:'hidden' }}>
        <div style={{ fontSize:12, fontWeight:600, color: T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{primary}</div>
        <div style={{ fontSize:11, color: T.muted, marginTop:1 }}>{secondary}</div>
      </div>
      <div style={{ fontSize:10, color: T.muted, whiteSpace:'nowrap', alignSelf:'flex-start', marginTop:2 }}>{time}</div>
    </div>
  );
}

export default function Dashboard() {
  const [kpis,     setKpis]     = useState(null);
  const [charts,   setCharts]   = useState(null);
  const [feed,     setFeed]     = useState({ users:[], contributions:[], capsules:[] });
  const [loading,  setLoading]  = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async (quiet=false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);

    // Dates de référence
    const now    = new Date();
    const today  = new Date(now); today.setHours(0,0,0,0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate()-1);
    const moisDebut = new Date(now.getFullYear(), now.getMonth(), 1);
    const il30j  = new Date(now.getTime() - 30*86400000);
    const il7j   = new Date(now.getTime() -  7*86400000);

    // Récupération parallèle de toutes les données
    const [
      { count: totalUsers },
      { count: totalCapsules },
      { count: totalContribs },
      { count: totalParticipants },
      { count: capsulesOuvertes },
      { count: inscriptionsToday },
      { count: inscriptionsYesterday },
      { count: contribsToday },
      { count: contribsYesterday },
      { data: recent30Participants },
      { data: recent30Capsules },
      { data: recent30Contribs },
      { data: typesCapsules },
      { data: typesContribs },
    ] = await Promise.all([
      supabase.from('participants').select('*', {count:'exact',head:true}),
      supabase.from('capsules').select('*', {count:'exact',head:true}),
      supabase.from('contributions').select('*', {count:'exact',head:true}),
      supabase.from('participants').select('*', {count:'exact',head:true}),
      supabase.from('capsules').select('*', {count:'exact',head:true}).eq('ouverte',true).gte('updated_at', moisDebut.toISOString()),
      supabase.from('participants').select('*', {count:'exact',head:true}).gte('created_at', today.toISOString()),
      supabase.from('participants').select('*', {count:'exact',head:true}).gte('created_at', yesterday.toISOString()).lt('created_at', today.toISOString()),
      supabase.from('contributions').select('*', {count:'exact',head:true}).gte('created_at', today.toISOString()),
      supabase.from('contributions').select('*', {count:'exact',head:true}).gte('created_at', yesterday.toISOString()).lt('created_at', today.toISOString()),
      supabase.from('participants').select('created_at').gte('created_at', il30j.toISOString()),
      supabase.from('capsules').select('created_at').gte('created_at', il30j.toISOString()),
      supabase.from('contributions').select('created_at').gte('created_at', il30j.toISOString()),
      supabase.from('capsules').select('type'),
      supabase.from('contributions').select('type'),
    ]);

    setKpis({
      totalUsers: totalUsers || 0,
      totalCapsules: totalCapsules || 0,
      totalContribs: totalContribs || 0,
      capsulesOuvertes: capsulesOuvertes || 0,
      inscriptionsToday: inscriptionsToday || 0,
      deltaInscriptions: inscriptionsYesterday > 0 ? Math.round(((inscriptionsToday-inscriptionsYesterday)/inscriptionsYesterday)*100) : null,
      deltaContribs: contribsYesterday > 0 ? Math.round(((contribsToday-contribsYesterday)/contribsYesterday)*100) : null,
    });

    setCharts({
      inscriptions: bucketByDay(recent30Participants || []),
      capsules30j:  bucketByDay(recent30Capsules || []),
      contribs30j:  bucketByDay(recent30Contribs || []),
      typesCapsules: countByField(typesCapsules || [], 'type').slice(0,8).map(d => ({
        ...d, name: (TYPES_CAPSULES[d.name] || '') + ' ' + d.name,
      })),
      typesContribs: countByField(typesContribs || [], 'type').map(d => ({
        ...d, name: (TYPES_CONTRIB[d.name] || '') + ' ' + d.name,
      })),
    });

    // Flux temps réel : dernières inscriptions + contributions + capsules
    const [{ data: dernPartic }, { data: dernContrib }, { data: dernCaps }] = await Promise.all([
      supabase.from('participants').select('id,prenom,created_at').order('created_at',{ascending:false}).limit(10),
      supabase.from('contributions').select('id,type,capsule_id,created_at,capsules(nom)').order('created_at',{ascending:false}).limit(10),
      supabase.from('capsules').select('id,nom,type,created_at,participants(id)').order('created_at',{ascending:false}).limit(5),
    ]);

    setFeed({ users: dernPartic||[], contributions: dernContrib||[], capsules: dernCaps||[] });
    setLoading(false);
    setRefreshing(false);
  }, []);

  // Chargement initial + rafraîchissement toutes les 30 secondes
  useEffect(() => {
    fetchAll();
    const interval = setInterval(() => fetchAll(true), 30000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // Flux temps réel via Supabase Realtime
  useEffect(() => {
    const ch = supabase.channel('admin-feed')
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'participants' }, payload => {
        setFeed(f => ({ ...f, users: [payload.new, ...f.users].slice(0,10) }));
        setKpis(k => k ? { ...k, inscriptionsToday: k.inscriptionsToday+1, totalUsers: k.totalUsers+1 } : k);
      })
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'contributions' }, payload => {
        setFeed(f => ({ ...f, contributions: [payload.new, ...f.contributions].slice(0,10) }));
        setKpis(k => k ? { ...k, totalContribs: k.totalContribs+1 } : k);
      })
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'capsules' }, payload => {
        setFeed(f => ({ ...f, capsules: [payload.new, ...f.capsules].slice(0,5) }));
        setKpis(k => k ? { ...k, totalCapsules: k.totalCapsules+1 } : k);
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  const cardStyle = { background: T.card, borderRadius:16, padding:24, border:`1px solid ${T.border}` };

  return (
    <div>
      <SectionHeader title="Tableau de bord" subtitle="Vue d'ensemble en temps réel · rafraîchissement automatique 30s" icon="▦">
        <RefreshDot loading={refreshing} />
        <button onClick={()=>fetchAll(true)} style={{ padding:'8px 14px', borderRadius:10, border:`1px solid ${T.border}`, background: 'transparent', color: T.muted, cursor:'pointer', fontSize:12, fontFamily: T.ff_corps }}>
          ↻ Rafraîchir
        </button>
      </SectionHeader>

      {/* ── Ligne KPI ── */}
      <div style={{ display:'flex', gap:14, marginBottom:24, flexWrap:'wrap' }}>
        <KPICard icon="👥" label="Utilisateurs inscrits"  value={fmtNum(kpis?.totalUsers)}       loading={loading}
          delta={kpis?.deltaInscriptions}
          help="Nombre total de profils participants créés dans toutes les capsules." />
        <KPICard icon="📦" label="Capsules créées"         value={fmtNum(kpis?.totalCapsules)}     loading={loading}
          help="Toutes les capsules, scellées et ouvertes confondues." />
        <KPICard icon="🖼️" label="Souvenirs déposés"       value={fmtNum(kpis?.totalContribs)}     loading={loading}
          delta={kpis?.deltaContribs}
          help="Nombre total de contributions (messages, photos, vidéos…) dans toutes les capsules." />
        <KPICard icon="🔓" label="Capsules ouvertes ce mois" value={fmtNum(kpis?.capsulesOuvertes)} loading={loading}
          help="Capsules dont le statut est passé à 'ouverte' depuis le 1er du mois." />
        <KPICard icon="✨" label="Inscriptions aujourd'hui"  value={fmtNum(kpis?.inscriptionsToday)} loading={loading}
          help="Nouvelles participations créées depuis minuit aujourd'hui." />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:20, marginBottom:24 }}>
        {/* Courbe inscriptions 30j */}
        <div style={cardStyle}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:16, color: T.text }}>Inscriptions — 30 derniers jours</div>
          {loading ? <SkeletonCard rows={1} style={{ padding:0, border:'none', background:'none' }} /> : (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={charts?.inscriptions || []} margin={{top:5,right:5,left:-20,bottom:0}}>
                <XAxis dataKey="date" tick={{fill:T.muted,fontSize:10}} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={{fill:T.muted,fontSize:10}} tickLine={false} axisLine={false} />
                <Tooltip content={<DarkTooltip />} />
                <Line type="monotone" dataKey="value" name="Inscriptions" stroke={T.a1} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Courbe capsules 30j */}
        <div style={cardStyle}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:16, color: T.text }}>Capsules créées — 30 derniers jours</div>
          {loading ? <SkeletonCard rows={1} style={{ padding:0, border:'none', background:'none' }} /> : (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={charts?.capsules30j || []} margin={{top:5,right:5,left:-20,bottom:0}}>
                <XAxis dataKey="date" tick={{fill:T.muted,fontSize:10}} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={{fill:T.muted,fontSize:10}} tickLine={false} axisLine={false} />
                <Tooltip content={<DarkTooltip />} />
                <Line type="monotone" dataKey="value" name="Capsules" stroke={T.a2} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Courbe souvenirs 30j */}
        <div style={cardStyle}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:16, color: T.text }}>Souvenirs déposés — 30 derniers jours</div>
          {loading ? <SkeletonCard rows={1} style={{ padding:0, border:'none', background:'none' }} /> : (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={charts?.contribs30j || []} margin={{top:5,right:5,left:-20,bottom:0}}>
                <XAxis dataKey="date" tick={{fill:T.muted,fontSize:10}} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={{fill:T.muted,fontSize:10}} tickLine={false} axisLine={false} />
                <Tooltip content={<DarkTooltip />} />
                <Line type="monotone" dataKey="value" name="Souvenirs" stroke={T.a3} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 340px', gap:20 }}>
        {/* Types de capsules */}
        <div style={cardStyle}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:16, color: T.text }}>Types de capsules les plus créés</div>
          {loading ? <SkeletonCard rows={4} style={{ padding:0, border:'none', background:'none' }} /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={charts?.typesCapsules || []} layout="vertical" margin={{top:0,right:20,left:10,bottom:0}}>
                <XAxis type="number" tick={{fill:T.muted,fontSize:10}} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{fill:T.text,fontSize:11}} tickLine={false} axisLine={false} width={120} />
                <Tooltip content={<DarkTooltip />} />
                <Bar dataKey="value" name="Capsules" radius={[0,6,6,0]}>
                  {(charts?.typesCapsules||[]).map((_,i) => <Cell key={i} fill={CHART_COLORS[i%CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Types de souvenirs (camembert) */}
        <div style={cardStyle}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:16, color: T.text }}>Répartition des types de souvenirs</div>
          {loading ? <SkeletonCard rows={2} style={{ padding:0, border:'none', background:'none' }} /> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={charts?.typesContribs||[]} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45}>
                  {(charts?.typesContribs||[]).map((_,i) => <Cell key={i} fill={CHART_COLORS[i%CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<DarkTooltip />} />
                <Legend formatter={v=><span style={{fontSize:11,color:T.muted}}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Flux temps réel */}
        <div style={{ ...cardStyle, display:'flex', flexDirection:'column', gap:0 }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:12, color: T.text, display:'flex', alignItems:'center', gap:8 }}>
            Flux temps réel
            <span style={{ width:7, height:7, borderRadius:'50%', background: T.success, display:'inline-block', boxShadow:`0 0 6px ${T.success}` }} />
          </div>

          <div style={{ fontSize:11, fontWeight:700, color: T.muted, letterSpacing:.8, marginBottom:6 }}>DERNIÈRES INSCRIPTIONS</div>
          {feed.users.slice(0,4).map(u => (
            <FeedItem key={u.id} icon="👤" primary={u.prenom || 'Nouveau participant'} secondary="" time={fmtRelative(u.created_at)} />
          ))}

          <div style={{ fontSize:11, fontWeight:700, color: T.muted, letterSpacing:.8, marginTop:12, marginBottom:6 }}>DERNIERS SOUVENIRS</div>
          {feed.contributions.slice(0,4).map(c => (
            <FeedItem key={c.id} icon={TYPES_CONTRIB[c.type]||'🖼️'} primary={`${c.type} dans ${c.capsules?.nom||'…'}`} secondary="" time={fmtRelative(c.created_at)} />
          ))}

          <div style={{ fontSize:11, fontWeight:700, color: T.muted, letterSpacing:.8, marginTop:12, marginBottom:6 }}>DERNIÈRES CAPSULES</div>
          {feed.capsules.slice(0,3).map(c => (
            <FeedItem key={c.id} icon={TYPES_CAPSULES[c.type]||'📦'} primary={c.nom||'Sans titre'} secondary={`${c.participants?.length||0} participant(s)`} time={fmtRelative(c.created_at)} />
          ))}
        </div>
      </div>
    </div>
  );
}
