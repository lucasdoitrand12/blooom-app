// Section Souvenirs — tous les souvenirs, stats, modération
import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { supabase } from '../lib/supabase';
import { T, fmtDate, fmtNum, TYPES_CONTRIB, countByField, trunc, CHART_COLORS } from '../lib/utils';
import { SectionHeader, SearchInput, Table, Pagination, Badge, Btn, Select, ConfirmModal, SkeletonCard } from '../components/ui';
import { useAdmin } from '../App';

const PAGE_SIZE = 50;

function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: T.elevated, border:`1px solid ${T.border}`, borderRadius:8, padding:'8px 12px', fontSize:12 }}>
      <div style={{ color: T.muted }}>{label}</div>
      {payload.map((p,i) => <div key={i} style={{ color:p.color, fontWeight:700 }}>{fmtNum(p.value)}</div>)}
    </div>
  );
}

export default function Souvenirs() {
  const { logAction } = useAdmin();
  const [souvenirs,  setSouvenirs]  = useState([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [search,     setSearch]     = useState('');
  const [filterType, setFilterType] = useState('');
  const [loading,    setLoading]    = useState(true);
  const [stats,      setStats]      = useState(null);
  const [signales,   setSignales]   = useState([]);
  const [onglet,     setOnglet]     = useState('tous'); // tous | signalés
  const [confirmDel, setConfirmDel] = useState(false);
  const [toDelete,   setToDelete]   = useState(null);

  const fetchSouvenirs = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('contributions')
      .select('id,type,texte,media,created_at,capsule_id,auteur_id,capsules(nom),participants!contributions_auteur_id_fkey(prenom)', { count:'exact' })
      .order('created_at', { ascending:false })
      .range((page-1)*PAGE_SIZE, page*PAGE_SIZE-1);

    if (filterType) q = q.eq('type', filterType);
    const { data, count } = await q;
    setSouvenirs(data || []);
    setTotal(count || 0);
    setLoading(false);
  }, [page, filterType]);

  const fetchStats = useCallback(async () => {
    const { data: allContribs } = await supabase.from('contributions').select('type,reactions');
    if (!allContribs) return;
    const parType = countByField(allContribs, 'type');
    const totalC  = allContribs.length || 1;
    const withPct = parType.map((d,i) => ({
      ...d,
      pct: Math.round((d.value/totalC)*100),
      fill: CHART_COLORS[i%CHART_COLORS.length],
    }));
    setStats({ parType: withPct, total: allContribs.length });
  }, []);

  const fetchSignales = useCallback(async () => {
    // Les signalements sont stockés dans admin_logs avec action='signalement'
    const { data } = await supabase.from('admin_logs')
      .select('id,cible,details,created_at')
      .eq('action','signalement')
      .order('created_at',{ascending:false})
      .limit(50);
    setSignales(data||[]);
  }, []);

  useEffect(() => { fetchSouvenirs(); }, [fetchSouvenirs]);
  useEffect(() => { fetchStats(); fetchSignales(); }, [fetchStats, fetchSignales]);

  async function handleDelete() {
    await supabase.from('contributions').delete().eq('id', toDelete.id);
    await logAction('delete_contribution', toDelete.id, { type: toDelete.type });
    setConfirmDel(false);
    setToDelete(null);
    fetchSouvenirs();
  }

  async function handleSignaler(row) {
    await logAction('signalement', row.id, { type: row.type, capsule: row.capsules?.nom });
    alert('Contenu signalé et ajouté à la file de modération.');
    fetchSignales();
  }

  async function ignorerSignalement(sig) {
    await supabase.from('admin_logs').delete().eq('id', sig.id);
    fetchSignales();
  }

  const typesOptions = Object.entries(TYPES_CONTRIB).map(([v,icon])=>({value:v,label:`${icon} ${v}`}));

  const columns = [
    { key:'type', label:'Type', render:v => (
      <span style={{ fontSize:18 }} title={v}>{TYPES_CONTRIB[v]||'🖼️'}</span>
    )},
    { key:'participants', label:'Auteur', render:(v,row) => (
      <span style={{ fontWeight:600 }}>{row.participants?.prenom||'Inconnu'}</span>
    )},
    { key:'capsules', label:'Capsule', render:v => <span style={{ color: T.muted }}>{v?.nom||'—'}</span>, maxW:160 },
    { key:'created_at', label:'Date', render:v => fmtDate(v) },
    { key:'texte', label:'Aperçu', render:(v,row) => (
      row.media
        ? (row.type==='photo'||row.type==='dessin')
          ? <img src={row.media} alt="" style={{ width:36, height:36, borderRadius:6, objectFit:'cover' }} />
          : <span style={{ color: T.muted, fontSize:11 }}>[média]</span>
        : <span style={{ color: T.muted, fontSize:12 }}>{trunc(v,50)}</span>
    ), maxW:200 },
    { key:'id', label:'', render:(_,row) => (
      <div style={{ display:'flex', gap:6 }}>
        <Btn size='sm' variant='ghost' onClick={e=>{e.stopPropagation();handleSignaler(row);}}>🚩</Btn>
        <Btn size='sm' variant='danger' onClick={e=>{e.stopPropagation();setToDelete(row);setConfirmDel(true);}}>🗑</Btn>
      </div>
    )},
  ];

  const sigColumns = [
    { key:'cible', label:'ID souvenir', render:v => <span style={{fontFamily:'monospace',fontSize:11}}>{v?.slice(0,8)}…</span> },
    { key:'details', label:'Info', render:v => { try { const d=JSON.parse(v); return `${d.type||''} · ${d.capsule||''}`; } catch { return '—'; } } },
    { key:'created_at', label:'Signalé le', render:v => fmtDate(v) },
    { key:'id', label:'', render:(_,sig) => (
      <div style={{ display:'flex', gap:6 }}>
        <Btn size='sm' variant='danger' onClick={()=>{const id=JSON.parse(sig.details||'{}').id||sig.cible; setToDelete({id,type:'?'});setConfirmDel(true);}}>Supprimer</Btn>
        <Btn size='sm' variant='ghost' onClick={()=>ignorerSignalement(sig)}>Ignorer</Btn>
      </div>
    )},
  ];

  return (
    <div>
      <SectionHeader title="Souvenirs" subtitle={`${fmtNum(total)} contributions au total`} icon="◻">
        <div style={{ display:'flex', gap:4 }}>
          {['tous','signalés'].map(o => (
            <button key={o} onClick={()=>setOnglet(o)}
              style={{ padding:'7px 14px', borderRadius:8, border:`1px solid ${onglet===o?T.a2:T.border}`, background: onglet===o?`${T.a2}15`:'transparent', color:onglet===o?T.a2:T.muted, cursor:'pointer', fontSize:12, fontFamily:T.ff_corps, fontWeight:600, position:'relative' }}>
              {o.charAt(0).toUpperCase()+o.slice(1)}
              {o==='signalés' && signales.length>0 && <span style={{ position:'absolute', top:-4, right:-4, width:14, height:14, borderRadius:'50%', background:T.danger, fontSize:8, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>{signales.length}</span>}
            </button>
          ))}
        </div>
        <Select value={filterType} onChange={v=>{setFilterType(v);setPage(1);}} options={typesOptions} placeholder="Tous types" />
        <SearchInput value={search} onChange={v=>{setSearch(v);setPage(1);}} placeholder="Rechercher…" />
      </SectionHeader>

      {/* Statistiques répartition */}
      {onglet === 'tous' && (
        <>
          <div style={{ background: T.card, borderRadius:16, padding:24, border:`1px solid ${T.border}`, marginBottom:24 }}>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:16, color: T.text }}>Répartition par type</div>
            {!stats ? <SkeletonCard rows={2} style={{ padding:0, border:'none', background:'none' }} /> : (
              <div style={{ display:'flex', gap:24, alignItems:'center' }}>
                <ResponsiveContainer width="50%" height={160}>
                  <BarChart data={stats.parType} layout="vertical" margin={{left:10,right:20}}>
                    <XAxis type="number" tick={{fill:T.muted,fontSize:10}} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" tick={{fill:T.text,fontSize:11}} tickLine={false} axisLine={false} width={100} />
                    <Tooltip content={<DarkTooltip />} />
                    <Bar dataKey="value" name="Souvenirs" radius={[0,6,6,0]}>
                      {stats.parType.map((d,i) => <Cell key={i} fill={d.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ flex:1 }}>
                  {stats.parType.map(d => (
                    <div key={d.name} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                      <div style={{ width:8, height:8, borderRadius:'50%', background:d.fill, flexShrink:0 }} />
                      <span style={{ fontSize:12, color: T.text, flex:1 }}>{d.name}</span>
                      <span style={{ fontSize:12, fontWeight:700, color: T.text }}>{fmtNum(d.value)}</span>
                      <span style={{ fontSize:11, color: T.muted, width:36, textAlign:'right' }}>{d.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Table columns={columns} data={souvenirs} loading={loading} emptyMsg="Aucun souvenir trouvé" />
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
        </>
      )}

      {onglet === 'signalés' && (
        <div>
          <div style={{ marginBottom:16, fontSize:13, color: T.muted }}>
            {signales.length} contenu{signales.length!==1?'s':''} signalé{signales.length!==1?'s':''} en attente de modération
          </div>
          <Table columns={sigColumns} data={signales} loading={false} emptyMsg="Aucun signalement en attente 🎉" />
        </div>
      )}

      <ConfirmModal open={confirmDel} title="Supprimer ce souvenir ?" danger={true}
        message="Ce souvenir sera définitivement supprimé de la capsule. Cette action est irréversible."
        onConfirm={handleDelete} onCancel={()=>{setConfirmDel(false);setToDelete(null);}} />
    </div>
  );
}
