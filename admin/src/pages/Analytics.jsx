// Section Analytics — métriques de rétention, funnel, cohorts
import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { supabase } from '../lib/supabase';
import { T, fmtNum, CHART_COLORS } from '../lib/utils';
import { SectionHeader, KPICard, SkeletonCard } from '../components/ui';

function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: T.elevated, border:`1px solid ${T.border}`, borderRadius:8, padding:'8px 12px', fontSize:12 }}>
      <div style={{ color: T.muted, marginBottom:4 }}>{label}</div>
      {payload.map((p,i) => <div key={i} style={{ color:p.color||T.text, fontWeight:700 }}>{p.name}: {p.value}{p.unit||''}</div>)}
    </div>
  );
}

// Barre horizontale de funnel
function FunnelBar({ label, value, max, pct, color, drop }) {
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
        <span style={{ fontSize:13, color: T.text, fontWeight:600 }}>{label}</span>
        <span style={{ fontSize:13, color: T.text, fontWeight:700 }}>{fmtNum(value)} <span style={{ color: T.muted, fontWeight:400 }}>({pct}%)</span></span>
      </div>
      <div style={{ height:10, background: T.elevated, borderRadius:999, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${(value/max)*100}%`, background:color, borderRadius:999, transition:'width .6s ease' }} />
      </div>
      {drop !== undefined && <div style={{ fontSize:11, color: T.danger, marginTop:3 }}>↓ {drop}% de drop ici</div>}
    </div>
  );
}

export default function Analytics() {
  const [metrics,  setMetrics]  = useState(null);
  const [funnel,   setFunnel]   = useState(null);
  const [retention,setRetention]= useState(null);
  const [cohorts,  setCohorts]  = useState([]);
  const [loading,  setLoading]  = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);

    // Métriques de base
    const [
      { count: totalUsers },
      { count: totalCaps },
      { count: totalContribs },
      { data: capsWithPart },
    ] = await Promise.all([
      supabase.from('participants').select('*',{count:'exact',head:true}),
      supabase.from('capsules').select('*',{count:'exact',head:true}),
      supabase.from('contributions').select('*',{count:'exact',head:true}),
      supabase.from('capsules').select('id,participants(id),contributions(id)'),
    ]);

    const moyParticipants = capsWithPart?.length
      ? (capsWithPart.reduce((s,c)=>s+(c.participants?.length||0),0)/capsWithPart.length).toFixed(1)
      : 0;
    const moyContribs = capsWithPart?.length
      ? (capsWithPart.reduce((s,c)=>s+(c.contributions?.length||0),0)/capsWithPart.length).toFixed(1)
      : 0;
    const capsMult = capsWithPart?.filter(c=>(c.participants?.length||0)>=2).length||0;
    const tauxInvit = capsWithPart?.length ? Math.round((capsMult/capsWithPart.length)*100) : 0;

    setMetrics({ totalUsers, totalCaps, totalContribs, moyParticipants, moyContribs, tauxInvit });

    // Funnel de conversion
    const { count: avecCapsule }     = await supabase.from('participants').select('capsule_id',{count:'exact',head:true}).not('capsule_id','is',null);
    const { count: avecContrib }     = await supabase.from('participants').select('id',{count:'exact',head:true}).in('id',
      (await supabase.from('contributions').select('auteur_id').then(r=>[...new Set(r.data?.map(c=>c.auteur_id)||[])]))
    );

    const f = [
      { label:'Inscrits',        value: totalUsers||0 },
      { label:'Ont une capsule', value: avecCapsule||0 },
      { label:'Ont un souvenir', value: avecContrib||0 },
    ];
    setFunnel(f);

    // Données rétention (approximation : actifs J1/J7/J30)
    const now  = Date.now();
    const j1   = new Date(now - 86400000);
    const j7   = new Date(now - 7*86400000);
    const j30  = new Date(now - 30*86400000);

    const [{ count: actJ1 }, { count: actJ7 }, { count: actJ30 }] = await Promise.all([
      supabase.from('contributions').select('auteur_id',{count:'exact',head:true}).gte('created_at',j1.toISOString()),
      supabase.from('contributions').select('auteur_id',{count:'exact',head:true}).gte('created_at',j7.toISOString()),
      supabase.from('contributions').select('auteur_id',{count:'exact',head:true}).gte('created_at',j30.toISOString()),
    ]);
    setRetention([
      { label:'J1',  value: actJ1||0, pct: totalUsers ? Math.round(((actJ1||0)/totalUsers)*100):0 },
      { label:'J7',  value: actJ7||0, pct: totalUsers ? Math.round(((actJ7||0)/totalUsers)*100):0 },
      { label:'J30', value: actJ30||0,pct: totalUsers ? Math.round(((actJ30||0)/totalUsers)*100):0 },
    ]);

    // Cohorts — inscriptions des 8 dernières semaines
    const cohortData = [];
    for (let w = 7; w >= 0; w--) {
      const start = new Date(now - w*7*86400000 - 7*86400000);
      const end   = new Date(now - w*7*86400000);
      const { count } = await supabase.from('participants')
        .select('*',{count:'exact',head:true})
        .gte('created_at',start.toISOString())
        .lt('created_at',end.toISOString());
      cohortData.push({
        semaine: `S-${w===0?'0':w}`,
        inscriptions: count||0,
      });
    }
    setCohorts(cohortData);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const cardStyle = { background: T.card, borderRadius:16, padding:24, border:`1px solid ${T.border}` };

  return (
    <div>
      <SectionHeader title="Analytics avancés" subtitle="Rétention, funnel de conversion et cohortes" icon="◌">
        <button onClick={()=>{
          if (!metrics) return;
          const csv = ['Métrique,Valeur',
            `Utilisateurs,${metrics.totalUsers}`,
            `Capsules,${metrics.totalCaps}`,
            `Souvenirs,${metrics.totalContribs}`,
            `Moy. participants/capsule,${metrics.moyParticipants}`,
            `Taux d'invitation,${metrics.tauxInvit}%`,
          ].join('\n');
          const a=document.createElement('a'); a.href='data:text/csv,'+encodeURIComponent(csv); a.download='analytics.csv'; a.click();
        }}
          style={{ padding:'8px 14px', borderRadius:10, border:`1px solid ${T.border}`, background:'transparent', color:T.muted, cursor:'pointer', fontSize:12, fontFamily:T.ff_corps }}>
          ⬇ Exporter CSV
        </button>
      </SectionHeader>

      {/* KPIs clés */}
      <div style={{ display:'flex', gap:14, marginBottom:24, flexWrap:'wrap' }}>
        <KPICard icon="📊" label="Moy. capsules / utilisateur" value={metrics ? (metrics.totalCaps/(metrics.totalUsers||1)).toFixed(1) : '—'} loading={loading} help="Nombre moyen de capsules créées ou rejointes par utilisateur." />
        <KPICard icon="👥" label="Moy. participants / capsule" value={metrics?.moyParticipants??'—'} loading={loading} help="Nombre moyen de membres dans une capsule." />
        <KPICard icon="🖼️" label="Moy. souvenirs / capsule" value={metrics?.moyContribs??'—'} loading={loading} help="Nombre moyen de contributions par capsule." />
        <KPICard icon="🤝" label="Taux d'invitation" value={metrics?`${metrics.tauxInvit}%`:'—'} loading={loading} help="% de capsules avec au moins 2 participants (invitation réussie)." />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:24 }}>
        {/* Funnel */}
        <div style={cardStyle}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>Funnel de conversion</div>
          <div style={{ fontSize:12, color: T.muted, marginBottom:20 }}>De l'inscription à l'action</div>
          {loading ? <SkeletonCard rows={3} style={{ padding:0, border:'none', background:'none' }} /> : funnel && (
            funnel.map((step, i) => (
              <FunnelBar key={step.label}
                label={step.label}
                value={step.value}
                max={funnel[0]?.value || 1}
                pct={funnel[0]?.value ? Math.round((step.value/funnel[0].value)*100) : 0}
                color={CHART_COLORS[i]}
                drop={i>0 && funnel[0].value ? 100-Math.round((step.value/funnel[i-1].value)*100) : undefined}
              />
            ))
          )}
        </div>

        {/* Rétention */}
        <div style={cardStyle}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>Rétention des utilisateurs</div>
          <div style={{ fontSize:12, color: T.muted, marginBottom:20 }}>% d'actifs par fenêtre de temps</div>
          {loading ? <SkeletonCard rows={3} style={{ padding:0, border:'none', background:'none' }} /> : retention && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {retention.map((r,i) => (
                <div key={r.label}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                    <span style={{ fontSize:13, color: T.text }}>Actifs <strong>{r.label}</strong></span>
                    <span style={{ fontSize:13, fontWeight:700, color: i===0?T.success:i===1?T.a2:T.a3 }}>{r.pct}%</span>
                  </div>
                  <div style={{ height:8, background: T.elevated, borderRadius:999, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${r.pct}%`, background:[T.success,T.a2,T.a3][i], borderRadius:999 }} />
                  </div>
                  <div style={{ fontSize:11, color: T.muted, marginTop:3 }}>{fmtNum(r.value)} actions dans cette période</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cohortes */}
      <div style={cardStyle}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>Analyse de cohortes — inscriptions</div>
        <div style={{ fontSize:12, color: T.muted, marginBottom:20 }}>Nouvelles inscriptions par semaine (8 dernières semaines)</div>
        {loading ? <SkeletonCard rows={2} style={{ padding:0, border:'none', background:'none' }} /> : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={cohorts} margin={{top:5,right:20,left:-10,bottom:0}}>
              <XAxis dataKey="semaine" tick={{fill:T.muted,fontSize:11}} tickLine={false} axisLine={false} />
              <YAxis tick={{fill:T.muted,fontSize:10}} tickLine={false} axisLine={false} />
              <Tooltip content={<DarkTooltip />} />
              <Bar dataKey="inscriptions" name="Inscriptions" radius={[6,6,0,0]}>
                {cohorts.map((_,i) => <Cell key={i} fill={CHART_COLORS[i%CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
