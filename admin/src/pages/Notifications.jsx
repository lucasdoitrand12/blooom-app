// Section Notifications — tableau, statistiques, envoi manuel
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { T, fmtDate, fmtNum, trunc } from '../lib/utils';
import { SectionHeader, Table, Pagination, Badge, Btn, KPICard, Modal, Field, Select, SkeletonCard } from '../components/ui';
import { useAdmin } from '../App';

const PAGE_SIZE = 50;

export default function Notifications() {
  const { logAction } = useAdmin();
  const [notifs,     setNotifs]    = useState([]);
  const [total,      setTotal]     = useState(0);
  const [page,       setPage]      = useState(1);
  const [loading,    setLoading]   = useState(true);
  const [stats,      setStats]     = useState(null);
  const [sendModal,  setSendModal] = useState(false);
  const [sending,    setSending]   = useState(false);
  const [preview,    setPreview]   = useState(false);

  // Champs du formulaire d'envoi
  const [sendTexte,    setSendTexte]    = useState('');
  const [sendSegment,  setSendSegment]  = useState('tous');
  const [sendCible,    setSendCible]    = useState('detail');

  const fetchNotifs = useCallback(async () => {
    setLoading(true);
    const { data, count } = await supabase.from('notifications')
      .select('id,texte,lue,created_at,capsule_id,capsules(nom),participant_id,participants(prenom)', { count:'exact' })
      .order('created_at', { ascending:false })
      .range((page-1)*PAGE_SIZE, page*PAGE_SIZE-1);
    setNotifs(data||[]);
    setTotal(count||0);
    setLoading(false);
  }, [page]);

  const fetchStats = useCallback(async () => {
    const now   = new Date();
    const today = new Date(now); today.setHours(0,0,0,0);
    const weekAgo  = new Date(now.getTime() - 7*86400000);
    const monthAgo = new Date(now.getTime() - 30*86400000);

    const [
      { count: today_nb },
      { count: week_nb },
      { count: month_nb },
      { count: lues },
    ] = await Promise.all([
      supabase.from('notifications').select('*',{count:'exact',head:true}).gte('created_at', today.toISOString()),
      supabase.from('notifications').select('*',{count:'exact',head:true}).gte('created_at', weekAgo.toISOString()),
      supabase.from('notifications').select('*',{count:'exact',head:true}).gte('created_at', monthAgo.toISOString()),
      supabase.from('notifications').select('*',{count:'exact',head:true}).eq('lue',true),
    ]);

    const tauxLecture = total > 0 ? Math.round((lues/total)*100) : 0;
    setStats({ today: today_nb||0, week: week_nb||0, month: month_nb||0, tauxLecture });
  }, [total]);

  useEffect(() => { fetchNotifs(); }, [fetchNotifs]);
  useEffect(() => { if (total !== null) fetchStats(); }, [total, fetchStats]);

  async function handleSend() {
    if (!sendTexte) return;
    setSending(true);

    // Selon le segment, on récupère la liste des participant_id cibles
    let targets = [];
    if (sendSegment === 'tous') {
      const { data } = await supabase.from('participants').select('id').not('user_id','is',null);
      targets = data || [];
    } else if (sendSegment === 'bientot') {
      // Capsules qui s'ouvrent dans 30 jours
      const in30 = new Date(Date.now() + 30*86400000).toISOString();
      const { data } = await supabase.from('participants').select('id')
        .in('capsule_id', (await supabase.from('capsules').select('id').eq('ouverte',false).lte('date_ouverture',in30).then(r=>r.data?.map(c=>c.id)||[])));
      targets = data || [];
    }

    // Insertion par lots de 100 pour éviter les timeouts
    const batchSize = 100;
    for (let i = 0; i < targets.length; i += batchSize) {
      const batch = targets.slice(i, i+batchSize).map(p => ({
        participant_id: p.id,
        texte: sendTexte,
        cible_ecran: sendCible,
        lue: false,
      }));
      await supabase.from('notifications').insert(batch);
    }

    await logAction('send_notification', null, { segment: sendSegment, nb: targets.length, texte: sendTexte });

    // Déclenche aussi les push notifications via la Edge Function
    await supabase.functions.invoke('send-push', {
      body: {
        segment: sendSegment,
        title: 'Blooom 🌸',
        body: sendTexte,
        data: { cible: sendCible },
      },
    }).catch(() => {});

    setSending(false);
    setSendModal(false);
    setSendTexte(''); setSendSegment('tous');
    setPreview(false);
    fetchNotifs();
    alert(`✓ Notification envoyée à ${targets.length} utilisateur(s).`);
  }

  const columns = [
    { key:'participants', label:'Destinataire', render:(v,row) => (
      <span style={{ fontWeight:600 }}>{v?.prenom || row.participant_id?.slice(0,8)||'—'}</span>
    )},
    { key:'texte', label:'Message', render:v => <span style={{ color: T.muted, fontSize:12 }}>{trunc(v,60)}</span>, maxW:280 },
    { key:'capsules', label:'Capsule', render:v => v?.nom||'—' },
    { key:'created_at', label:'Envoyée le', render:v => fmtDate(v) },
    { key:'lue', label:'Lue', render:v => <Badge label={v?'Lue':'Non lue'} color={v?'success':'muted'} /> },
  ];

  const segmentOptions = [
    { value:'tous',    label:'Tous les utilisateurs' },
    { value:'bientot', label:'Capsule qui s\'ouvre bientôt (30j)' },
  ];
  const cibleOptions = [
    { value:'detail',       label:'Écran détail capsule' },
    { value:'contribution', label:'Écran contribution' },
    { value:'ouverture',    label:'Écran ouverture' },
  ];

  return (
    <div>
      <SectionHeader title="Notifications" subtitle={`${fmtNum(total)} notifications envoyées au total`} icon="◬">
        <Btn onClick={()=>setSendModal(true)}>📤 Envoyer une notification</Btn>
      </SectionHeader>

      {/* Stats */}
      <div style={{ display:'flex', gap:14, marginBottom:24, flexWrap:'wrap' }}>
        <KPICard icon="📨" label="Envoyées aujourd'hui"    value={fmtNum(stats?.today)}  loading={!stats} />
        <KPICard icon="📬" label="Cette semaine"            value={fmtNum(stats?.week)}   loading={!stats} />
        <KPICard icon="📮" label="Ce mois"                  value={fmtNum(stats?.month)}  loading={!stats} />
        <KPICard icon="👁️" label="Taux de lecture global"   value={stats ? `${stats.tauxLecture}%` : '—'} loading={!stats}
          help="Pourcentage de notifications marquées comme lues parmi toutes les notifications envoyées." />
      </div>

      <Table columns={columns} data={notifs} loading={loading} emptyMsg="Aucune notification envoyée" />
      <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />

      {/* Modale envoi */}
      <Modal open={sendModal} onClose={()=>{setSendModal(false);setPreview(false);}} title="Envoyer une notification" width={560}>
        {!preview ? (
          <>
            <Field label="Message de la notification" value={sendTexte} onChange={setSendTexte}
              placeholder="Ex : 🎉 Votre capsule s'ouvre bientôt !" multiline />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
              <label>
                <span style={{ display:'block', fontSize:12, fontWeight:700, color: T.muted, marginBottom:6, letterSpacing:.5 }}>SEGMENT CIBLE</span>
                <Select value={sendSegment} onChange={setSendSegment} options={segmentOptions} />
              </label>
              <label>
                <span style={{ display:'block', fontSize:12, fontWeight:700, color: T.muted, marginBottom:6, letterSpacing:.5 }}>ÉCRAN DE DESTINATION</span>
                <Select value={sendCible} onChange={setSendCible} options={cibleOptions} />
              </label>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <Btn onClick={()=>setPreview(true)} disabled={!sendTexte} variant='secondary'>Prévisualiser</Btn>
              <Btn onClick={handleSend} disabled={!sendTexte||sending}>{sending?'Envoi en cours…':'Envoyer'}</Btn>
            </div>
          </>
        ) : (
          <>
            {/* Prévisualisation façon notification mobile */}
            <div style={{ background: T.card, borderRadius:16, padding:20, marginBottom:20, border:`1px solid ${T.border}` }}>
              <div style={{ fontSize:11, color: T.muted, marginBottom:6, letterSpacing:.5 }}>PRÉVISUALISATION</div>
              <div style={{ background: T.elevated, borderRadius:12, padding:'14px 16px', fontSize:14, color: T.text, lineHeight:1.5 }}>
                {sendTexte}
              </div>
              <div style={{ marginTop:10, fontSize:11, color: T.muted }}>
                → Segment : <strong style={{color:T.text}}>{sendSegment === 'tous' ? 'Tous les utilisateurs' : 'Capsules bientôt ouvertes'}</strong>
                · Destination : <strong style={{color:T.text}}>{sendCible}</strong>
              </div>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <Btn variant='ghost' onClick={()=>setPreview(false)}>← Modifier</Btn>
              <Btn onClick={handleSend} disabled={sending}>{sending?'Envoi en cours…':'✓ Confirmer l\'envoi'}</Btn>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
