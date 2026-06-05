// Section Gamification — gestion des points, niveaux et badges depuis le back-office
// Toutes les valeurs sont persistées en base : gami_actions, gami_niveaux, gami_badges_*
import React, { useState, useEffect, useCallback } from 'react';
import { supabase }                                   from '../lib/supabase';
import { T, fmtDate }                                  from '../lib/utils';
import { SectionHeader, Btn, Field, Modal, ConfirmModal, SkeletonCard, Badge } from '../components/ui';
import { useAdmin }                                    from '../App';

const TABS = ['Points par action', 'Niveaux', 'Badges'];

// ── Petit badge de niveau avec dégradé ────────────────────────────────────────
function NiveauBadge({ niveau }) {
  const bg = niveau <= 2 ? '#4D7CFF' : niveau <= 4 ? '#FF8A3D' : '#C65CE8';
  return (
    <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
      width:28, height:28, borderRadius:'50%', background:bg,
      fontWeight:800, fontSize:13, color:'#fff', flexShrink:0 }}>
      {niveau}
    </span>
  );
}

export default function Gamification() {
  const { logAction } = useAdmin();

  const [tab,       setTab]       = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);

  // Données
  const [actions,    setActions]    = useState([]);
  const [niveaux,    setNiveaux]    = useState([]);
  const [categories, setCategories] = useState([]); // chaque catégorie a .paliers[]

  // Édition niveaux
  const [editNiveau,    setEditNiveau]    = useState(null);  // row en cours d'édition
  const [editNiveauVal, setEditNiveauVal] = useState({});

  // Édition badges
  const [addPalier,        setAddPalier]        = useState(null); // categorie_cle en cours
  const [addPalierForm,    setAddPalierForm]     = useState({ slug:'', seuil:'', nom:'' });
  const [confirmDelPalier, setConfirmDelPalier]  = useState(null); // id

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [
      { data: actionsData },
      { data: niveauxData },
      { data: catsData },
      { data: paliersData },
    ] = await Promise.all([
      supabase.from('gami_actions').select('*').order('cle'),
      supabase.from('gami_niveaux').select('*').order('niveau'),
      supabase.from('gami_badges_categories').select('*').order('ordre'),
      supabase.from('gami_badges_paliers').select('*').order('seuil'),
    ]);

    setActions(actionsData || []);
    setNiveaux(niveauxData || []);

    const catsWithPaliers = (catsData || []).map(cat => ({
      ...cat,
      paliers: (paliersData || []).filter(p => p.categorie_cle === cat.cle),
    }));
    setCategories(catsWithPaliers);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function flash() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  // ── Points par action ──────────────────────────────────────────────────────
  async function saveActionPoints(cle, points) {
    setSaving(true);
    await supabase.from('gami_actions')
      .update({ points: parseInt(points, 10), updated_at: new Date().toISOString() })
      .eq('cle', cle);
    await logAction('update_gami_action', cle, { points });
    setSaving(false);
    flash();
  }

  function handlePointsBlur(cle, val) {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 0) saveActionPoints(cle, n);
  }

  // ── Niveaux ────────────────────────────────────────────────────────────────
  async function saveNiveau() {
    setSaving(true);
    const { niveau, ...fields } = editNiveauVal;
    await supabase.from('gami_niveaux')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('niveau', editNiveauVal.niveau);
    await logAction('update_gami_niveau', String(editNiveauVal.niveau), fields);
    await fetchAll();
    setSaving(false);
    setEditNiveau(null);
    flash();
  }

  // ── Badges / paliers ───────────────────────────────────────────────────────
  async function addPalierSave() {
    if (!addPalierForm.slug || !addPalierForm.seuil || !addPalierForm.nom) return;
    setSaving(true);
    await supabase.from('gami_badges_paliers').insert({
      categorie_cle: addPalier,
      slug:  addPalierForm.slug.toLowerCase().replace(/\s+/g,'_'),
      seuil: parseInt(addPalierForm.seuil, 10),
      nom:   addPalierForm.nom,
    });
    await logAction('add_gami_palier', addPalier, addPalierForm);
    await fetchAll();
    setSaving(false);
    setAddPalier(null);
    setAddPalierForm({ slug:'', seuil:'', nom:'' });
    flash();
  }

  async function deletePalier() {
    if (!confirmDelPalier) return;
    setSaving(true);
    await supabase.from('gami_badges_paliers').delete().eq('id', confirmDelPalier);
    await logAction('delete_gami_palier', confirmDelPalier);
    await fetchAll();
    setSaving(false);
    setConfirmDelPalier(null);
    flash();
  }

  const card = { background: T.card, borderRadius:16, padding:24, border:`1px solid ${T.border}`, marginBottom:16 };

  return (
    <div>
      <SectionHeader title="Gamification" subtitle="Points, niveaux et badges — tous les paramètres sont en base de données" icon="🏆">
        {saved   && <span style={{ fontSize:12, color:T.success, fontWeight:700 }}>✓ Sauvegardé</span>}
        {saving  && <span style={{ fontSize:12, color:T.warning }}>Sauvegarde…</span>}
        <Btn variant="secondary" size="sm" onClick={fetchAll}>↻ Actualiser</Btn>
      </SectionHeader>

      {/* Onglets */}
      <div style={{ display:'flex', gap:4, marginBottom:24, borderBottom:`1px solid ${T.border}` }}>
        {TABS.map((t,i) => (
          <button key={i} onClick={() => setTab(i)} style={{
            padding:'9px 20px', borderRadius:'8px 8px 0 0', border:'none',
            background: tab===i ? T.card : 'transparent',
            color: tab===i ? T.a2 : T.muted,
            cursor:'pointer', fontSize:13, fontWeight: tab===i ? 700 : 500,
            fontFamily: T.ff_corps,
            borderBottom: tab===i ? `2px solid ${T.a2}` : 'none',
          }}>
            {t}
          </button>
        ))}
      </div>

      {loading && <SkeletonCard rows={6} />}

      {/* ── TAB 0 : Points par action ────────────────────────────────────────── */}
      {!loading && tab === 0 && (
        <div style={card}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>Points attribués par action utilisateur</div>
          <div style={{ fontSize:12, color:T.muted, marginBottom:24 }}>
            Modifiez les valeurs et sauvegardez. Les changements s'appliquent aux nouvelles actions seulement (pas rétroactif).
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 140px', gap:0 }}>
            {/* En-têtes */}
            <div style={{ fontSize:11, fontWeight:700, color:T.muted, letterSpacing:.6, padding:'6px 0', borderBottom:`1px solid ${T.border}`, marginBottom:4 }}>ACTION</div>
            <div style={{ fontSize:11, fontWeight:700, color:T.muted, letterSpacing:.6, padding:'6px 0', textAlign:'center', borderBottom:`1px solid ${T.border}`, marginBottom:4 }}>POINTS</div>

            {actions.map(action => (
              <React.Fragment key={action.cle}>
                <div style={{ display:'flex', alignItems:'center', padding:'14px 0', borderBottom:`1px solid ${T.border}30` }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:T.text }}>{action.label}</div>
                    <div style={{ fontSize:11, color:T.muted, fontFamily:'monospace', marginTop:2 }}>{action.cle}</div>
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'14px 0', borderBottom:`1px solid ${T.border}30`, gap:8 }}>
                  <input
                    type="number"
                    defaultValue={action.points}
                    min={0}
                    key={`${action.cle}_${action.points}`}
                    onBlur={e => handlePointsBlur(action.cle, e.target.value)}
                    style={{
                      width:64, padding:'8px 10px', borderRadius:8,
                      border:`1px solid ${T.border}`, background:T.elevated,
                      color:T.text, fontFamily:T.ff_corps, fontSize:15,
                      fontWeight:700, textAlign:'center', outline:'none',
                    }}
                  />
                  <span style={{ fontSize:12, color:T.muted }}>pts</span>
                </div>
              </React.Fragment>
            ))}
          </div>

          <p style={{ fontSize:11, color:T.muted, marginTop:16, lineHeight:1.5 }}>
            💡 Les valeurs sont sauvegardées automatiquement à la perte de focus (clic hors du champ).
            Le frontend lit ces valeurs au lancement de l'app — un refresh utilisateur est nécessaire pour voir les nouveaux barèmes.
          </p>
        </div>
      )}

      {/* ── TAB 1 : Niveaux ─────────────────────────────────────────────────── */}
      {!loading && tab === 1 && (
        <div style={card}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>Niveaux de progression</div>
          <div style={{ fontSize:12, color:T.muted, marginBottom:24 }}>
            6 niveaux de Graine à Forêt. Modifiez le nom, l'emoji, le seuil de points et la récompense.
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {niveaux.map(n => (
              <div key={n.niveau} style={{
                display:'grid', gridTemplateColumns:'36px 44px 1fr 100px 1fr auto',
                gap:12, alignItems:'center', padding:'14px 16px',
                background:T.elevated, borderRadius:12,
                border:`1px solid ${T.border}30`,
              }}>
                <NiveauBadge niveau={n.niveau} />
                <span style={{ fontSize:26, textAlign:'center' }}>{n.emoji}</span>
                <div>
                  <div style={{ fontWeight:700, fontSize:14, color:T.text }}>{n.nom}</div>
                  <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>Niveau {n.niveau}</div>
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontWeight:800, fontSize:18, color:T.a2 }}>{n.min_points}</div>
                  <div style={{ fontSize:10, color:T.muted }}>points min.</div>
                </div>
                <div style={{ fontSize:12, color:T.muted, fontStyle: n.recompense ? 'normal' : 'italic' }}>
                  {n.recompense || 'Aucune récompense'}
                </div>
                <Btn size="sm" variant="ghost" onClick={() => {
                  setEditNiveau(n);
                  setEditNiveauVal({ ...n });
                }}>
                  ✏️ Modifier
                </Btn>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 2 : Badges ──────────────────────────────────────────────────── */}
      {!loading && tab === 2 && (
        <div>
          {categories.map(cat => (
            <div key={cat.cle} style={{ ...card }}>
              {/* En-tête catégorie */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <span style={{ fontSize:28 }}>{cat.emoji}</span>
                  <div>
                    <div style={{ fontWeight:700, fontSize:15, color:T.text }}>{cat.categorie}</div>
                    <div style={{ fontSize:11, color:T.muted, fontFamily:'monospace', marginTop:2 }}>
                      compteur : {cat.cle} · {cat.paliers.length} palier{cat.paliers.length > 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
                <Btn size="sm" onClick={() => {
                  setAddPalier(cat.cle);
                  setAddPalierForm({ slug:'', seuil:'', nom:'' });
                }}>
                  + Ajouter un palier
                </Btn>
              </div>

              {/* Table des paliers */}
              {cat.paliers.length === 0 ? (
                <div style={{ color:T.muted, fontSize:13, padding:'12px 0', textAlign:'center' }}>Aucun palier pour cette catégorie.</div>
              ) : (
                <div>
                  {/* En-têtes */}
                  <div style={{ display:'grid', gridTemplateColumns:'80px 1fr 1fr auto', gap:12, padding:'6px 12px', fontSize:11, fontWeight:700, color:T.muted, letterSpacing:.6, textTransform:'uppercase' }}>
                    <div>Seuil</div>
                    <div>Nom du badge</div>
                    <div>Slug technique</div>
                    <div></div>
                  </div>
                  {cat.paliers.sort((a,b) => a.seuil - b.seuil).map(p => (
                    <div key={p.id} style={{
                      display:'grid', gridTemplateColumns:'80px 1fr 1fr auto',
                      gap:12, padding:'10px 12px', alignItems:'center',
                      borderTop:`1px solid ${T.border}30`,
                    }}>
                      <div style={{ fontWeight:800, fontSize:16, color:T.a2 }}>{p.seuil}</div>
                      <div style={{ fontWeight:600, fontSize:13, color:T.text }}>{p.nom}</div>
                      <div style={{ fontSize:11, color:T.muted, fontFamily:'monospace' }}>{p.slug}</div>
                      <Btn size="sm" variant="danger" onClick={() => setConfirmDelPalier(p.id)}>✕</Btn>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Modale : modifier un niveau ──────────────────────────────────────── */}
      <Modal open={!!editNiveau} onClose={() => setEditNiveau(null)} title={`Modifier le niveau ${editNiveau?.niveau} — ${editNiveau?.nom}`}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:8 }}>
          <Field label="NOM DU NIVEAU"
            value={editNiveauVal.nom || ''}
            onChange={v => setEditNiveauVal(f => ({ ...f, nom: v }))}
            placeholder="ex : Bourgeon" />
          <Field label="EMOJI"
            value={editNiveauVal.emoji || ''}
            onChange={v => setEditNiveauVal(f => ({ ...f, emoji: v }))}
            placeholder="🌿" />
        </div>
        <Field label="POINTS MINIMUM"
          value={String(editNiveauVal.min_points ?? '')}
          onChange={v => setEditNiveauVal(f => ({ ...f, min_points: parseInt(v,10)||0 }))}
          placeholder="ex : 15" />
        <Field label="RÉCOMPENSE (optionnel)"
          value={editNiveauVal.recompense || ''}
          onChange={v => setEditNiveauVal(f => ({ ...f, recompense: v || null }))}
          placeholder="ex : 1 mois Pack Papy offert"
          multiline />
        <p style={{ fontSize:11, color:T.muted, marginBottom:16, lineHeight:1.5 }}>
          ⚠️ Modifier le seuil de points ne recalcule pas les niveaux des utilisateurs existants.
          Cela s'appliquera lors du prochain incrément de gamification.
        </p>
        <div style={{ display:'flex', gap:10 }}>
          <Btn variant="secondary" onClick={() => setEditNiveau(null)} style={{ flex:1 }}>Annuler</Btn>
          <Btn variant="primary" onClick={saveNiveau} disabled={saving} style={{ flex:1 }}>
            {saving ? 'Sauvegarde…' : 'Enregistrer'}
          </Btn>
        </div>
      </Modal>

      {/* ── Modale : ajouter un palier ───────────────────────────────────────── */}
      <Modal open={!!addPalier} onClose={() => setAddPalier(null)}
        title={`Nouveau palier — ${categories.find(c => c.cle === addPalier)?.categorie || ''}`}>
        <Field label="NOM DU BADGE"
          value={addPalierForm.nom}
          onChange={v => setAddPalierForm(f => ({ ...f, nom: v }))}
          placeholder="ex : Maître des capsules" />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <Field label="SEUIL (nb d'actions)"
            value={addPalierForm.seuil}
            onChange={v => setAddPalierForm(f => ({ ...f, seuil: v }))}
            placeholder="ex : 10" />
          <Field label="SLUG TECHNIQUE"
            value={addPalierForm.slug}
            onChange={v => setAddPalierForm(f => ({ ...f, slug: v }))}
            placeholder="ex : maitre_capsules" />
        </div>
        <p style={{ fontSize:11, color:T.muted, marginBottom:16, lineHeight:1.5 }}>
          Le slug doit être unique en base et sans espace (utilisez des underscores).
          Il identifie le badge dans le code frontend.
        </p>
        <div style={{ display:'flex', gap:10 }}>
          <Btn variant="secondary" onClick={() => setAddPalier(null)} style={{ flex:1 }}>Annuler</Btn>
          <Btn variant="primary" onClick={addPalierSave}
            disabled={saving || !addPalierForm.nom || !addPalierForm.seuil || !addPalierForm.slug}
            style={{ flex:1 }}>
            {saving ? 'Ajout…' : 'Ajouter le palier'}
          </Btn>
        </div>
      </Modal>

      {/* ── Confirmation suppression palier ──────────────────────────────────── */}
      <ConfirmModal
        open={!!confirmDelPalier}
        title="Supprimer ce palier ?"
        danger={true}
        message="Ce palier sera supprimé définitivement. Les utilisateurs qui avaient déjà débloqué ce badge le conserveront (les données gamification ne sont pas modifiées)."
        onConfirm={deletePalier}
        onCancel={() => setConfirmDelPalier(null)}
      />
    </div>
  );
}
