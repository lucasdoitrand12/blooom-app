// Section Contenu — modifier le contenu de l'app sans toucher au code
// Gère : stats sociales, questions d'inspiration, types de capsules, textes, prix & quotas
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { T, TYPES_CAPSULES } from '../lib/utils';
import { SectionHeader, Btn, Badge, ConfirmModal, Field, Modal } from '../components/ui';
import { useAdmin } from '../App';

// Les contenus sont stockés dans app_settings (clé JSON)
// Clés : stats_sociales, questions_inspiration, types_capsules_overrides, textes_app, quotas_formules

const TABS = ['Stats sociales','Questions','Types capsules','Textes app','Prix & Quotas'];

// Quotas par défaut — miroir de src/utils/abonnement.js et du webhook Stripe
const QUOTAS_DEFAUT = {
  gratuit:  { photos:15,  videos:0,  vocaux:0,  participants:10,   dureeVideo:0,  dureeVocal:0,  prix:0,     prixLabel:'Gratuit' },
  occasion: { photos:150, videos:20, vocaux:10, participants:50,   dureeVideo:20, dureeVocal:20, prix:9.99,  prixLabel:'9,99€ one-shot' },
  mariage:  { photos:500, videos:50, vocaux:30, participants:9999, dureeVideo:20, dureeVocal:20, prix:29.99, prixLabel:'29,99€ one-shot' },
  papy:     { photos:40,  videos:4,  vocaux:4,  participants:9999, dureeVideo:20, dureeVocal:20, prix:4.99,  prixAnnuel:44.99, prixLabel:'4,99€/mois ou 44,99€/an' },
};

const FORMULES_LABELS = {
  gratuit:'Gratuit', occasion:'Occasion', mariage:'Mariage', papy:'Mamie/Papy',
};

const QUOTA_FIELDS = [
  { key:'photos',       label:'Photos max',           suffix:'photos' },
  { key:'videos',       label:'Vidéos max',            suffix:'vidéos' },
  { key:'vocaux',       label:'Messages vocaux max',   suffix:'vocaux' },
  { key:'participants', label:'Participants max',       suffix:'pers.' },
  { key:'dureeVideo',   label:'Durée max vidéo',       suffix:'s' },
  { key:'dureeVocal',   label:'Durée max vocal',       suffix:'s' },
];

function ItemRow({ children, onEdit, onDelete, onToggle, active=true }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:`1px solid ${T.border}30` }}>
      <div style={{ flex:1, fontSize:13, color: active ? T.text : T.muted, textDecoration: active ? 'none' : 'line-through' }}>{children}</div>
      <div style={{ display:'flex', gap:6, flexShrink:0 }}>
        {onToggle && <Btn size='sm' variant='ghost' onClick={onToggle}>{active?'⏸':'▶'}</Btn>}
        {onEdit   && <Btn size='sm' variant='ghost' onClick={onEdit}>✏️</Btn>}
        {onDelete && <Btn size='sm' variant='danger' onClick={onDelete}>✕</Btn>}
      </div>
    </div>
  );
}

export default function Content() {
  const { logAction } = useAdmin();
  const [tab,          setTab]          = useState(0);
  const [stats,        setStats]        = useState([]);
  const [questions,    setQuestions]    = useState([]);
  const [types,        setTypes]        = useState([]);
  const [textes,       setTextes]       = useState({});
  const [loading,      setLoading]      = useState(true);
  const [editItem,     setEditItem]     = useState(null);
  const [addModal,     setAddModal]     = useState(false);
  const [addValue,     setAddValue]     = useState('');
  const [confirmDel,   setConfirmDel]   = useState(false);
  const [toDelete,     setToDelete]     = useState(null);
  const [saved,        setSaved]        = useState(false);
  const [quotas,       setQuotas]       = useState({ ...QUOTAS_DEFAUT });

  useEffect(() => { loadContent(); }, []);

  async function loadContent() {
    setLoading(true);
    const { data } = await supabase.from('app_settings').select('key,value');
    const map = Object.fromEntries((data||[]).map(r=>[r.key,r.value]));

    try { setStats(JSON.parse(map.stats_sociales || '[]')); } catch {}
    try { setQuestions(JSON.parse(map.questions_inspiration || '[]')); } catch {}
    try {
      const over = JSON.parse(map.types_capsules_overrides || '{}');
      setTypes(Object.entries(TYPES_CAPSULES).map(([id,icon]) => ({
        id, icon, actif: over[id]?.actif !== false, nom: over[id]?.nom || id,
      })));
    } catch {
      setTypes(Object.entries(TYPES_CAPSULES).map(([id,icon]) => ({ id, icon, actif:true, nom:id })));
    }
    try { setTextes(JSON.parse(map.textes_app || '{}')); } catch {}
    try {
      const q = JSON.parse(map.quotas_formules || '{}');
      setQuotas({ ...QUOTAS_DEFAUT, ...q });
    } catch {}
    setLoading(false);
  }

  async function save(key, value) {
    await supabase.from('app_settings').upsert({ key, value: JSON.stringify(value), updated_at: new Date().toISOString() }, { onConflict:'key' });
    await logAction('update_content', key);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  // Stats sociales
  function toggleStat(i) {
    const next = stats.map((s,idx) => idx===i ? { ...s, actif: !s.actif } : s);
    setStats(next); save('stats_sociales', next);
  }
  function deleteStat(i) {
    const next = stats.filter((_,idx)=>idx!==i);
    setStats(next); save('stats_sociales', next);
  }
  function addStat() {
    const next = [...stats, { texte: addValue, actif: true }];
    setStats(next); save('stats_sociales', next);
    setAddModal(false); setAddValue('');
  }
  function saveStat(i, val) {
    const next = stats.map((s,idx) => idx===i ? { ...s, texte: val } : s);
    setStats(next); save('stats_sociales', next);
    setEditItem(null);
  }

  // Questions
  function toggleQuestion(i) {
    const next = questions.map((q,idx) => idx===i ? { ...q, actif: !q.actif } : q);
    setQuestions(next); save('questions_inspiration', next);
  }
  function deleteQuestion(i) {
    const next = questions.filter((_,idx)=>idx!==i);
    setQuestions(next); save('questions_inspiration', next);
  }
  function addQuestion() {
    const next = [...questions, { texte: addValue, actif: true }];
    setQuestions(next); save('questions_inspiration', next);
    setAddModal(false); setAddValue('');
  }

  // Types capsules
  function toggleType(id) {
    const next = types.map(t => t.id===id ? { ...t, actif: !t.actif } : t);
    setTypes(next);
    const over = Object.fromEntries(next.map(t=>[t.id,{actif:t.actif,nom:t.nom}]));
    save('types_capsules_overrides', over);
  }

  // Textes app
  const TEXTES_KEYS = [
    { key:'slogan', label:'Slogan principal', default:'Scelle. Attends. Souris.' },
    { key:'vide_capsules', label:'Message liste capsules vide', default:'Créez votre première capsule !' },
    { key:'vide_contributions', label:'Message capsule sans souvenir', default:'Ajoutez vos premiers souvenirs…' },
    { key:'bouton_creation', label:'Bouton créer une capsule', default:'Créer une capsule' },
    { key:'encouragement', label:'Message d\'encouragement', default:'Chaque souvenir compte ✨' },
  ];

  return (
    <div>
      <SectionHeader title="Contenu de l'app" subtitle="Modifier les textes et contenus sans toucher au code" icon="✦">
        {saved && <span style={{ fontSize:12, color: T.success, fontWeight:700 }}>✓ Sauvegardé</span>}
      </SectionHeader>

      {/* Onglets */}
      <div style={{ display:'flex', gap:4, marginBottom:24, borderBottom:`1px solid ${T.border}`, paddingBottom:0 }}>
        {TABS.map((t,i) => (
          <button key={i} onClick={()=>setTab(i)}
            style={{ padding:'9px 18px', borderRadius:'8px 8px 0 0', border:'none', background: tab===i ? T.card : 'transparent', color: tab===i ? T.a2 : T.muted, cursor:'pointer', fontSize:13, fontWeight: tab===i?700:500, fontFamily: T.ff_corps, borderBottom: tab===i?`2px solid ${T.a2}`:'none' }}>
            {t}
          </button>
        ))}
      </div>

      {loading && <div style={{ color: T.muted, fontSize:13 }}>Chargement…</div>}

      {/* Stats sociales */}
      {!loading && tab === 0 && (
        <div style={{ background: T.card, borderRadius:16, padding:24, border:`1px solid ${T.border}` }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <div>
              <div style={{ fontWeight:700, fontSize:14 }}>Statistiques sociales</div>
              <div style={{ fontSize:12, color: T.muted, marginTop:2 }}>{stats.filter(s=>s.actif!==false).length} phrases actives / {stats.length} total</div>
            </div>
            <Btn size='sm' onClick={()=>{setAddValue('');setAddModal(true);}}>+ Ajouter</Btn>
          </div>
          {stats.map((s,i) => (
            editItem?.type==='stat'&&editItem.index===i
              ? <div key={i} style={{ padding:'8px 0', borderBottom:`1px solid ${T.border}30` }}>
                  <Field label="" value={editItem.value} onChange={v=>setEditItem({...editItem,value:v})} />
                  <div style={{ display:'flex', gap:8 }}>
                    <Btn size='sm' onClick={()=>saveStat(i,editItem.value)}>Sauvegarder</Btn>
                    <Btn size='sm' variant='ghost' onClick={()=>setEditItem(null)}>Annuler</Btn>
                  </div>
                </div>
              : <ItemRow key={i} active={s.actif!==false}
                  onEdit={()=>setEditItem({type:'stat',index:i,value:s.texte||s})}
                  onDelete={()=>{setToDelete({type:'stat',index:i});setConfirmDel(true);}}
                  onToggle={()=>toggleStat(i)}>
                  {s.texte||s}
                </ItemRow>
          ))}
          {!stats.length && <div style={{ color: T.muted, fontSize:13, padding:'20px 0', textAlign:'center' }}>Aucune phrase ajoutée.</div>}
        </div>
      )}

      {/* Questions */}
      {!loading && tab === 1 && (
        <div style={{ background: T.card, borderRadius:16, padding:24, border:`1px solid ${T.border}` }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <div>
              <div style={{ fontWeight:700, fontSize:14 }}>Questions d'inspiration</div>
              <div style={{ fontSize:12, color: T.muted, marginTop:2 }}>{questions.filter(q=>q.actif!==false).length} questions actives</div>
            </div>
            <Btn size='sm' onClick={()=>{setAddValue('');setAddModal(true);}}>+ Ajouter</Btn>
          </div>
          {questions.map((q,i) => (
            <ItemRow key={i} active={q.actif!==false}
              onEdit={()=>setEditItem({type:'question',index:i,value:q.texte||q})}
              onDelete={()=>{setToDelete({type:'question',index:i});setConfirmDel(true);}}
              onToggle={()=>toggleQuestion(i)}>
              {q.texte||q}
            </ItemRow>
          ))}
          {!questions.length && <div style={{ color: T.muted, fontSize:13, padding:'20px 0', textAlign:'center' }}>Aucune question ajoutée.</div>}
        </div>
      )}

      {/* Types capsules */}
      {!loading && tab === 2 && (
        <div style={{ background: T.card, borderRadius:16, padding:24, border:`1px solid ${T.border}` }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:16 }}>Types de capsules</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:12 }}>
            {types.map(t => (
              <div key={t.id} style={{ background: T.elevated, borderRadius:12, padding:14, border:`1px solid ${t.actif?T.border:T.border+'40'}`, opacity: t.actif?1:0.5 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  <span style={{ fontSize:22 }}>{t.icon}</span>
                  <span style={{ fontWeight:700, fontSize:13, color: T.text }}>{t.nom}</span>
                  <div style={{ marginLeft:'auto' }}>
                    <Badge label={t.actif?'Actif':'Désactivé'} color={t.actif?'success':'muted'} />
                  </div>
                </div>
                <div style={{ fontSize:11, color: T.muted, marginBottom:8, fontFamily:'monospace' }}>{t.id}</div>
                <Btn size='sm' variant='ghost' onClick={()=>toggleType(t.id)} style={{ width:'100%' }}>
                  {t.actif ? '⏸ Désactiver' : '▶ Activer'}
                </Btn>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Textes app */}
      {!loading && tab === 3 && (
        <div style={{ background: T.card, borderRadius:16, padding:24, border:`1px solid ${T.border}` }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>Textes de l'application</div>
          <div style={{ fontSize:12, color: T.muted, marginBottom:20 }}>Modifiez les textes affichés aux utilisateurs. Sauvegarde automatique.</div>
          {TEXTES_KEYS.map(tk => (
            <div key={tk.key} style={{ marginBottom:16 }}>
              <Field label={tk.label}
                value={textes[tk.key] ?? tk.default}
                onChange={v => {
                  const next = { ...textes, [tk.key]: v };
                  setTextes(next);
                  save('textes_app', next);
                }}
                placeholder={tk.default} />
            </div>
          ))}
        </div>
      )}

      {/* Prix & Quotas */}
      {!loading && tab === 4 && (
        <div>
          <div style={{ background: T.card, borderRadius:16, padding:24, border:`1px solid ${T.border}`, marginBottom:16 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>Prix et quotas par formule</div>
            <div style={{ fontSize:12, color: T.muted, marginBottom:4, lineHeight:1.5 }}>
              Ces valeurs sont sauvegardées dans la table <code style={{ fontFamily:'monospace', background:T.elevated, padding:'1px 5px', borderRadius:4 }}>app_settings</code> sous la clé <code style={{ fontFamily:'monospace', background:T.elevated, padding:'1px 5px', borderRadius:4 }}>quotas_formules</code>.
            </div>
            <div style={{ fontSize:11, color: T.warning, marginBottom:20 }}>
              ⚠️ Modifier ces valeurs ici ne met pas à jour automatiquement les prix Stripe ni le code du webhook.
              Ces valeurs servent de référence d'affichage. Pour modifier les quotas réels, mettez aussi à jour le webhook Stripe.
            </div>
          </div>

          {Object.entries(FORMULES_LABELS).map(([formule, label]) => {
            const q = quotas[formule] || QUOTAS_DEFAUT[formule] || {};
            return (
              <div key={formule} style={{ background: T.card, borderRadius:16, padding:24, border:`1px solid ${T.border}`, marginBottom:12 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                  <div style={{ width:36, height:36, borderRadius:10, background:`${T.a2}18`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700, color:T.a2 }}>
                    {formule === 'gratuit' ? '🆓' : formule === 'occasion' ? '✨' : formule === 'mariage' ? '💍' : formule === 'naissance' ? '🍼' : '👴'}
                  </div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:14, color:T.text }}>{label}</div>
                    <div style={{ fontSize:11, color:T.muted }}>{q.prixLabel || '—'}</div>
                  </div>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12 }}>
                  {QUOTA_FIELDS.map(f => (
                    <div key={f.key}>
                      <label style={{ display:'block', fontSize:10, fontWeight:700, color:T.muted, marginBottom:5, letterSpacing:.5 }}>
                        {f.label.toUpperCase()}
                      </label>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <input
                          type="number" min={0}
                          value={q[f.key] ?? ''}
                          onChange={e => {
                            const next = {
                              ...quotas,
                              [formule]: { ...q, [f.key]: e.target.value === '' ? 0 : parseInt(e.target.value, 10) },
                            };
                            setQuotas(next);
                          }}
                          onBlur={() => save('quotas_formules', quotas)}
                          style={{ width:70, padding:'8px 10px', borderRadius:8, border:`1px solid ${T.border}`, background:T.elevated, color:T.text, fontFamily:T.ff_corps, fontSize:13, outline:'none' }}
                        />
                        <span style={{ fontSize:11, color:T.muted }}>{f.suffix}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modales */}
      <Modal open={addModal} onClose={()=>setAddModal(false)} title={tab===0?'Nouvelle phrase':'Nouvelle question'} width={460}>
        <Field label={tab===0?'Texte de la phrase':'Texte de la question'} value={addValue} onChange={setAddValue} multiline placeholder="…" />
        <Btn onClick={tab===0?addStat:addQuestion} disabled={!addValue}>Ajouter</Btn>
      </Modal>

      {editItem && editItem.type !== 'stat' && (
        <Modal open={true} onClose={()=>setEditItem(null)} title="Modifier" width={460}>
          <Field label="Texte" value={editItem.value} onChange={v=>setEditItem({...editItem,value:v})} multiline />
          <Btn onClick={()=>{
            if (editItem.type==='question') {
              const next = questions.map((q,i)=>i===editItem.index?{...q,texte:editItem.value}:q);
              setQuestions(next); save('questions_inspiration',next);
            }
            setEditItem(null);
          }}>Sauvegarder</Btn>
        </Modal>
      )}

      <ConfirmModal open={confirmDel} title="Supprimer cet élément ?" danger={true}
        message="Cet élément sera retiré de l'application."
        onConfirm={()=>{
          if (toDelete?.type==='stat') deleteStat(toDelete.index);
          if (toDelete?.type==='question') deleteQuestion(toDelete.index);
          setConfirmDel(false); setToDelete(null);
        }}
        onCancel={()=>{setConfirmDel(false);setToDelete(null);}} />
    </div>
  );
}
