// Section Parrainage — statistiques et tableau des parrainages
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { T, fmtDate, fmtNum, fmtRelative } from '../lib/utils';
import { SectionHeader, KPICard, SkeletonCard } from '../components/ui';

// ──────────────────────────────────────────────────────────────
// Barre de progression pour le taux de conversion
// ──────────────────────────────────────────────────────────────
function BarreConversion({ pct }) {
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ height: 8, background: T.elevated, borderRadius: 999, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${Math.min(pct, 100)}%`,
          background: T.grad,
          borderRadius: 999,
          transition: 'width .6s ease',
        }} />
      </div>
      <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>{pct}% de taux de conversion</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Badge converti / en attente
// ──────────────────────────────────────────────────────────────
function BadgeStatut({ converti }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 700,
      background: converti ? `${T.success}22` : `${T.muted}22`,
      color: converti ? T.success : T.muted,
    }}>
      {converti ? '✓ Converti' : '⏳ En attente'}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────
// Composant principal
// ──────────────────────────────────────────────────────────────
export default function Parrainage() {
  const [stats,        setStats]        = useState(null);
  const [topParrains,  setTopParrains]  = useState([]);
  const [parrainages,  setParrainages]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [recherche,    setRecherche]    = useState('');

  const cardStyle = { background: T.card, borderRadius: 16, padding: 24, border: `1px solid ${T.border}` };

  const fetchAll = useCallback(async () => {
    setLoading(true);

    // Charge tous les parrainages avec les profils associés
    const { data: rows } = await supabase
      .from('parrainages')
      .select(`
        id, created_at, converti, converti_at,
        parrain:parrain_id (id, prenom, code_parrain),
        filleul:filleul_id (id, prenom)
      `)
      .order('created_at', { ascending: false });

    if (!rows) { setLoading(false); return; }

    // Métriques globales
    const total     = rows.length;
    const convertis = rows.filter(r => r.converti).length;
    const taux      = total > 0 ? Math.round((convertis / total) * 100) : 0;

    // Période 7 jours
    const depuis7j  = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const total7j   = rows.filter(r => r.created_at >= depuis7j).length;
    const conv7j    = rows.filter(r => r.converti && r.converti_at >= depuis7j).length;

    setStats({ total, convertis, taux, total7j, conv7j });

    // Top 10 parrains par nombre de filleuls convertis
    const byParrain = {};
    rows.forEach(r => {
      const pid = r.parrain?.id;
      if (!pid) return;
      if (!byParrain[pid]) byParrain[pid] = { parrain: r.parrain, total: 0, convertis: 0 };
      byParrain[pid].total++;
      if (r.converti) byParrain[pid].convertis++;
    });
    const top = Object.values(byParrain)
      .sort((a, b) => b.convertis - a.convertis || b.total - a.total)
      .slice(0, 10);
    setTopParrains(top);

    setParrainages(rows);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Filtrage du tableau par prénom
  const parrainagesFiltres = parrainages.filter(r => {
    if (!recherche.trim()) return true;
    const q = recherche.toLowerCase();
    return (
      r.parrain?.prenom?.toLowerCase().includes(q) ||
      r.filleul?.prenom?.toLowerCase().includes(q) ||
      r.parrain?.code_parrain?.toLowerCase().includes(q)
    );
  });

  if (loading) return (
    <div>
      <SectionHeader titre="Parrainage" sous="Statistiques et suivi des parrainages" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 32 }}>
        {[1,2,3,4].map(i => <SkeletonCard key={i} />)}
      </div>
    </div>
  );

  return (
    <div>
      <SectionHeader
        titre="Parrainage"
        sous={`${fmtNum(stats?.total || 0)} parrainages au total · Taux de conversion ${stats?.taux || 0}%`}
      />

      {/* ── KPI globaux ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 32 }}>
        <KPICard
          titre="Parrainages initiés"
          valeur={fmtNum(stats?.total)}
          sous={`+${stats?.total7j} cette semaine`}
          couleur={T.a1}
        />
        <KPICard
          titre="Convertis"
          valeur={fmtNum(stats?.convertis)}
          sous={`+${stats?.conv7j} cette semaine`}
          couleur={T.success}
        />
        <KPICard
          titre="Taux de conversion"
          valeur={`${stats?.taux}%`}
          sous="filleuls ayant créé une capsule en 7j"
          couleur={T.a2}
        />
        <KPICard
          titre="En attente"
          valeur={fmtNum((stats?.total || 0) - (stats?.convertis || 0))}
          sous="n'ont pas encore créé de capsule"
          couleur={T.muted}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>

        {/* ── Taux de conversion visuel ── */}
        <div style={cardStyle}>
          <div style={{ fontFamily: T.ff_titre, fontWeight: 700, fontSize: 16, marginBottom: 20 }}>
            Funnel de parrainage
          </div>

          {/* Parrainages initiés */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>Parrainages initiés</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{fmtNum(stats?.total)}</span>
            </div>
            <div style={{ height: 8, background: T.elevated, borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: '100%', background: T.a1, borderRadius: 999 }} />
            </div>
          </div>

          {/* Convertis */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>Filleuls convertis</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>
                {fmtNum(stats?.convertis)}{' '}
                <span style={{ color: T.muted, fontWeight: 400 }}>({stats?.taux}%)</span>
              </span>
            </div>
            <div style={{ height: 8, background: T.elevated, borderRadius: 999, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${stats?.taux || 0}%`,
                background: T.grad,
                borderRadius: 999,
                transition: 'width .6s ease',
              }} />
            </div>
          </div>

          <div style={{ fontSize: 12, color: T.muted, marginTop: 12, lineHeight: 1.5 }}>
            La conversion est comptée quand le filleul crée sa première capsule dans les 7 jours suivant le parrainage.
          </div>
        </div>

        {/* ── Top 10 parrains ── */}
        <div style={cardStyle}>
          <div style={{ fontFamily: T.ff_titre, fontWeight: 700, fontSize: 16, marginBottom: 20 }}>
            Top 10 meilleurs parrains
          </div>
          {topParrains.length === 0 ? (
            <div style={{ color: T.muted, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
              Aucun parrainage enregistré.
            </div>
          ) : (
            topParrains.map((item, idx) => (
              <div key={item.parrain?.id || idx} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 0',
                borderBottom: idx < topParrains.length - 1 ? `1px solid ${T.border}` : 'none',
              }}>
                {/* Rang */}
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: idx < 3 ? T.grad : T.elevated,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800, color: idx < 3 ? '#fff' : T.muted,
                  flexShrink: 0,
                }}>
                  {idx + 1}
                </div>
                {/* Prénom + code */}
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{item.parrain?.prenom || '—'}</div>
                  <div style={{ fontSize: 11, color: T.muted, fontFamily: 'monospace' }}>
                    {item.parrain?.code_parrain || ''}
                  </div>
                </div>
                {/* Stats */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.success }}>
                    {item.convertis} converti{item.convertis > 1 ? 's' : ''}
                  </div>
                  <div style={{ fontSize: 11, color: T.muted }}>{item.total} filleul{item.total > 1 ? 's' : ''}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Tableau complet ── */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontFamily: T.ff_titre, fontWeight: 700, fontSize: 16 }}>
            Tous les parrainages ({fmtNum(parrainages.length)})
          </div>
          {/* Barre de recherche */}
          <input
            type="text"
            placeholder="Rechercher parrain, filleul, code…"
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            style={{
              padding: '8px 14px', borderRadius: 10, border: `1px solid ${T.border}`,
              background: T.elevated, color: T.text, fontSize: 13,
              fontFamily: T.ff_corps, width: 260, outline: 'none',
            }}
          />
        </div>

        {/* En-tête tableau */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 120px 120px',
          gap: 12, padding: '8px 12px',
          borderBottom: `1px solid ${T.border}`,
          fontSize: 11, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
          <div>Parrain</div>
          <div>Filleul</div>
          <div>Date</div>
          <div>Statut</div>
          <div>Conversion</div>
        </div>

        {/* Lignes */}
        {parrainagesFiltres.length === 0 ? (
          <div style={{ padding: '32px 0', textAlign: 'center', color: T.muted, fontSize: 13 }}>
            {recherche ? 'Aucun résultat pour cette recherche.' : 'Aucun parrainage enregistré.'}
          </div>
        ) : (
          parrainagesFiltres.map(r => (
            <div key={r.id} style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 120px 120px',
              gap: 12, padding: '12px',
              borderBottom: `1px solid ${T.border}`,
              fontSize: 13, alignItems: 'center',
            }}>
              {/* Parrain */}
              <div>
                <div style={{ fontWeight: 600, color: T.text }}>{r.parrain?.prenom || '—'}</div>
                <div style={{ fontSize: 11, color: T.muted, fontFamily: 'monospace' }}>
                  {r.parrain?.code_parrain || ''}
                </div>
              </div>
              {/* Filleul */}
              <div style={{ color: T.text }}>{r.filleul?.prenom || '—'}</div>
              {/* Date */}
              <div style={{ color: T.muted }}>{fmtRelative(r.created_at)}</div>
              {/* Statut */}
              <div><BadgeStatut converti={r.converti} /></div>
              {/* Date conversion */}
              <div style={{ color: T.muted, fontSize: 12 }}>
                {r.converti_at ? fmtDate(r.converti_at) : '—'}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
