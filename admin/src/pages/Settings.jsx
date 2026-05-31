// Section Paramètres — settings globaux, gestion admins, logs système
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { T, fmtDate, fmtRelative } from '../lib/utils';
import { SectionHeader, Btn, Badge, ConfirmModal, Field, Table, SkeletonCard } from '../components/ui';
import { useAdmin } from '../App';

const SETTINGS_DEFAULTS = {
  maintenance_mode:    'false',
  maintenance_message: 'L\'application est en maintenance. Revenez bientôt !',
  max_participants:    '20',
  max_contributions:   '100',
  max_file_size_mb:    '50',
  inscriptions_ouvertes: 'true',
  creation_capsules:     'true',
};

const TABS = ['Paramètres globaux', 'Admins', 'Logs système'];

function Toggle({ value, onChange, label, help }) {
  const on = value === 'true' || value === true;
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 0', borderBottom:`1px solid ${T.border}30` }}>
      <div>
        <div style={{ fontSize:13, fontWeight:600, color: T.text }}>{label}</div>
        {help && <div style={{ fontSize:11, color: T.muted, marginTop:2 }}>{help}</div>}
      </div>
      <button onClick={()=>onChange(!on)} style={{
        width:46, height:26, borderRadius:999, border:'none', cursor:'pointer',
        background: on ? T.a2 : T.border, transition:'background .2s', position:'relative', flexShrink:0,
      }}>
        <span style={{ position:'absolute', top:3, left: on?22:3, width:20, height:20, borderRadius:'50%', background:'#fff', transition:'left .2s', boxShadow:'0 1px 4px rgba(0,0,0,.3)' }} />
      </button>
    </div>
  );
}

export default function Settings() {
  const { user, logAction } = useAdmin();
  const [tab,      setTab]     = useState(0);
  const [settings, setSettings]= useState({...SETTINGS_DEFAULTS});
  const [admins,   setAdmins]  = useState([]);
  const [logs,     setLogs]    = useState([]);
  const [loading,  setLoading] = useState(true);
  const [newAdmin, setNewAdmin] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [toDeleteAdmin, setToDeleteAdmin] = useState(null);
  const [saved,    setSaved]   = useState(false);
  const [saving,   setSaving]  = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: settingsData }, { data: adminsData }, { data: logsData }] = await Promise.all([
      supabase.from('app_settings').select('key,value'),
      supabase.from('admins').select('id,email,created_at').order('created_at'),
      supabase.from('admin_logs').select('id,action,cible,details,created_at,admin_id,admins(email)').order('created_at',{ascending:false}).limit(100),
    ]);

    const map = Object.fromEntries((settingsData||[]).map(r=>[r.key,r.value]));
    setSettings({ ...SETTINGS_DEFAULTS, ...map });
    setAdmins(adminsData||[]);
    setLogs(logsData||[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function saveSetting(key, value) {
    setSaving(true);
    await supabase.from('app_settings').upsert({ key, value: String(value), updated_at: new Date().toISOString() }, { onConflict:'key' });
    await logAction('update_setting', key, { value: String(value) });
    setSettings(s => ({ ...s, [key]: String(value) }));
    setSaving(false);
    setSaved(true);
    setTimeout(()=>setSaved(false), 2000);
  }

  async function addAdmin() {
    if (!newAdmin.trim()) return;
    const { error } = await supabase.from('admins').insert({ email: newAdmin.trim() });
    if (error) { alert('Erreur : ' + error.message); return; }
    await logAction('add_admin', null, { email: newAdmin.trim() });
    setNewAdmin('');
    fetchAll();
  }

  async function deleteAdmin(admin) {
    if (admin.email === user.email) { alert('Impossible de vous supprimer vous-même.'); return; }
    await supabase.from('admins').delete().eq('id', admin.id);
    await logAction('remove_admin', admin.id, { email: admin.email });
    setConfirmDel(false);
    setToDeleteAdmin(null);
    fetchAll();
  }

  const ACTION_FR = {
    update_setting:'Paramètre modifié', add_admin:'Admin ajouté', remove_admin:'Admin supprimé',
    delete_contribution:'Souvenir supprimé', suspend_user:'Compte suspendu', delete_user:'Compte supprimé',
    force_open_capsule:'Capsule ouverte de force', delete_capsule:'Capsule supprimée',
    send_notification:'Notification envoyée', send_email:'Email envoyé',
    update_content:'Contenu modifié', signalement:'Signalement créé',
    ignore_signalement:'Signalement ignoré', warn_user:'Utilisateur averti',
    edit_capsule_date:'Date modifiée',
  };

  const logColumns = [
    { key:'created_at', label:'Date', render:v => fmtRelative(v) },
    { key:'action', label:'Action', render:v => <span style={{ fontSize:12, fontWeight:600 }}>{ACTION_FR[v]||v}</span> },
    { key:'admins', label:'Admin', render:v => <span style={{ fontSize:12, color:T.muted }}>{v?.email||'—'}</span> },
    { key:'cible', label:'Cible', render:v => v ? <span style={{ fontFamily:'monospace', fontSize:10, color:T.muted }}>{v.slice(0,16)}</span> : <span style={{color:T.muted}}>—</span> },
    { key:'details', label:'Détails', render:v => {
      try { const d=JSON.parse(v||'{}'); return <span style={{fontSize:11,color:T.muted}}>{Object.entries(d).map(([k,vv])=>`${k}:${vv}`).join(' · ')}</span>; }
      catch { return <span style={{color:T.muted}}>—</span>; }
    }, maxW:200 },
  ];

  const TABS_LIST = ['Paramètres globaux','Admins','Logs système'];

  return (
    <div>
      <SectionHeader title="Paramètres" subtitle="Configuration globale de l'application Blooom" icon="⊕">
        {saved && <span style={{ fontSize:12, color:T.success, fontWeight:700 }}>✓ Sauvegardé</span>}
        {saving && <span style={{ fontSize:12, color:T.warning }}>Sauvegarde…</span>}
      </SectionHeader>

      {/* Onglets */}
      <div style={{ display:'flex', gap:4, marginBottom:24, borderBottom:`1px solid ${T.border}` }}>
        {TABS_LIST.map((t,i) => (
          <button key={i} onClick={()=>setTab(i)}
            style={{ padding:'9px 18px', borderRadius:'8px 8px 0 0', border:'none', background:tab===i?T.card:'transparent', color:tab===i?T.a2:T.muted, cursor:'pointer', fontSize:13, fontWeight:tab===i?700:500, fontFamily:T.ff_corps, borderBottom:tab===i?`2px solid ${T.a2}`:'none' }}>
            {t}
          </button>
        ))}
      </div>

      {loading && <SkeletonCard rows={6} />}

      {/* Paramètres globaux */}
      {!loading && tab === 0 && (
        <div>
          {/* Mode maintenance */}
          <div style={{ background:T.card, borderRadius:16, padding:24, border:`1px solid ${settings.maintenance_mode==='true'?T.danger+'60':T.border}`, marginBottom:20 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:16, display:'flex', alignItems:'center', gap:10 }}>
              Mode maintenance
              {settings.maintenance_mode==='true' && <Badge label="ACTIF" color="danger" />}
            </div>
            <Toggle value={settings.maintenance_mode} label="Activer le mode maintenance"
              help="Affiche un message de maintenance aux utilisateurs et bloque l'accès à l'app."
              onChange={v=>saveSetting('maintenance_mode', v)} />
            {settings.maintenance_mode === 'true' && (
              <div style={{ marginTop:16 }}>
                <Field label="Message affiché aux utilisateurs"
                  value={settings.maintenance_message}
                  onChange={v=>saveSetting('maintenance_message',v)}
                  placeholder="L'application est en maintenance…" />
              </div>
            )}
          </div>

          {/* Accès */}
          <div style={{ background:T.card, borderRadius:16, padding:24, border:`1px solid ${T.border}`, marginBottom:20 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:16 }}>Accès</div>
            <Toggle value={settings.inscriptions_ouvertes} label="Nouvelles inscriptions"
              help="Désactiver bloque la création de nouveaux comptes."
              onChange={v=>saveSetting('inscriptions_ouvertes',v)} />
            <Toggle value={settings.creation_capsules} label="Création de capsules"
              help="Désactiver empêche les utilisateurs de créer de nouvelles capsules."
              onChange={v=>saveSetting('creation_capsules',v)} />
          </div>

          {/* Limites */}
          <div style={{ background:T.card, borderRadius:16, padding:24, border:`1px solid ${T.border}` }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:20 }}>Limites</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16 }}>
              {[
                { key:'max_participants',   label:'Max participants / capsule', suffix:'pers.' },
                { key:'max_contributions',  label:'Max souvenirs / capsule',    suffix:'souvenirs' },
                { key:'max_file_size_mb',   label:'Taille max des fichiers',    suffix:'Mo' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:T.muted, marginBottom:6, letterSpacing:.5 }}>
                    {f.label.toUpperCase()}
                  </label>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <input type="number" value={settings[f.key]||''} min={1}
                      onChange={e => setSettings(s=>({...s,[f.key]:e.target.value}))}
                      onBlur={e => saveSetting(f.key, e.target.value)}
                      style={{ width:80, padding:'9px 12px', borderRadius:10, border:`1px solid ${T.border}`, background:T.elevated, color:T.text, fontFamily:T.ff_corps, fontSize:14, outline:'none' }} />
                    <span style={{ fontSize:12, color:T.muted }}>{f.suffix}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Admins */}
      {!loading && tab === 1 && (
        <div>
          <div style={{ background:T.card, borderRadius:16, padding:24, border:`1px solid ${T.border}`, marginBottom:20 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:20 }}>Comptes administrateurs ({admins.length})</div>
            {admins.map(admin => (
              <div key={admin.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 0', borderBottom:`1px solid ${T.border}30` }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background:T.grad, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:14, color:'#fff', flexShrink:0 }}>
                  {admin.email.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:T.text }}>{admin.email}</div>
                  <div style={{ fontSize:11, color:T.muted }}>Ajouté le {fmtDate(admin.created_at)}</div>
                </div>
                {admin.email === user.email
                  ? <Badge label="Vous" color="success" />
                  : <Btn size='sm' variant='danger' onClick={()=>{setToDeleteAdmin(admin);setConfirmDel(true);}}>Retirer</Btn>
                }
              </div>
            ))}
          </div>

          <div style={{ background:T.card, borderRadius:16, padding:24, border:`1px solid ${T.border}` }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:16 }}>Ajouter un administrateur</div>
            <div style={{ display:'flex', gap:10 }}>
              <input value={newAdmin} onChange={e=>setNewAdmin(e.target.value)} placeholder="email@example.com" type="email"
                onKeyDown={e=>e.key==='Enter'&&addAdmin()}
                style={{ flex:1, padding:'10px 14px', borderRadius:10, border:`1px solid ${T.border}`, background:T.elevated, color:T.text, fontFamily:T.ff_corps, fontSize:13, outline:'none' }} />
              <Btn onClick={addAdmin} disabled={!newAdmin.includes('@')}>Ajouter</Btn>
            </div>
            <p style={{ fontSize:11, color:T.muted, marginTop:10 }}>
              L'utilisateur doit d'abord créer un compte Supabase Auth avec cet email avant d'être ajouté comme admin.
            </p>
          </div>
        </div>
      )}

      {/* Logs */}
      {!loading && tab === 2 && (
        <Table columns={logColumns} data={logs} loading={false} emptyMsg="Aucune action enregistrée" />
      )}

      <ConfirmModal open={confirmDel} title="Retirer cet administrateur ?" danger={true}
        message={`${toDeleteAdmin?.email} ne pourra plus accéder au backoffice. Il reste présent comme utilisateur Supabase.`}
        onConfirm={()=>deleteAdmin(toDeleteAdmin)}
        onCancel={()=>{setConfirmDel(false);setToDeleteAdmin(null);}} />
    </div>
  );
}
