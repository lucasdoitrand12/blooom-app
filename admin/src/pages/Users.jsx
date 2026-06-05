// Section Utilisateurs — tableau paginé, recherche, fiche détaillée avec gamification
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { T, fmtDate, fmtNum, colorFromId, TYPES_CONTRIB, trunc } from '../lib/utils';
import { SectionHeader, SearchInput, Table, Pagination, SidePanel, Badge, Btn, ConfirmModal, Modal, Field, SkeletonCard, Select } from '../components/ui';
import { useAdmin } from '../App';

const PAGE_SIZE = 50;

// Niveaux en miroir de la config (fallback si la table n'est pas encore chargée)
const NIVEAUX_LABELS = ['', 'Graine 🌱', 'Bourgeon 🌿', 'Pousse 🪴', 'Branche 🌲', 'Arbre 🌳', 'Forêt 🌿'];

function Avatar({ prenom='?', photo=null, couleur=null, taille=32 }) {
  const bg = couleur || colorFromId(prenom);
  return photo
    ? <img src={photo} alt="" style={{ width:taille, height:taille, borderRadius:'50%', objectFit:'cover', flexShrink:0 }} />
    : <div style={{ width:taille, height:taille, borderRadius:'50%', background:bg, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:taille*0.38, color:'#fff', flexShrink:0 }}>
        {prenom.charAt(0).toUpperCase()}
      </div>;
}

// Miniature gamification dans le panneau détail
function GamiWidget({ gami, loading }) {
  if (loading) return <SkeletonCard rows={2} />;
  if (!gami) return (
    <div style={{ color:T.muted, fontSize:12, padding:'8px 0', fontStyle:'italic' }}>
      Aucune donnée gamification (utilisateur anonyme ou pas encore actif).
    </div>
  );

  const niveauLabel = NIVEAUX_LABELS[gami.niveau] || `Niveau ${gami.niveau}`;
  const nbBadges = countBadges(gami);

  return (
    <div style={{ background:T.elevated, borderRadius:12, padding:14, display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:T.text }}>{niveauLabel}</div>
          <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>{gami.points_total} points au total</div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:18, fontWeight:800, color:T.a2 }}>{gami.points_total}</div>
          <div style={{ fontSize:10, color:T.muted }}>pts</div>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8 }}>
        {[
          { label:'Capsules', val: gami.capsules_creees, icon:'🏗️' },
          { label:'Souvenirs', val: gami.souvenirs_deposes, icon:'📸' },
          { label:'Badges', val: nbBadges, icon:'🏅' },
        ].map(it => (
          <div key={it.label} style={{ textAlign:'center', background:T.card, borderRadius:8, padding:'8px 4px' }}>
            <div style={{ fontSize:16 }}>{it.icon}</div>
            <div style={{ fontWeight:700, fontSize:14, color:T.text }}>{it.val}</div>
            <div style={{ fontSize:10, color:T.muted }}>{it.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Compte approximatif de badges débloqués depuis les compteurs
function countBadges(gami) {
  if (!gami) return 0;
  let n = 0;
  const check = (val, seuils) => seuils.forEach(s => { if (val >= s) n++; });
  check(gami.capsules_creees,            [1, 3, 10, 25, 50]);
  check(gami.souvenirs_deposes,          [1, 10, 50, 200, 500]);
  check(gami.parrainages_acceptes,       [1, 5, 15, 30]);
  check(gami.capsules_papy_ouvertes,     [1, 6, 12, 24]);
  check(gami.packs_inoubliables_achetes, [1, 3, 7]);
  return n;
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
  const [gamiData,   setGamiData]   = useState(null);
  const [gamiLoad,   setGamiLoad]   = useState(false);

  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [confirmDelete,  setConfirmDelete]  = useState(false);
  const [emailModal,   setEmailModal]   = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody,    setEmailBody]    = useState('');
  const [emailSending, setEmailSending] = useState(false);

  // Modification des points gamification
  const [pointsModal,  setPointsModal]  = useState(false);
  const [pointsDelta,  setPointsDelta]  = useState('');
  const [pointsReason, setPointsReason] = useState('');
  const [pointsSaving, setPointsSaving] = useState(false);

  const [filterActivite, setFilterActivite] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('profiles')
      .select('id, prenom, couleur, photo, description, created_at', { count:'exact' })
      .order('created_at', { ascending:false })
      .range((page-1)*PAGE_SIZE, page*PAGE_SIZE-1);

    if (search) q = q.ilike('prenom', `%${search}%`);
    const { data, count } = await q;
    setUsers(data || []);
    setTotal(count || 0);
    setLoading(false);
  }, [page, search]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function openDetail(user) {
    setSelected(user);
    setDetail(null);
    setGamiData(null);
    setDetailLoad(true);
    setGamiLoad(true);

    const [
      { data: capsules },
      { data: contributions },
    ] = await Promise.all([
      supabase.from('capsules')
        .select('id, nom, type, ouverte, date_ouverture, created_at')
        .eq('created_by', user.id)
        .order('created_at', { ascending:false })
        .limit(20),
      supabase.from('contributions')
        .select('id, type, created_at')
        .eq('auteur_id', user.id),
    ]);

    const parType = {};
    contributions?.forEach(c => { parType[c.type] = (parType[c.type]||0)+1; });
    setDetail({ capsules, contributions, parType });
    setDetailLoad(false);

    // Charge la gamification séparément
    const { data: gami } = await supabase
      .from('gamification')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    setGamiData(gami || null);
    setGamiLoad(false);
  }

  // ── Modifier les points gamification ─────────────────────────────────────
  async function handleEditPoints() {
    const delta = parseInt(pointsDelta, 10);
    if (isNaN(delta) || delta === 0) return;
    if (!selected?.id) return;
    setPointsSaving(true);
    await supabase.rpc('incrementer_gamification', {
      p_user_id:                    selected.id,
      p_points:                     delta,
      p_capsules_creees:            0,
      p_souvenirs_deposes:          0,
      p_parrainages_acceptes:       0,
      p_capsules_papy_ouvertes:     0,
      p_packs_inoubliables_achetes: 0,
    });
    await logAction('edit_gami_points', selected.id, { delta, reason: pointsReason });
    setPointsSaving(false);
    setPointsModal(false);
    setPointsDelta('');
    setPointsReason('');
    // Recharger gami
    const { data: gami } = await supabase.from('gamification').select('*').eq('user_id', selected.id).maybeSingle();
    setGamiData(gami || null);
  }

  async function handleSuspend() {
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
    await logAction('send_email', selected?.id, { subject: emailSubject });
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
    { key:'created_at', label:'Inscription', render:v => fmtDate(v) },
    { key:'description', label:'Description', render:v => <span style={{ color:T.muted }}>{trunc(v,40)||'—'}</span>, maxW:200 },
    { key:'id', label:'', render:(_,row) => <Btn size='sm' variant='ghost' onClick={e=>{e.stopPropagation();openDetail(row);}}>Voir →</Btn> },
  ];

  return (
    <div>
      <SectionHeader title="Utilisateurs" subtitle={`${fmtNum(total)} utilisateurs au total`} icon="◎">
        <Select value={filterActivite} onChange={setFilterActivite} placeholder="Tous" options={[{value:'actif',label:'Actifs'},{value:'inactif',label:'Inactifs'}]} />
        <SearchInput value={search} onChange={v=>{setSearch(v);setPage(1);}} placeholder="Rechercher un prénom…" />
        <Btn variant='secondary' size='sm' onClick={() => {
          const csv = ['Prenom,Date inscription,ID',...users.map(u=>`${u.prenom},${fmtDate(u.created_at)},${u.id||''}`)] .join('\n');
          const a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a.download='utilisateurs.csv'; a.click();
        }}>⬇ CSV</Btn>
      </SectionHeader>

      <Table columns={columns} data={users} loading={loading} onRowClick={openDetail} emptyMsg="Aucun utilisateur trouvé" />
      <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />

      {/* Panneau détail */}
      <SidePanel open={!!selected} onClose={() => {setSelected(null);setDetail(null);setGamiData(null);}} title={selected?.prenom || 'Détail utilisateur'}>
        {selected && (
          <div>
            {/* Avatar + infos */}
            <div style={{ display:'flex', gap:16, alignItems:'center', marginBottom:24, padding:'0 0 20px', borderBottom:`1px solid ${T.border}` }}>
              <Avatar prenom={selected.prenom} photo={selected.photo} couleur={selected.couleur} taille={64} />
              <div>
                <div style={{ fontFamily:T.ff_titre, fontWeight:800, fontSize:20 }}>{selected.prenom}</div>
                <div style={{ fontSize:12, color:T.muted, marginTop:4 }}>{selected.description || 'Pas de description'}</div>
                <div style={{ fontSize:11, color:T.muted, marginTop:6 }}>Inscrit le {fmtDate(selected.created_at)}</div>
                <div style={{ fontSize:10, color:T.muted, fontFamily:'monospace', marginTop:3 }}>{selected.id}</div>
              </div>
            </div>

            {/* Gamification */}
            <div style={{ marginBottom:20 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                <div style={{ fontSize:11, fontWeight:700, color:T.muted, letterSpacing:.8 }}>GAMIFICATION</div>
                {gamiData && (
                  <Btn size='sm' variant='ghost' onClick={() => { setPointsDelta(''); setPointsReason(''); setPointsModal(true); }}>
                    ✏️ Modifier les points
                  </Btn>
                )}
              </div>
              <GamiWidget gami={gamiData} loading={gamiLoad} />
            </div>

            {/* Souvenirs par type */}
            {detailLoad ? <SkeletonCard rows={3} /> : detail && (
              <>
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:T.muted, letterSpacing:.8, marginBottom:10 }}>
                    SOUVENIRS ({detail.contributions?.length||0} au total)
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                    {Object.entries(detail.parType).map(([type, nb]) => (
                      <div key={type} style={{ background:T.card, borderRadius:8, padding:'6px 12px', fontSize:12, color:T.text }}>
                        {TYPES_CONTRIB[type]||''} {type} <strong>×{nb}</strong>
                      </div>
                    ))}
                    {!Object.keys(detail.parType).length && <div style={{ color:T.muted, fontSize:12 }}>Aucun souvenir déposé</div>}
                  </div>
                </div>

                <div style={{ marginBottom:24 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:T.muted, letterSpacing:.8, marginBottom:10 }}>
                    CAPSULES ({detail.capsules?.length||0})
                  </div>
                  {detail.capsules?.slice(0,8).map(c => (
                    <div key={c.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:`1px solid ${T.border}30` }}>
                      <span style={{ fontSize:12, color:T.text }}>{c.nom || 'Sans titre'}</span>
                      <Badge label={c.ouverte ? 'Ouverte' : 'Scellée'} color={c.ouverte ? 'success' : 'info'} />
                    </div>
                  ))}
                  {!detail.capsules?.length && <div style={{ color:T.muted, fontSize:12 }}>Aucune capsule créée</div>}
                </div>
              </>
            )}

            {/* Actions */}
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <Btn onClick={() => setEmailModal(true)} variant='ghost'>📧 Envoyer un email</Btn>
              <Btn onClick={() => setConfirmSuspend(true)} variant='ghost' style={{ color:T.warning, borderColor:`${T.warning}60` }}>⚠️ Suspendre le compte</Btn>
              <Btn onClick={() => setConfirmDelete(true)} variant='danger'>🗑 Supprimer le compte (RGPD)</Btn>
            </div>
          </div>
        )}
      </SidePanel>

      {/* Modale modification de points */}
      <Modal open={pointsModal} onClose={() => setPointsModal(false)} title={`Modifier les points de ${selected?.prenom}`}>
        <p style={{ fontSize:13, color:T.muted, marginBottom:20, lineHeight:1.6 }}>
          Points actuels : <strong style={{ color:T.a2 }}>{gamiData?.points_total ?? 0}</strong>
          {' '}(niveau {gamiData?.niveau ?? 1}). Entrez un delta positif pour ajouter ou négatif pour soustraire.
        </p>
        <Field label="DELTA DE POINTS (ex : +10 ou -5)"
          value={pointsDelta}
          onChange={setPointsDelta}
          placeholder="ex : 10" />
        <Field label="RAISON (pour le log)"
          value={pointsReason}
          onChange={setPointsReason}
          placeholder="ex : Correction manuelle, bug de synchronisation…" />
        {parseInt(pointsDelta,10) < 0 && (
          <div style={{ background:`${T.warning}18`, border:`1px solid ${T.warning}40`, borderRadius:8, padding:'8px 12px', fontSize:12, color:T.warning, marginTop:4 }}>
            ⚠️ Vous allez retirer des points. Le total pourrait passer en dessous de zéro.
          </div>
        )}
        <div style={{ display:'flex', gap:10, marginTop:16 }}>
          <Btn variant="secondary" onClick={() => setPointsModal(false)} style={{ flex:1 }}>Annuler</Btn>
          <Btn variant="primary" onClick={handleEditPoints}
            disabled={pointsSaving || !pointsDelta || isNaN(parseInt(pointsDelta,10)) || parseInt(pointsDelta,10) === 0}
            style={{ flex:1 }}>
            {pointsSaving ? 'Sauvegarde…' : 'Appliquer le delta'}
          </Btn>
        </div>
      </Modal>

      {/* Modales confirmation */}
      <ConfirmModal open={confirmSuspend} title="Suspendre ce compte ?" danger={false}
        message={`Le compte de ${selected?.prenom} sera désactivé. Les données sont conservées.`}
        onConfirm={handleSuspend} onCancel={() => setConfirmSuspend(false)} />
      <ConfirmModal open={confirmDelete} title="Supprimer définitivement ?" danger={true}
        message={`RGPD : toutes les données de ${selected?.prenom} seront effacées de façon irréversible. Cette action ne peut pas être annulée.`}
        onConfirm={handleDelete} onCancel={() => setConfirmDelete(false)} />

      {/* Modale email */}
      <Modal open={emailModal} onClose={() => setEmailModal(false)} title={`Email à ${selected?.prenom}`}>
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
