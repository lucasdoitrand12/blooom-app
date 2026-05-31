// Tokens de design partagés entre tous les composants
export const T = {
  bg:          '#0F0A12',
  surface:     '#1A1020',
  elevated:    '#221630',
  card:        '#1E1528',
  border:      '#3A2D50',
  borderHover: '#4A3D60',
  text:        '#F0EAF5',
  muted:       '#8070A0',
  mutedHover:  '#A090B8',
  grad:        'linear-gradient(120deg,#FF8A3D 0%,#FF5C9D 60%,#C65CE8 100%)',
  a1: '#FF8A3D', a2: '#FF5C9D', a3: '#C65CE8',
  success: '#22C7B8', danger: '#FF5C5C', warning: '#FFC436', info: '#4D7CFF',
  ff_titre: "'Bricolage Grotesque', sans-serif",
  ff_corps:  "'Plus Jakarta Sans', sans-serif",
};

// Couleurs pour les graphiques Recharts
export const CHART_COLORS = ['#FF8A3D','#FF5C9D','#C65CE8','#4D7CFF','#22C7B8','#FFC436','#FF6B5E'];

// Icônes et couleurs des types de capsules (miroir de l'app principale)
export const TYPES_CAPSULES = {
  naissance:'🍼', mariage:'💍', anniv:'🎂', noel:'🎄', evjf:'🎉',
  rentree:'🎒', amis:'🤝', libre:'✨', diplome:'🎓', job:'💼',
  lancement:'🚀', victoire:'🏆', logement:'🏠', voyage:'✈️', vacances:'🏕️',
  festival:'🎪', soiree:'🍾', defi_sport:'🏃', grossesse:'🤰',
  premiers_pas:'👶', retraite:'👴', memoire:'🕯️',
};

// Icônes des types de contributions
export const TYPES_CONTRIB = {
  message:'💬', photo:'📸', video:'🎬', dessin:'🎨',
  vocal:'🎤', chanson:'🎵', secret:'🤫', pari:'🎲',
  meteo:'🌤️', une_du_jour:'📰',
};

// Formate une date ISO en "12 jan. 2025"
export function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' });
}

// Formate "il y a X minutes / heures / jours"
export function fmtRelative(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const min  = Math.floor(diff / 60000);
  if (min < 1)  return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30)   return `il y a ${d}j`;
  return fmtDate(iso);
}

// Formate un grand nombre : 1200 → "1 200"
export function fmtNum(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fr-FR');
}

// Génère les données des 30 derniers jours à partir d'un tableau d'objets {created_at}
export function bucketByDay(rows = [], field = 'created_at', nbDays = 30) {
  const byDay = {};
  rows.forEach(r => {
    const day = (r[field] || '').slice(0, 10);
    if (day) byDay[day] = (byDay[day] || 0) + 1;
  });
  return Array.from({ length: nbDays }, (_, i) => {
    const d = new Date(Date.now() - (nbDays - 1 - i) * 86400000);
    const key = d.toISOString().slice(0, 10);
    return { date: key.slice(5), value: byDay[key] || 0, fullDate: key };
  });
}

// Regroupe un tableau par valeur d'un champ et retourne [{name, value}]
export function countByField(rows = [], field = 'type') {
  const map = {};
  rows.forEach(r => { const v = r[field] || 'inconnu'; map[v] = (map[v] || 0) + 1; });
  return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a,b)=>b.value-a.value);
}

// Calcule la variation % entre deux valeurs
export function calcDelta(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

// Tronque un texte à N caractères
export function trunc(str, n = 60) {
  if (!str) return '';
  return str.length > n ? str.slice(0, n) + '…' : str;
}

// Génère une couleur pastelle depuis un ID (pour les avatars sans photo)
export function colorFromId(id = '') {
  const colors = ['#FF8A3D','#FF5C9D','#C65CE8','#4D7CFF','#22C7B8','#FFC436'];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}
