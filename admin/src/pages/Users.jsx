// Section Utilisateurs — tableau paginé, recherche, fiche détaillée en panneau latéral
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { T, fmtDate, fmtRelative, fmtNum, colorFromId, TYPES_CONTRIB, trunc } from '../lib/utils';
import { SectionHeader, SearchInput, Table, Pagination, SidePanel, Badge, Btn, ConfirmModal, Modal, Field, SkeletonCard, Select } from '../components/ui';
import { useAdmin } from '../App';

const PAGE_SIZE = 50;

// Avatar circulaire avec initiale
function Avatar({ prenom='?', photo=null, couleur=null, taille=32 }) {
  const bg = couleur || colorFromId(prenom);
  return photo
    ? <img src={photo} alt="" style={{ width:taille, height:taille, borderRadius:'50%', objectFit:'cover', flexShrink:0 }} />
    : <div style={{ width:taille, height:taille, borderRadius:'50%', background:bg, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:taille*0.38, color:'#fff', flexShrink:0 }}>
        {prenom.charAt(0).toUpperCase()}
      </div>;
}

export default function Users() {
  const { logAction } = useAdmin();
  const [users,      setUsers]      = useState([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [search,     setSearch]     = useState('');
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState(null);
  const [detail,     setDetail]     = useState(null);
  const [detailLoad, setDetailLoad] = useState(false);
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [confirmDelete,  setConfirmDelete]  = useState(false);
  const [emailModal, setEmailModal]   = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody,  setEmailBody]    = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [filterActivite, setFilterActivite] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('participants')
      .select('id,prenom,couleur,photo,description,user_id,created_at', { count:'exact' })
      .order('created_at', { ascending:false })
      .range((page-1)*PAGE_SIZE, page*PAGE_SIZE-1);

    if (search) q = q.or(`prenom.ilike.%${search}%`);
    const { data, count } = await q;
    setUsers(data || []);
    setTotal(count || 0);
    setLoading(false);
  }, [page, search]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // Charge la fiche détaillée d'un utilisateur
  async function openDetail(user) {
    setSelected(user);
    setDetailLoad(true);
    const [
      { data: capsules },
      { data: contributions },
    ] = await Promise.all([
      supabase.from('participants').select('capsule_id, capsules(id,nom,type,ouverte,date_ouverture,created_at)').eq('user_id', user.user_id).not('user_id','is',null),
      supabase.from('contributions').select('id,type,created_at').eq('auteur_id', user.id),
    ]);

    // Comptage souvenirs par type
    const parType = {};
    contributions?.forEach(c => { parType[c.type] = (parType[c.type]||0)+1; });

    setDetail({ capsules, contributions, parType });
    setDetailLoad(false);
  }

  async function handleSuspend() {
    // En production : Edge Function qui désactive l'auth user (service_role)
    await logAction('suspend_user', selected?.id, { prenom: selected?.prenom });
    setConfirmSuspend(false);
    alert(`Compte de ${selected?.prenom} suspendu. (Edge Function à brancher en prod)`);
  }

  async function handleDelete() {
    await logAction('delete_user', selected?.id, { prenom: selected?.prenom });
    setConfirmDelete(false);
    setSelected(null);
    alert('Suppression RGPD : Edge Function à brancher en prod.');
  }

  async function handleSendEmail() {
    setEmailSending(true);
    await logAction('send_email', selected?.user_id, { subject: emailSubject });
    // En prod : Edge Function avec Resend / SendGrid
    await new Promise(r => setTimeout(r, 800));
    setEmailSending(false);
    setEmailModal(false);
    setEmailSubject(''); setEmailBody('');
    alert('Email envoyé (Edge Function à brancher en prod).');
  }

  const columns = [
    { key:'prenom', label:'Utilisateur', render:(v,row) => (
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <Avatar prenom={row.prenom} photo={row.photo} couleur={row.couleur} />
        <span style={{ fontWeight:600 }}>{row.prenom || '—'}</span>
      </div>
    )},
    { key:'created_at', label:'Inscription',  render:v => fmtDate(v) },
    { key:'description', label:'Description', render:v => <span style={{ color: T.muted }}>{trunc(v,40)||'—'}</span>, maxW:200 },
    { key:'user_id', label:'Statut', render:v => <Badge label={v ? 'Compte lié' : 'Anonyme'} color={v ? 'success' : 'muted'} /> },
    { key:'id', label:'',  render:(_,row) => <Btn size='sm' variant='ghost' onClick={e=>{e.stopPropagation();openDetail(row);}}>Voir →</Btn> },
  ];

  return (
    <div>
      <SectionHeader title="Utilisateurs" subtitle={`${fmtNum(total)} participants au total`} icon="◎">
        <Select value={filterActivite} onChange={setFilterActivite} placeholder="Tous" options={[{value:'actif',label:'Actifs'},{value:'inactif',label:'Inactifs'}]} />
        <SearchInput value={search} onChange={v=>{setSearch(v);setPage(1);}} placeholder="Rechercher un prénom…" />
        <Btn variant='secondary' size='sm' onClick={()=>{
          const csv = ['Prenom,Date inscription,User_ID',...users.map(u=>`${u.prenom},${fmtDate(u.created_at)},${u.user_id||''}`)] .join('\n');
          const a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a.download='utilisateurs.csv'; a.click();
        }}>⬇ CSV</Btn>
      </SectionHeader>

      <Table columns={columns} data={users} loading={loading} onRowClick={openDetail} emptyMsg="Aucun utilisateur trouvé" />
      <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />

      {/* Panneau détail */}
      <SidePanel open={!!selected} onClose={()=>{setSelected(null);setDetail(null);}} title={selected?.prenom || 'Détail utilisateur'}>
        {selected && (
          <div>
            {/* Avatar + infos */}
            <div style={{ display:'flex', gap:16, alignItems:'center', marginBottom:24, padding:'0 0 20px', borderBottom:`1px solid ${T.border}` }}>
              <Avatar prenom={selected.prenom} photo={selected.photo} couleur={selected.couleur} taille={64} />
              <div>
                <div style={{ fontFamily: T.ff_titre, fontWeight:800, fontSize:20 }}>{selected.prenom}</div>
                <div style={{ fontSize:12, color: T.muted, marginTop:4 }}>{selected.description || 'Pas de description'}</div>
                <div style={{ fontSize:11, color: T.muted, marginTop:6 }}>Inscrit le {fmtDate(selected.created_at)}</div>
              </div>
            </div>

            {/* Comptage souvenirs par type */}
            {detailLoad ? <SkeletonCard rows={3} /> : detail && (
              <>
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontSize:11, fontWeight:700, color: T.muted, letterSpacing:.8, marginBottom:10 }}>SOUVENIRS PAR TYPE ({detail.contributions?.length||0} au total)</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                    {Object.entries(detail.parType).map(([type, nb]) => (
                      <div key={type} style={{ background: T.card, borderRadius:8, padding:'6px 12px', fontSize:12, color: T.text }}>
                        {TYPES_CONTRIB[type]||''} {type} <strong>×{nb}</strong>
                      </div>
                    ))}
                    {!Object.keys(detail.parType).length && <div style={{ color: T.muted, fontSize:12 }}>Aucun souvenir déposé</div>}
                  </div>
                </div>

                <div style={{ marginBottom:24 }}>
                  <div style={{ fontSize:11, fontWeight:700, color: T.muted, letterSpacing:.8, marginBottom:10 }}>CAPSULES ({detail.capsules?.length||0})</div>
                  {detail.capsules?.slice(0,8).map(p => p.capsules && (
                    <div key={p.capsule_id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:`1px solid ${T.border}30` }}>
                      <span style={{ fontSize:12, color: T.text }}>{p.capsules.nom || 'Sans titre'}</span>
                      <Badge label={p.capsules.ouverte ? 'Ouverte' : 'Scellée'} color={p.capsules.ouverte ? 'success' : 'info'} />
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Actions */}
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <Btn onClick={()=>setEmailModal(true)} variant='ghost'>📧 Envoyer un email</Btn>
              <Btn onClick={()=>setConfirmSuspend(true)} variant='ghost' style={{ color: T.warning, borderColor: T.warning+'60' }}>⚠️ Suspendre le compte</Btn>
              <Btn onClick={()=>setConfirmDelete(true)} variant='danger'>🗑 Supprimer le compte (RGPD)</Btn>
            </div>
          </div>
        )}
      </SidePanel>

      {/* Modales confirmation */}
      <ConfirmModal open={confirmSuspend} title="Suspendre ce compte ?" danger={false}
        message={`Le compte de ${selected?.prenom} sera désactivé. Les données sont conservées.`}
        onConfirm={handleSuspend} onCancel={()=>setConfirmSuspend(false)} />
      <ConfirmModal open={confirmDelete} title="Supprimer définitivement ?" danger={true}
        message={`RGPD : toutes les données de ${selected?.prenom} seront effacées de façon irréversible. Cette action ne peut pas être annulée.`}
        onConfirm={handleDelete} onCancel={()=>setConfirmDelete(false)} />

      {/* Modale email */}
      <Modal open={emailModal} onClose={()=>setEmailModal(false)} title={`Email à ${selected?.prenom}`}>
        <Field label="Sujet" value={emailSubject} onChange={setEmailSubject} placeholder="Objet de l'email…" />
        <Field label="Message" value={emailBody} onChange={setEmailBody} placeholder="Votre message…" multiline />
        <div style={{ marginTop:8 }}>
          <Btn onClick={handleSendEmail} disabled={!emailSubject||!emailBody||emailSending}>
            {emailSending ? 'Envoi…' : '📤 Envoyer'}
          </Btn>
        </div>
      </Modal>
    </div>
  );
}
