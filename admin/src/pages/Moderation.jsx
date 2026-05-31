// Section Modération — file de signalements et historique des actions
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { T, fmtDate, fmtRelative, trunc, TYPES_CONTRIB } from '../lib/utils';
import { SectionHeader, Table, Badge, Btn, ConfirmModal, SkeletonCard } from '../components/ui';
import { useAdmin } from '../App';

const TABS = ['File d\'attente', 'Historique'];

export default function Moderation() {
  const { user, logAction } = useAdmin();
  const [tab,       setTab]      = useState(0);
  const [signales,  setSignales] = useState([]);
  const [historique,setHistorique]= useState([]);
  const [loading,   setLoading]  = useState(true);
  const [confirmDel,setConfirmDel]= useState(false);
  const [toAct,     setToAct]    = useState(null);
  const [actionType,setActionType]= useState('');

  const fetchSignales = useCallback(async () => {
    setLoading(true);
    // Les signalements = logs avec action='signalement' sans résolution
    const { data } = await supabase.from('admin_logs')
      .select('id,cible,details,created_at,admin_id')
      .eq('action','signalement')
      .order('created_at',{ascending:false});
    setSignales(data||[]);
    setLoading(false);
  }, []);

  const fetchHistorique = useCallback(async () => {
    const { data } = await supabase.from('admin_logs')
      .select('id,action,cible,details,created_at,admin_id,admins(email)')
      .in('action',['delete_contribution','warn_user','suspend_user','ignore_signalement','delete_capsule'])
      .order('created_at',{ascending:false})
      .limit(100);
    setHistorique(data||[]);
  }, []);

  useEffect(() => { fetchSignales(); fetchHistorique(); }, [fetchSignales, fetchHistorique]);

  async function handleAction(sig, action) {
    const details = JSON.parse(sig.details||'{}');
    if (action === 'delete') {
      // Supprime le souvenir signalé
      await supabase.from('contributions').delete().eq('id', sig.cible);
      await logAction('delete_contribution', sig.cible, { via:'moderation', ...details });
    } else if (action === 'warn') {
      await logAction('warn_user', details.auteur_id || sig.cible, { via:'moderation', ...details });
      alert('Avertissement enregistré (email via Edge Function en prod).');
    } else if (action === 'suspend') {
      await logAction('suspend_user', details.auteur_id || sig.cible, { via:'moderation', ...details });
      alert('Suspension enregistrée (Edge Function en prod).');
    }
    // Dans tous les cas, retirer le signalement de la file
    await supabase.from('admin_logs').delete().eq('id', sig.id);
    await logAction('ignore_signalement', sig.id, { originalAction: action });
    fetchSignales();
    fetchHistorique();
    setConfirmDel(false);
    setToAct(null);
  }

  async function ignorerSignalement(sig) {
    await supabase.from('admin_logs').delete().eq('id', sig.id);
    await logAction('ignore_signalement', sig.id);
    fetchSignales();
    fetchHistorique();
  }

  function parseDetails(raw) {
    try { return JSON.parse(raw||'{}'); } catch { return {}; }
  }

  const sigColumns = [
    { key:'created_at', label:'Signalé', render:v => fmtRelative(v) },
    { key:'details', label:'Contenu', render:(v,row) => {
      const d = parseDetails(v);
      return (
        <div>
          <span style={{ fontSize:16 }}>{TYPES_CONTRIB[d.type]||'🖼️'}</span>
          <span style={{ marginLeft:6, fontSize:12, color: T.muted }}>{d.type||'—'} · {d.capsule||'capsule inconnue'}</span>
        </div>
      );
    }},
    { key:'cible', label:'ID', render:v => <span style={{ fontFamily:'monospace', fontSize:10, color: T.muted }}>{v?.slice(0,12)||'—'}…</span> },
    { key:'id', label:'Actions', render:(_,sig) => (
      <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
        <Btn size='sm' variant='danger' onClick={()=>{setToAct({sig,action:'delete'});setConfirmDel(true);}}>🗑 Supprimer</Btn>
        <Btn size='sm' variant='ghost' style={{ color: T.warning, borderColor: T.warning+'60' }} onClick={()=>handleAction(sig,'warn')}>⚠️ Avertir</Btn>
        <Btn size='sm' variant='ghost' style={{ color: T.danger, borderColor: T.danger+'40' }} onClick={()=>handleAction(sig,'suspend')}>🔒 Suspendre</Btn>
        <Btn size='sm' variant='ghost' onClick={()=>ignorerSignalement(sig)}>Ignorer</Btn>
      </div>
    )},
  ];

  const ACTION_LABELS = {
    delete_contribution:'Souvenir supprimé', warn_user:'Utilisateur averti',
    suspend_user:'Compte suspendu', ignore_signalement:'Signalement ignoré',
    delete_capsule:'Capsule supprimée',
  };

  const histoColumns = [
    { key:'created_at', label:'Date', render:v => fmtDate(v) },
    { key:'action', label:'Action', render:v => (
      <Badge label={ACTION_LABELS[v]||v} color={v.includes('delete')||v.includes('suspend')?'danger':v.includes('warn')?'warning':'muted'} />
    )},
    { key:'admins', label:'Par', render:v => <span style={{ fontSize:12, color: T.muted }}>{v?.email||'—'}</span> },
    { key:'cible', label:'Cible', render:v => <span style={{ fontFamily:'monospace', fontSize:10, color: T.muted }}>{v?.slice(0,12)||'—'}…</span> },
    { key:'details', label:'Détails', render:v => {
      const d = parseDetails(v);
      return <span style={{ fontSize:11, color: T.muted }}>{d.type||''} {d.capsule||''} {d.via ? `(via ${d.via})`:''}</span>;
    }},
  ];

  return (
    <div>
      <SectionHeader title="Modération" subtitle="Gestion des signalements et historique des actions" icon="◉">
        {signales.length > 0 && (
          <span style={{ padding:'4px 10px', borderRadius:999, background:`${T.danger}20`, color:T.danger, fontSize:12, fontWeight:700 }}>
            {signales.length} en attente
          </span>
        )}
      </SectionHeader>

      {/* Onglets */}
      <div style={{ display:'flex', gap:4, marginBottom:24, borderBottom:`1px solid ${T.border}` }}>
        {TABS.map((t,i) => (
          <button key={i} onClick={()=>setTab(i)}
            style={{ padding:'9px 18px', borderRadius:'8px 8px 0 0', border:'none', background: tab===i?T.card:'transparent', color:tab===i?T.a2:T.muted, cursor:'pointer', fontSize:13, fontWeight:tab===i?700:500, fontFamily:T.ff_corps, position:'relative', borderBottom:tab===i?`2px solid ${T.a2}`:'none' }}>
            {t}
            {i===0 && signales.length>0 && (
              <span style={{ position:'absolute', top:4, right:4, width:14, height:14, borderRadius:'50%', background:T.danger, fontSize:8, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>
                {signales.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 0 && (
        loading ? <SkeletonCard rows={5} /> : (
          <>
            {signales.length === 0 && (
              <div style={{ background: T.card, borderRadius:16, padding:'48px 24px', textAlign:'center', border:`1px solid ${T.border}` }}>
                <div style={{ fontSize:48, marginBottom:12 }}>🎉</div>
                <div style={{ fontWeight:700, fontSize:16, color: T.text, marginBottom:6 }}>Aucun signalement en attente</div>
                <div style={{ fontSize:13, color: T.muted }}>La communauté Blooom est au top !</div>
              </div>
            )}
            {signales.length > 0 && (
              <Table columns={sigColumns} data={signales} loading={false} emptyMsg="Aucun signalement" />
            )}
          </>
        )
      )}

      {tab === 1 && (
        <Table columns={histoColumns} data={historique} loading={loading} emptyMsg="Aucune action de modération enregistrée" />
      )}

      <ConfirmModal open={confirmDel}
        title="Supprimer ce contenu ?"
        danger={true}
        message="Le souvenir sera définitivement supprimé et le signalement retiré de la file."
        onConfirm={() => toAct && handleAction(toAct.sig, toAct.action)}
        onCancel={() => { setConfirmDel(false); setToAct(null); }} />
    </div>
  );
}
