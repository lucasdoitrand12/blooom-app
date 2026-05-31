// Section Capsules — tableau paginé, stats, fiche détaillée
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { T, fmtDate, fmtRelative, fmtNum, TYPES_CAPSULES, TYPES_CONTRIB, trunc } from '../lib/utils';
import { SectionHeader, SearchInput, Table, Pagination, SidePanel, Badge, Btn, ConfirmModal, SkeletonCard, Select, KPICard, HelpTooltip, Field } from '../components/ui';
import { useAdmin } from '../App';

const PAGE_SIZE = 50;

function TypeBadge({ type }) {
  const icon = TYPES_CAPSULES[type] || '📦';
  const colors = {
    naissance:'#4D7CFF', mariage:'#FF5C9D', anniv:'#FFC436', noel:'#22C7B8',
    evjf:'#9B5DE5', amis:'#00BBF9', libre:'#FF6B5E',
  };
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:999, fontSize:11, fontWeight:700, background:`${colors[type]||T.a3}18`, color: colors[type]||T.a3, border:`1px solid ${colors[type]||T.a3}30` }}>
      {icon} {type}
    </span>
  );
}

export default function Capsules() {
  const { logAction } = useAdmin();
  const [capsules,   setCapsules]   = useState([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [search,     setSearch]     = useState('');
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState(null);
  const [detail,     setDetail]     = useState(null);
  const [detailLoad, setDetailLoad] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [confirmOpen,   setConfirmOpen]   = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editDate, setEditDate] = useState('');
  const [editDateModal, setEditDateModal] = useState(false);
  const [stats, setStats] = useState(null);

  const fetchCapsules = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('capsules')
      .select('id,nom,type,ouverte,date_ouverture,created_at,couverture,code', { count:'exact' })
      .order('created_at', { ascending:false })
      .range((page-1)*PAGE_SIZE, page*PAGE_SIZE-1);

    if (search) q = q.ilike('nom', `%${search}%`);
    if (filterType) q = q.eq('type', filterType);
    if (filterStatus === 'ouverte') q = q.eq('ouverte', true);
    if (filterStatus === 'scellée') q = q.eq('ouverte', false);

    const [{ data, count }, { data: allCaps }] = await Promise.all([
      q,
      supabase.from('capsules').select('id,ouverte,contributions(id),participants(id)'),
    ]);

    setCapsules(data || []);
    setTotal(count || 0);

    // Calcul des stats globales
    if (allCaps?.length) {
      const sorted = [...allCaps].sort((a,b) => (b.contributions?.length||0)-(a.contributions?.length||0));
      const sortedPart = [...allCaps].sort((a,b) => (b.participants?.length||0)-(a.participants?.length||0));
      const totalPart = allCaps.reduce((s,c) => s+(c.participants?.length||0), 0);
      setStats({
        plusRemplie: sorted[0],
        plusParticipants: sortedPart[0],
        moyParticipants: allCaps.length ? (totalPart/allCaps.length).toFixed(1) : 0,
      });
    }
    setLoading(false);
  }, [page, search, filterType, filterStatus]);

  useEffect(() => { fetchCapsules(); }, [fetchCapsules]);

  async function openDetail(capsule) {
    setSelected(capsule);
    setDetailLoad(true);
    const [{ data: participants }, { data: contributions }] = await Promise.all([
      supabase.from('participants').select('id,prenom,couleur,photo').eq('capsule_id', capsule.id),
      supabase.from('contributions').select('id,type,texte,media,created_at,auteur_id').eq('capsule_id', capsule.id).order('created_at'),
    ]);
    setDetail({ participants, contributions });
    setEditDate(capsule.date_ouverture?.slice(0,10) || '');
    setDetailLoad(false);
  }

  async function handleForceOpen() {
    await supabase.from('capsules').update({ ouverte: true }).eq('id', selected.id);
    await logAction('force_open_capsule', selected.id, { nom: selected.nom });
    setConfirmOpen(false);
    fetchCapsules();
    alert(`Capsule "${selected.nom}" ouverte de force.`);
  }

  async function handleDelete() {
    await supabase.from('capsules').delete().eq('id', selected.id);
    await logAction('delete_capsule', selected.id, { nom: selected.nom });
    setConfirmDelete(false);
    setSelected(null);
    fetchCapsules();
  }

  async function handleEditDate() {
    await supabase.from('capsules').update({ date_ouverture: editDate }).eq('id', selected.id);
    await logAction('edit_capsule_date', selected.id, { nom: selected.nom, newDate: editDate });
    setEditDateModal(false);
    setCapsules(prev => prev.map(c => c.id===selected.id ? {...c, date_ouverture:editDate} : c));
    alert('Date d\'ouverture modifiée.');
  }

  const typesOptions = Object.entries(TYPES_CAPSULES).map(([v,icon])=>({value:v,label:`${icon} ${v}`}));

  const columns = [
    { key:'couverture', label:'', render:(v,row) => (
      v ? <img src={v} alt="" style={{ width:40, height:40, borderRadius:8, objectFit:'cover' }} />
        : <div style={{ width:40, height:40, borderRadius:8, background: T.elevated, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>{TYPES_CAPSULES[row.type]||'📦'}</div>
    )},
    { key:'nom', label:'Nom', render:v => <span style={{ fontWeight:600 }}>{v||'Sans titre'}</span>, maxW:180 },
    { key:'type', label:'Type', render:v => <TypeBadge type={v} /> },
    { key:'created_at', label:'Créée le', render:v => fmtDate(v) },
    { key:'date_ouverture', label:'Ouverture', render:v => fmtDate(v) },
    { key:'ouverte', label:'Statut', render:v => <Badge label={v?'Ouverte':'Scellée'} color={v?'success':'info'} /> },
    { key:'id', label:'', render:(_,row) => <Btn size='sm' variant='ghost' onClick={e=>{e.stopPropagation();openDetail(row);}}>Voir →</Btn> },
  ];

  return (
    <div>
      <SectionHeader title="Capsules" subtitle={`${fmtNum(total)} capsules au total`} icon="◈">
        <Select value={filterType} onChange={v=>{setFilterType(v);setPage(1);}} options={typesOptions} placeholder="Tous types" />
        <Select value={filterStatus} onChange={v=>{setFilterStatus(v);setPage(1);}} options={[{value:'ouverte',label:'Ouvertes'},{value:'scellée',label:'Scellées'}]} placeholder="Tous statuts" />
        <SearchInput value={search} onChange={v=>{setSearch(v);setPage(1);}} placeholder="Rechercher une capsule…" />
      </SectionHeader>

      {/* Stats rapides */}
      <div style={{ display:'flex', gap:14, marginBottom:24, flexWrap:'wrap' }}>
        <KPICard icon="🏆" label="Capsule la plus remplie" value={stats?.plusRemplie?.nom ? trunc(stats.plusRemplie.nom,18) : '—'}
          help="La capsule avec le plus de souvenirs déposés." loading={loading} />
        <KPICard icon="👥" label="Plus de participants" value={stats?.plusParticipants?.nom ? trunc(stats.plusParticipants.nom,18) : '—'}
          help="La capsule qui rassemble le plus de participants." loading={loading} />
        <KPICard icon="📊" label="Moy. participants / capsule" value={stats?.moyParticipants ?? '—'}
          help="Nombre moyen de participants par capsule." loading={loading} />
      </div>

      <Table columns={columns} data={capsules} loading={loading} onRowClick={openDetail} emptyMsg="Aucune capsule trouvée" />
      <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />

      {/* Panneau détail */}
      <SidePanel open={!!selected} onClose={()=>{setSelected(null);setDetail(null);}} title={selected?.nom||'Détail capsule'}>
        {selected && (
          <div>
            {/* Couverture */}
            {selected.couverture
              ? <img src={selected.couverture} alt="" style={{ width:'100%', height:140, objectFit:'cover', borderRadius:12, marginBottom:16 }} />
              : <div style={{ width:'100%', height:100, borderRadius:12, background: T.card, display:'flex', alignItems:'center', justifyContent:'center', fontSize:48, marginBottom:16 }}>{TYPES_CAPSULES[selected.type]||'📦'}</div>
            }

            <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:16 }}>
              <TypeBadge type={selected.type} />
              <Badge label={selected.ouverte?'Ouverte':'Scellée'} color={selected.ouverte?'success':'info'} />
            </div>

            <div style={{ marginBottom:16, fontSize:12, color: T.muted, lineHeight:1.8 }}>
              <div>Créée le <strong style={{color:T.text}}>{fmtDate(selected.created_at)}</strong></div>
              <div>Ouverture le <strong style={{color:T.text}}>{fmtDate(selected.date_ouverture)}</strong></div>
              <div>Code de partage : <strong style={{color:T.a2,fontFamily:'monospace'}}>{selected.code}</strong></div>
            </div>

            {detailLoad ? <SkeletonCard rows={4} /> : detail && (
              <>
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, fontWeight:700, color: T.muted, letterSpacing:.8, marginBottom:8 }}>PARTICIPANTS ({detail.participants?.length||0})</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                    {detail.participants?.map(p => (
                      <div key={p.id} style={{ display:'flex', alignItems:'center', gap:6, background: T.card, borderRadius:8, padding:'5px 10px', fontSize:12 }}>
                        <div style={{ width:20, height:20, borderRadius:'50%', background:p.couleur||T.a2, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#fff' }}>
                          {(p.prenom||'?').charAt(0).toUpperCase()}
                        </div>
                        {p.prenom||'Inconnu'}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom:20 }}>
                  <div style={{ fontSize:11, fontWeight:700, color: T.muted, letterSpacing:.8, marginBottom:8 }}>SOUVENIRS ({detail.contributions?.length||0})</div>
                  {detail.contributions?.slice(0,8).map(c => (
                    <div key={c.id} style={{ padding:'7px 0', borderBottom:`1px solid ${T.border}30`, fontSize:12, color: T.muted }}>
                      {TYPES_CONTRIB[c.type]||'🖼️'} {c.type} · {fmtDate(c.created_at)} · {trunc(c.texte||'',40)}
                    </div>
                  ))}
                  {(detail.contributions?.length||0) > 8 && <div style={{ color: T.muted, fontSize:11, marginTop:6 }}>+{detail.contributions.length-8} autres souvenirs</div>}
                </div>
              </>
            )}

            {/* Actions */}
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {!selected.ouverte && <Btn onClick={()=>setConfirmOpen(true)} variant='primary'>🔓 Forcer l'ouverture</Btn>}
              <Btn onClick={()=>setEditDateModal(true)} variant='ghost'>📅 Modifier la date d'ouverture</Btn>
              <Btn onClick={()=>setConfirmDelete(true)} variant='danger'>🗑 Supprimer la capsule</Btn>
            </div>

            {/* Modale édition date */}
            {editDateModal && (
              <div style={{ marginTop:16, padding:16, background: T.card, borderRadius:12, border:`1px solid ${T.border}` }}>
                <Field label="Nouvelle date d'ouverture" value={editDate} onChange={setEditDate} type="date" />
                <div style={{ display:'flex', gap:8 }}>
                  <Btn onClick={handleEditDate} size='sm'>Sauvegarder</Btn>
                  <Btn onClick={()=>setEditDateModal(false)} variant='ghost' size='sm'>Annuler</Btn>
                </div>
              </div>
            )}
          </div>
        )}
      </SidePanel>

      <ConfirmModal open={confirmOpen} title="Forcer l'ouverture ?" danger={false}
        message={`La capsule "${selected?.nom}" sera immédiatement accessible à tous ses participants.`}
        onConfirm={handleForceOpen} onCancel={()=>setConfirmOpen(false)} />
      <ConfirmModal open={confirmDelete} title="Supprimer cette capsule ?" danger={true}
        message={`La capsule "${selected?.nom}" et tous ses souvenirs seront définitivement supprimés.`}
        onConfirm={handleDelete} onCancel={()=>setConfirmDelete(false)} />
    </div>
  );
}
