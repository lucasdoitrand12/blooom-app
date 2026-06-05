// Section Codes promo — gestion des codes de réduction (5% à 100%)
// Table : codes_promo (créée dans migration 004_codes_promo.sql)
import React, { useState, useEffect, useCallback } from 'react';
import { supabase }                                  from '../lib/supabase';
import { T, fmtDate, fmtNum }                        from '../lib/utils';
import { SectionHeader, KPICard, Table, Badge, Btn,
         Modal, Field, ConfirmModal, Pagination }    from '../components/ui';
import { useAdmin }                                  from '../App';

const PAGE_SIZE = 50;

// Génère un code promo aléatoire alphanumérique 8 caractères
function genCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

const FORM_INIT = {
  code:            '',
  pourcentage:     '20',
  utilisations_max: '',
  expire_at:       '',
};

export default function CodesPromo() {
  const { logAction } = useAdmin();

  const [loading,  setLoading]  = useState(true);
  const [codes,    setCodes]    = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [kpi,      setKpi]      = useState(null);

  const [modalOpen,  setModalOpen]  = useState(false);
  const [form,       setForm]       = useState({ ...FORM_INIT, code: genCode() });
  const [saving,     setSaving]     = useState(false);
  const [formError,  setFormError]  = useState('');

  const [confirmDel, setConfirmDel] = useState(null); // id du code à supprimer
  const [toggling,   setToggling]   = useState(null); // id en cours de toggle

  const fetchAll = useCallback(async () => {
    setLoading(true);

    const { data, count } = await supabase
      .from('codes_promo')
      .select('*', { count:'exact' })
      .order('created_at', { ascending:false })
      .range((page-1)*PAGE_SIZE, page*PAGE_SIZE-1);

    const { data: tous } = await supabase
      .from('codes_promo')
      .select('id, actif, utilisations_actuelles');

    const actifs = (tous||[]).filter(c => c.actif);
    const totalUses = (tous||[]).reduce((s,c) => s + (c.utilisations_actuelles||0), 0);

    setCodes(data || []);
    setTotal(count || 0);
    setKpi({
      total:    count || 0,
      actifs:   actifs.length,
      inactifs: (tous||[]).length - actifs.length,
      totalUses,
    });
    setLoading(false);
  }, [page]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Créer un code ────────────────────────────────────────────────────────
  async function creer() {
    setFormError('');
    const pct = parseInt(form.pourcentage, 10);
    if (!form.code.trim())       { setFormError('Le code est obligatoire.'); return; }
    if (isNaN(pct) || pct < 5 || pct > 100) { setFormError('La réduction doit être entre 5% et 100%.'); return; }

    setSaving(true);
    const { error } = await supabase.from('codes_promo').insert({
      code:             form.code.trim().toUpperCase(),
      pourcentage:      pct,
      utilisations_max: form.utilisations_max ? parseInt(form.utilisations_max, 10) : null,
      expire_at:        form.expire_at || null,
      actif:            true,
    });

    if (error) {
      setSaving(false);
      setFormError(error.code === '23505' ? 'Ce code existe déjà.' : error.message);
      return;
    }

    await logAction('create_code_promo', form.code, { pourcentage: pct });
    setSaving(false);
    setModalOpen(false);
    setForm({ ...FORM_INIT, code: genCode() });
    fetchAll();
  }

  // ── Activer / désactiver un code ─────────────────────────────────────────
  async function toggleActif(code) {
    setToggling(code.id);
    await supabase.from('codes_promo')
      .update({ actif: !code.actif })
      .eq('id', code.id);
    await logAction(code.actif ? 'desactiver_code_promo' : 'activer_code_promo', code.id, { code: code.code });
    setToggling(null);
    fetchAll();
  }

  // ── Supprimer un code ────────────────────────────────────────────────────
  async function supprimer() {
    if (!confirmDel) return;
    await supabase.from('codes_promo').delete().eq('id', confirmDel.id);
    await logAction('delete_code_promo', confirmDel.id, { code: confirmDel.code });
    setConfirmDel(null);
    fetchAll();
  }

  // ── Export CSV ────────────────────────────────────────────────────────────
  function exportCSV() {
    const rows = [
      ['Code','Réduction (%)','Utilisations','Max','Actif','Expire le','Créé le'].join(','),
      ...codes.map(c => [
        c.code, c.pourcentage,
        c.utilisations_actuelles, c.utilisations_max ?? '∞',
        c.actif ? 'Oui' : 'Non',
        c.expire_at ? fmtDate(c.expire_at) : '—',
        fmtDate(c.created_at),
      ].join(',')),
    ].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(rows);
    a.download = `codes_promo_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }

  const columns = [
    { key:'code', label:'Code',
      render: v => (
        <span style={{ fontFamily:'monospace', fontWeight:700, fontSize:14, color:T.a2,
          background:`${T.a2}12`, padding:'3px 8px', borderRadius:6 }}>
          {v}
        </span>
      )},
    { key:'pourcentage', label:'Réduction',
      render: v => (
        <span style={{ fontWeight:700, fontSize:14, color: v === 100 ? T.success : T.text }}>
          {v}%{v === 100 ? ' (gratuit)' : ''}
        </span>
      )},
    { key:'utilisations_actuelles', label:'Utilisations',
      render: (v, row) => (
        <span style={{ fontSize:13 }}>
          {fmtNum(v)}
          {row.utilisations_max != null && (
            <span style={{ color:T.muted }}> / {fmtNum(row.utilisations_max)}</span>
          )}
          {row.utilisations_max == null && (
            <span style={{ color:T.muted }}> / ∞</span>
          )}
        </span>
      )},
    { key:'expire_at', label:'Expire le',
      render: v => {
        if (!v) return <span style={{ color:T.muted }}>Jamais</span>;
        const expired = new Date(v) < new Date();
        return <span style={{ color: expired ? T.danger : T.text }}>{fmtDate(v)}</span>;
      }},
    { key:'actif', label:'Statut',
      render: (v, row) => {
        const maxReached = row.utilisations_max != null && row.utilisations_actuelles >= row.utilisations_max;
        const expired = row.expire_at && new Date(row.expire_at) < new Date();
        if (!v)          return <Badge label="Désactivé"  color="muted" />;
        if (maxReached)  return <Badge label="Épuisé"     color="warning" />;
        if (expired)     return <Badge label="Expiré"     color="danger" />;
        return <Badge label="Actif" color="success" />;
      }},
    { key:'id', label:'Actions',
      render: (_, row) => (
        <div style={{ display:'flex', gap:6 }}>
          <Btn size="sm" variant="ghost"
            disabled={toggling === row.id}
            onClick={e => { e.stopPropagation(); toggleActif(row); }}
            style={{ color: row.actif ? T.warning : T.success }}>
            {toggling === row.id ? '…' : row.actif ? '⏸ Désactiver' : '▶ Activer'}
          </Btn>
          <Btn size="sm" variant="danger"
            onClick={e => { e.stopPropagation(); setConfirmDel(row); }}>
            ✕
          </Btn>
        </div>
      )},
  ];

  return (
    <div>
      <SectionHeader title="Codes promo" subtitle="Réductions applicables à l'achat de n'importe quel pack (5% à 100%)" icon="🏷️">
        <Btn variant="secondary" size="sm" onClick={exportCSV}>⬇ CSV</Btn>
        <Btn variant="secondary" size="sm" onClick={fetchAll}>↻ Actualiser</Btn>
        <Btn variant="primary" size="sm" onClick={() => {
          setForm({ ...FORM_INIT, code: genCode() });
          setFormError('');
          setModalOpen(true);
        }}>
          + Créer un code
        </Btn>
      </SectionHeader>

      {/* KPIs */}
      <div style={{ display:'flex', gap:14, marginBottom:24, flexWrap:'wrap' }}>
        <KPICard icon="🏷️" label="Total codes"    value={kpi ? fmtNum(kpi.total)    : '—'} loading={loading} />
        <KPICard icon="✅" label="Codes actifs"   value={kpi ? fmtNum(kpi.actifs)   : '—'} loading={loading} />
        <KPICard icon="⏸" label="Codes inactifs" value={kpi ? fmtNum(kpi.inactifs) : '—'} loading={loading} />
        <KPICard icon="📊" label="Total utilisations" value={kpi ? fmtNum(kpi.totalUses) : '—'} loading={loading}
          help="Somme de toutes les utilisations de codes promo depuis la création du service." />
      </div>

      {/* Table */}
      <Table columns={columns} data={codes} loading={loading} emptyMsg="Aucun code promo créé." />
      <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />

      {/* ── Modale création ───────────────────────────────────────────────── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Créer un code promo">
        <div style={{ display:'flex', gap:10, alignItems:'flex-end', marginBottom:4 }}>
          <div style={{ flex:1 }}>
            <Field label="CODE (alphanumérique)"
              value={form.code}
              onChange={v => setForm(f => ({ ...f, code: v.toUpperCase() }))}
              placeholder="ex : BLOOOOM20" />
          </div>
          <Btn variant="ghost" size="sm" onClick={() => setForm(f => ({ ...f, code: genCode() }))}
            style={{ marginBottom:4, flexShrink:0 }}>
            ↻ Générer
          </Btn>
        </div>

        {/* Sélecteur de pourcentage */}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:12, fontWeight:700, color:T.muted, marginBottom:8, letterSpacing:.5 }}>
            RÉDUCTION
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {[10, 20, 30, 50, 75, 100].map(pct => (
              <button key={pct}
                onClick={() => setForm(f => ({ ...f, pourcentage: String(pct) }))}
                style={{
                  padding:'8px 14px', borderRadius:8, cursor:'pointer',
                  border:`1px solid ${form.pourcentage === String(pct) ? T.a2 : T.border}`,
                  background: form.pourcentage === String(pct) ? `${T.a2}18` : 'transparent',
                  color: form.pourcentage === String(pct) ? T.a2 : T.muted,
                  fontFamily:T.ff_corps, fontSize:13, fontWeight: form.pourcentage === String(pct) ? 700 : 500,
                  transition:'all .15s',
                }}>
                {pct}%{pct === 100 ? ' (gratuit)' : ''}
              </button>
            ))}
          </div>
          <div style={{ marginTop:10 }}>
            <Field label="OU SAISIR UN POURCENTAGE PERSONNALISÉ (5–100)"
              value={form.pourcentage}
              onChange={v => setForm(f => ({ ...f, pourcentage: v }))}
              placeholder="20" />
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <Field label="MAX UTILISATIONS (vide = illimité)"
            value={form.utilisations_max}
            onChange={v => setForm(f => ({ ...f, utilisations_max: v }))}
            placeholder="ex : 100" />
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:T.muted, marginBottom:6, letterSpacing:.5 }}>
              DATE D'EXPIRATION (optionnel)
            </label>
            <input type="date" value={form.expire_at}
              onChange={e => setForm(f => ({ ...f, expire_at: e.target.value }))}
              style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:`1px solid ${T.border}`,
                background:T.elevated, color:T.text, fontFamily:T.ff_corps, fontSize:13, outline:'none' }} />
          </div>
        </div>

        {formError && (
          <div style={{ background:`${T.danger}18`, border:`1px solid ${T.danger}40`, borderRadius:8,
            padding:'10px 14px', fontSize:12, color:T.danger, marginTop:8 }}>
            {formError}
          </div>
        )}

        <div style={{ display:'flex', gap:10, marginTop:16 }}>
          <Btn variant="secondary" onClick={() => setModalOpen(false)} style={{ flex:1 }}>Annuler</Btn>
          <Btn variant="primary" onClick={creer} disabled={saving} style={{ flex:1 }}>
            {saving ? 'Création…' : '✓ Créer le code'}
          </Btn>
        </div>
      </Modal>

      {/* ── Confirmation suppression ─────────────────────────────────────── */}
      <ConfirmModal
        open={!!confirmDel}
        title="Supprimer ce code promo ?"
        danger={true}
        message={`Le code "${confirmDel?.code}" sera supprimé définitivement. Les utilisateurs qui l'ont déjà utilisé ne sont pas affectés.`}
        onConfirm={supprimer}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}
