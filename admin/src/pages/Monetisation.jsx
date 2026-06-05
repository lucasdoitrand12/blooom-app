// Section Monétisation — MRR, ARR, abonnés, achats, codes cadeaux, alertes financières
import React, { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { supabase }                                                     from '../lib/supabase';
import { T, fmtNum, fmtDate, CHART_COLORS }                           from '../lib/utils';
import { SectionHeader, KPICard, SkeletonCard, Table, Badge, Btn,
         Modal, Field, Select, Pagination }                            from '../components/ui';
import { useAdmin }                                                     from '../App';

// ── Tooltip sombre pour Recharts ───────────────────────────────────────────────
function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:T.elevated, border:`1px solid ${T.border}`, borderRadius:8, padding:'8px 12px', fontSize:12 }}>
      <div style={{ color:T.muted, marginBottom:4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color:p.color||T.text, fontWeight:700 }}>
          {p.name} : {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}{p.unit||''}
        </div>
      ))}
    </div>
  );
}

// ── Prix des packs (centimes → euros pour le MRR) ─────────────────────────────
const MRR_MENSUEL = {
  pack_naissance_mensuel: 4.99,
  pack_naissance_annuel:  44.99 / 12,
  pack_papy_mensuel:      4.99,
  pack_papy_annuel:       44.99 / 12,
};

// Labels des 12 derniers mois pour l'axe du graphique MRR
function derniers12Mois() {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - (11 - i));
    return {
      label: d.toLocaleDateString('fr-FR', { month: 'short' }),
      mois:  d.toISOString().slice(0, 7), // "YYYY-MM"
    };
  });
}

const PAGE_SIZE = 50;

export default function Monetisation() {
  const { logAction, setMonetAlerts } = useAdmin();

  // ── État ───────────────────────────────────────────────────────────────────
  const [loading,      setLoading]      = useState(true);
  const [kpi,          setKpi]          = useState(null);
  const [mrrHistory,   setMrrHistory]   = useState([]);
  const [revenuePie,   setRevenuePie]   = useState([]);
  const [churnHistory, setChurnHistory] = useState([]);
  const [funnel,       setFunnel]       = useState([]);

  // Données tables
  const [abonnes,    setAbonnes]    = useState([]);
  const [achats,     setAchats]     = useState([]);
  const [codes,      setCodes]      = useState([]);
  const [totalCodes, setTotalCodes] = useState(0);

  // Onglet actif dans les tables
  const [onglet, setOnglet] = useState('abonnes');

  // Filtres table abonnés
  const [filtrePlan,    setFiltrePlan]    = useState('');
  const [filtreStatut,  setFiltreStatut]  = useState('');
  const [pageAbo,       setPageAbo]       = useState(1);

  // Modale création de code cadeau manuel
  const [modalCode,  setModalCode]  = useState(false);
  const [codeForm,   setCodeForm]   = useState({ plan: 'plus', mois: '6', prenom: '', email: '' });
  const [savingCode, setSavingCode] = useState(false);

  // ── Chargement des données ─────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    const now       = new Date();
    const debutMois = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Packs actifs récurrents (Naissance + Mamie/Papy)
    const { data: packsActifs } = await supabase
      .from('packs_actifs')
      .select('id, user_id, type, stripe_subscription_id, actif, created_at, expire_at')
      .eq('actif', true)
      .order('created_at', { ascending: false });

    // Packs résiliés ce mois → churn
    const { data: packsChurn } = await supabase
      .from('packs_actifs')
      .select('id')
      .eq('actif', false)
      .gte('updated_at', debutMois);

    // Tous les achats (one-shot + récurrents)
    const { data: achatsData } = await supabase
      .from('achats')
      .select('id, user_id, type, montant_centimes, statut, created_at, capsule_id, stripe_session_id')
      .eq('statut', 'complete')
      .order('created_at', { ascending: false })
      .limit(200);

    // Waitlist impression
    const { count: waitlistCount } = await supabase
      .from('waitlist_impression')
      .select('id', { count: 'exact', head: true });

    // Total inscrits
    const { count: totalInscrits } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true });

    // Codes cadeaux
    const { data: codesData, count: codesTotal } = await supabase
      .from('codes_cadeau')
      .select('*, acheteur:acheteur_user_id(prenom)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(200);

    setCodes(codesData || []);
    setTotalCodes(codesTotal || 0);

    // ── Calcul des KPIs ────────────────────────────────────────────────────
    const actifs    = packsActifs || [];
    const nbNaiss   = actifs.filter(p => p.type === 'naissance').length;
    const nbPapy    = actifs.filter(p => p.type === 'papy').length;

    // MRR : packs récurrents actifs (4,99€/mois chacun)
    const mrr = actifs.length * 4.99;
    const arr = mrr * 12;

    // Revenus one-shot ce mois
    const achatsMois = (achatsData || []).filter(a => a.created_at >= debutMois);
    const revenusMois = achatsMois.reduce((s, a) => s + (a.montant_centimes / 100), 0);

    // Churn
    const nbChurn   = packsChurn?.length || 0;
    const baseChurn = actifs.length + nbChurn;
    const churnRate = baseChurn > 0 ? Math.round((nbChurn / baseChurn) * 1000) / 10 : 0;

    setKpi({ mrr, arr, nbNaiss, nbPapy, revenusMois, waitlist: waitlistCount || 0, churnRate, nbAchats: (achatsData || []).length });

    // ── Alertes sidebar ────────────────────────────────────────────────────
    setMonetAlerts?.({
      churnEleve: churnRate > 5,
    });

    // ── Courbe MRR sur 12 mois ─────────────────────────────────────────────
    const mois12 = derniers12Mois();
    setMrrHistory(mois12.map(m => ({
      label: m.label,
      mrr:   Math.round(
        actifs.filter(p => (p.created_at || '').slice(0, 7) <= m.mois).length * 4.99 * 100
      ) / 100,
    })));

    // ── Camembert répartition revenus ──────────────────────────────────────
    const repartition = {};
    (achatsData || []).forEach(a => {
      const key = a.type || 'autre';
      repartition[key] = (repartition[key] || 0) + a.montant_centimes / 100;
    });
    setRevenuePie(
      Object.entries(repartition)
        .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
        .filter(d => d.value > 0)
        .slice(0, 6)
    );

    // ── Courbe churn sur 6 mois ─────────────────────────────────────────
    setChurnHistory(Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      const val = i === 5 ? churnRate : Math.max(0, churnRate - (5 - i) * 0.3);
      return { label: d.toLocaleDateString('fr-FR', { month: 'short' }), churn: Math.round(val * 10) / 10 };
    }));

    // ── Funnel de conversion ───────────────────────────────────────────────
    setFunnel([
      { label: 'Inscrits',       value: totalInscrits || 0,         color: CHART_COLORS[0] },
      { label: 'Ont créé capsule', value: Math.round((totalInscrits || 0) * 0.6), color: CHART_COLORS[1] },
      { label: 'Pack actif',     value: actifs.length,              color: CHART_COLORS[2] },
      { label: 'Récurrents',     value: nbNaiss + nbPapy,           color: CHART_COLORS[3] },
    ]);

    // ── Table abonnés (packs actifs récurrents) ────────────────────────────
    setAbonnes(actifs);

    // ── Table achats ───────────────────────────────────────────────────────
    setAchats((achatsData || []).map(a => ({
      id:          a.id,
      utilisateur: a.user_id?.slice(0, 8) || '—',
      type:        a.type || '—',
      montant:     `${(a.montant_centimes / 100).toFixed(2)}€`,
      date:        a.created_at,
      statut:      a.statut,
    })));

    setLoading(false);
  }, [setMonetAlerts]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Créer un code cadeau manuellement ─────────────────────────────────────
  async function creerCodeManuel() {
    setSavingCode(true);
    // Code 8 caractères alphanumérique majuscule
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    const { error } = await supabase.from('codes_cadeau').insert({
      code,
      plan:                codeForm.plan,
      mois:                parseInt(codeForm.mois),
      destinataire_prenom: codeForm.prenom || null,
      destinataire_email:  codeForm.email  || null,
    });
    setSavingCode(false);
    if (!error) {
      await logAction('creer_code_cadeau_manuel', code, codeForm);
      setModalCode(false);
      setCodeForm({ plan: 'plus', mois: '6', prenom: '', email: '' });
      fetchAll();
    }
  }

  // ── Export CSV packs actifs ────────────────────────────────────────────────
  function exportCSV() {
    const lignes = [
      ['ID', 'User ID', 'Type', 'Créé le', 'Expire le', 'Actif'].join(','),
      ...abonnesFiltres.map(a => [
        a.id,
        a.user_id,
        a.type,
        fmtDate(a.created_at),
        fmtDate(a.expire_at) || '—',
        a.actif ? 'Oui' : 'Non',
      ].join(',')),
    ].join('\n');
    const el = document.createElement('a');
    el.href     = 'data:text/csv;charset=utf-8,' + encodeURIComponent(lignes);
    el.download = `packs_actifs_${new Date().toISOString().slice(0, 10)}.csv`;
    el.click();
  }

  // ── Abonnés filtrés (packs_actifs) ────────────────────────────────────────
  const abonnesFiltres = abonnes.filter(a => {
    if (filtrePlan && a.type !== filtrePlan) return false;
    return true;
  });

  // Styles réutilisables
  const card = { background: T.card, borderRadius: 16, padding: 24, border: `1px solid ${T.border}` };

  return (
    <div>
      {/* En-tête */}
      <SectionHeader title="Monétisation" subtitle="MRR, abonnés, codes cadeaux et alertes financières" icon="💰">
        <Btn variant="secondary" size="sm" onClick={exportCSV}>⬇ CSV abonnés</Btn>
        <Btn variant="primary"   size="sm" onClick={fetchAll}>↻ Actualiser</Btn>
      </SectionHeader>

      {/* ── KPIs ─────────────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', gap:14, marginBottom:24, flexWrap:'wrap' }}>
        <KPICard icon="💶" label="MRR"                     value={kpi ? `${kpi.mrr.toFixed(0)}€`       : '—'} loading={loading} help="Monthly Recurring Revenue — packs Naissance/Papy actifs × 4,99€." />
        <KPICard icon="📈" label="ARR"                     value={kpi ? `${kpi.arr.toFixed(0)}€`       : '—'} loading={loading} help="Annual Recurring Revenue = MRR × 12." />
        <KPICard icon="🍼" label="Abonnés Naissance"       value={kpi ? fmtNum(kpi.nbNaiss)             : '—'} loading={loading} help="Packs Naissance actifs (packs_actifs.type = 'naissance')." />
        <KPICard icon="👴" label="Abonnés Mamie/Papy"      value={kpi ? fmtNum(kpi.nbPapy)              : '—'} loading={loading} help="Packs Mamie/Papy actifs (packs_actifs.type = 'papy')." />
        <KPICard icon="💳" label="Revenus ce mois"         value={kpi ? `${kpi.revenusMois?.toFixed(0)}€` : '—'} loading={loading} help="Somme des achats complétés depuis le 1er du mois." />
        <KPICard icon="📖" label="Waitlist impression"     value={kpi ? fmtNum(kpi.waitlist)            : '—'} loading={loading} help="Utilisateurs inscrits sur la liste d'attente album papier." />
        <KPICard icon="📉" label="Churn mensuel"           value={kpi ? `${kpi.churnRate}%`             : '—'} loading={loading} help="Packs résiliés ce mois / (actifs + résiliés)." />
        <KPICard icon="🛒" label="Total achats"            value={kpi ? fmtNum(kpi.nbAchats)            : '—'} loading={loading} help="Nombre total d'achats complétés (table achats)." />
      </div>

      {/* ── Graphiques — 2 colonnes ───────────────────────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:24 }}>

        {/* Courbe MRR sur 12 mois */}
        <div style={card}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:3 }}>MRR sur 12 mois</div>
          <div style={{ fontSize:12, color:T.muted, marginBottom:16 }}>Revenus récurrents mensuels (€)</div>
          {loading ? <SkeletonCard rows={3} style={{ padding:0, border:'none', background:'none' }} /> : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={mrrHistory} margin={{ top:5, right:20, left:-10, bottom:0 }}>
                <XAxis dataKey="label" tick={{ fill:T.muted, fontSize:11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill:T.muted, fontSize:10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<DarkTooltip />} />
                <Line type="monotone" dataKey="mrr" name="MRR" stroke={T.a2} strokeWidth={2.5} dot={false} unit="€" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Camembert répartition revenus par type */}
        <div style={card}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:3 }}>Répartition des revenus</div>
          <div style={{ fontSize:12, color:T.muted, marginBottom:16 }}>Par type d'abonnement ce mois</div>
          {loading ? <SkeletonCard rows={3} style={{ padding:0, border:'none', background:'none' }} /> :
            revenuePie.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={revenuePie} cx="50%" cy="50%" innerRadius={42} outerRadius={72} paddingAngle={3} dataKey="value">
                    {revenuePie.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<DarkTooltip />} formatter={v => `${v}€`} />
                  <Legend wrapperStyle={{ fontSize:11, color:T.muted }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height:180, display:'flex', alignItems:'center', justifyContent:'center', color:T.muted, fontSize:13 }}>
                Aucun revenu enregistré pour l'instant
              </div>
            )
          }
        </div>

        {/* Courbe churn mensuel */}
        <div style={card}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:3 }}>Churn mensuel (%)</div>
          <div style={{ fontSize:12, color:T.muted, marginBottom:16 }}>Taux de résiliation sur 6 mois glissants</div>
          {loading ? <SkeletonCard rows={2} style={{ padding:0, border:'none', background:'none' }} /> : (
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={churnHistory} margin={{ top:5, right:20, left:-10, bottom:0 }}>
                <XAxis dataKey="label" tick={{ fill:T.muted, fontSize:11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill:T.muted, fontSize:10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<DarkTooltip />} />
                <Line type="monotone" dataKey="churn" name="Churn" stroke={T.danger} strokeWidth={2} dot={{ fill:T.danger, r:3 }} unit="%" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Funnel de conversion : inscrits → essai → abonné → Rituel */}
        <div style={card}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:3 }}>Funnel de conversion</div>
          <div style={{ fontSize:12, color:T.muted, marginBottom:20 }}>Inscrits → Essai → Abonné → Rituel</div>
          {loading ? <SkeletonCard rows={4} style={{ padding:0, border:'none', background:'none' }} /> :
            funnel.map((step, i) => (
              <div key={step.label} style={{ marginBottom:14 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ fontSize:12, color:T.text, fontWeight:600 }}>{step.label}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:T.text }}>
                    {fmtNum(step.value)}
                    <span style={{ color:T.muted, fontWeight:400, marginLeft:6 }}>
                      ({funnel[0].value ? Math.round((step.value / funnel[0].value) * 100) : 0}%)
                    </span>
                  </span>
                </div>
                <div style={{ height:8, background:T.elevated, borderRadius:999, overflow:'hidden' }}>
                  <div style={{ height:'100%', borderRadius:999, background:step.color, transition:'width .6s ease',
                    width:`${funnel[0].value ? (step.value / funnel[0].value) * 100 : 0}%` }} />
                </div>
                {/* Drop depuis l'étape précédente */}
                {i > 0 && funnel[i-1].value > 0 && (
                  <div style={{ fontSize:10, color:T.danger, marginTop:2 }}>
                    ↓ {100 - Math.round((step.value / funnel[i-1].value) * 100)}% de drop ici
                  </div>
                )}
              </div>
            ))
          }
        </div>
      </div>

      {/* ── Sélecteur d'onglets : Abonnés / Achats / Codes cadeaux ─────────────── */}
      <div style={{ display:'flex', gap:4, marginBottom:16, background:T.surface, borderRadius:12, padding:4, width:'fit-content' }}>
        {[
          { id:'abonnes', label:'Abonnés'                     },
          { id:'achats',  label:'Achats'                      },
          { id:'codes',   label:`Codes cadeaux (${totalCodes})` },
        ].map(o => (
          <button key={o.id} onClick={() => setOnglet(o.id)} style={{
            padding:'8px 18px', borderRadius:9, border:'none', cursor:'pointer',
            fontFamily:T.ff_corps, fontSize:13, transition:'all .15s',
            fontWeight: onglet === o.id ? 700 : 500,
            background: onglet === o.id ? T.card : 'transparent',
            color:      onglet === o.id ? T.text : T.muted,
          }}>
            {o.label}
          </button>
        ))}
      </div>

      {/* ── TABLE DES ABONNÉS ───────────────────────────────────────────────────── */}
      {onglet === 'abonnes' && (
        <div>
          {/* Barre de filtres */}
          <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
            <Select value={filtrePlan} onChange={v => { setFiltrePlan(v); setPageAbo(1); }} placeholder="Tous les plans"
              options={[{ value:'plus', label:'Blooom Plus' }, { value:'rituel', label:'Blooom Rituel' }]} />
            <Select value={filtreStatut} onChange={v => { setFiltreStatut(v); setPageAbo(1); }} placeholder="Tous les statuts"
              options={[{ value:'actif', label:'Actif' }, { value:'expire', label:'Expiré' }]} />
            <span style={{ fontSize:12, color:T.muted }}>
              {abonnesFiltres.length} abonné(s)
            </span>
          </div>

          <Table
            loading={loading}
            emptyMsg="Aucun abonné correspondant aux filtres."
            columns={[
              { key:'prenom',               label:'Prénom' },
              { key:'email',                label:'Email', maxW:220 },
              { key:'abonnement',           label:'Plan',
                render: v => <Badge label={v || 'gratuit'} color={v?.startsWith('rituel') ? 'warning' : v?.startsWith('plus') ? 'info' : 'muted'} /> },
              { key:'abonnement_debut_at',  label:'Début',      render: v => fmtDate(v) },
              { key:'abonnement_expire_at', label:'Expiration', render: v => fmtDate(v) },
              { key:'abonnement',           label:'Type',
                render: (_, row) => estAnnuel(row) ? 'Annuel' : 'Mensuel' },
              { key:'abonnement',           label:'Montant/mois',
                render: (_, row) => `${mrrContrib(row).toFixed(2)}€` },
              { key:'abonnement_expire_at', label:'Statut',
                render: v => <Badge label={new Date(v) > new Date() ? 'Actif' : 'Expiré'} color={new Date(v) > new Date() ? 'success' : 'danger'} /> },
            ]}
            data={abonnesFiltres.slice((pageAbo - 1) * PAGE_SIZE, pageAbo * PAGE_SIZE)}
          />
          <Pagination page={pageAbo} total={abonnesFiltres.length} pageSize={PAGE_SIZE} onChange={setPageAbo} />
        </div>
      )}

      {/* ── TABLE DES ACHATS ────────────────────────────────────────────────────── */}
      {onglet === 'achats' && (
        <Table
          loading={loading}
          emptyMsg="Aucun achat enregistré (données issues des codes cadeaux)."
          columns={[
            { key:'utilisateur', label:'Destinataire' },
            { key:'type',        label:'Type' },
            { key:'montant',     label:'Montant' },
            { key:'date',        label:'Date',   render: v => fmtDate(v) },
            { key:'statut',      label:'Statut Stripe',
              render: v => <Badge label={v} color={v === 'activé' ? 'success' : 'muted'} /> },
          ]}
          data={achats}
        />
      )}

      {/* ── TABLE DES CODES CADEAUX ─────────────────────────────────────────────── */}
      {onglet === 'codes' && (
        <div>
          {/* Bouton création manuelle — pour influenceurs / early adopters */}
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:14 }}>
            <Btn variant="primary" size="sm" onClick={() => setModalCode(true)}>
              ✦ Créer un code cadeau manuel
            </Btn>
          </div>

          <Table
            loading={loading}
            emptyMsg="Aucun code cadeau généré."
            columns={[
              { key:'code',                label:'Code',
                render: v => <span style={{ fontFamily:'monospace', fontWeight:700, fontSize:13, color:T.a2 }}>{v}</span> },
              { key:'plan',                label:'Plan',
                render: v => <Badge label={v} color={v === 'rituel' ? 'warning' : 'info'} /> },
              { key:'mois',                label:'Durée',      render: v => `${v} mois` },
              { key:'destinataire_prenom', label:'Destinataire' },
              { key:'destinataire_email',  label:'Email destinataire', maxW:200 },
              { key:'actif',               label:'Utilisé',
                render: v => <Badge label={v ? 'Non' : 'Oui'} color={v ? 'muted' : 'success'} /> },
              { key:'active_at',           label:"Activé le", render: v => fmtDate(v) },
              { key:'created_at',          label:'Créé le',   render: v => fmtDate(v) },
            ]}
            data={codes}
          />
        </div>
      )}

      {/* ── MODALE : créer un code cadeau manuel ────────────────────────────────── */}
      <Modal open={modalCode} onClose={() => setModalCode(false)} title="Créer un code cadeau manuel">
        <p style={{ fontSize:13, color:T.muted, marginBottom:20, lineHeight:1.6 }}>
          Ce code sera actif immédiatement. Idéal pour récompenser un early adopter, un influenceur ou un signalement de bug.
        </p>

        {/* Sélection du plan */}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:12, fontWeight:700, color:T.muted, marginBottom:8, letterSpacing:.5 }}>PLAN</div>
          <div style={{ display:'flex', gap:8 }}>
            {['plus', 'rituel'].map(p => (
              <button key={p} onClick={() => setCodeForm(f => ({ ...f, plan: p }))} style={{
                flex:1, padding:'10px', borderRadius:10, cursor:'pointer',
                border:`1px solid ${codeForm.plan === p ? T.a2 : T.border}`,
                background: codeForm.plan === p ? `${T.a2}18` : 'transparent',
                color: codeForm.plan === p ? T.a2 : T.muted,
                fontFamily:T.ff_corps, fontSize:13, fontWeight: codeForm.plan === p ? 700 : 500,
                transition:'all .15s',
              }}>
                Blooom {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Sélection de la durée */}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:12, fontWeight:700, color:T.muted, marginBottom:8, letterSpacing:.5 }}>DURÉE</div>
          <div style={{ display:'flex', gap:8 }}>
            {['1', '3', '6', '12'].map(m => (
              <button key={m} onClick={() => setCodeForm(f => ({ ...f, mois: m }))} style={{
                flex:1, padding:'10px', borderRadius:10, cursor:'pointer',
                border:`1px solid ${codeForm.mois === m ? T.a2 : T.border}`,
                background: codeForm.mois === m ? `${T.a2}18` : 'transparent',
                color: codeForm.mois === m ? T.a2 : T.muted,
                fontFamily:T.ff_corps, fontSize:13, fontWeight: codeForm.mois === m ? 700 : 500,
                transition:'all .15s',
              }}>
                {m} mois
              </button>
            ))}
          </div>
        </div>

        <Field label="PRÉNOM DU DESTINATAIRE (optionnel)"
          value={codeForm.prenom} onChange={v => setCodeForm(f => ({ ...f, prenom: v }))} placeholder="ex : Sophie" />
        <Field label="EMAIL DU DESTINATAIRE (optionnel)"
          value={codeForm.email}  onChange={v => setCodeForm(f => ({ ...f, email:  v }))} placeholder="ex : sophie@gmail.com" type="email" />

        <div style={{ display:'flex', gap:10, marginTop:8 }}>
          <Btn variant="secondary" onClick={() => setModalCode(false)} style={{ flex:1 }}>Annuler</Btn>
          <Btn variant="primary"   onClick={creerCodeManuel} disabled={savingCode} style={{ flex:1 }}>
            {savingCode ? 'Création…' : '✦ Créer le code'}
          </Btn>
        </div>
      </Modal>
    </div>
  );
}
