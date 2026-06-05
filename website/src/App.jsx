// ============================================================================
//  BLOOOM — Landing page marketing
//  React + Vite · Déployable sur Vercel · Supabase pour la liste d'attente
// ============================================================================

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from './lib/supabase'

// ── Tokens de design (identiques à l'app) ────────────────────────────────────
const C = {
  grad:      'linear-gradient(135deg, #FF8A3D 0%, #FF5C9D 50%, #C65CE8 100%)',
  gradLight: 'linear-gradient(135deg, rgba(255,138,61,0.07) 0%, rgba(198,92,232,0.07) 100%)',
  dark:      '#0F0A12',
  darkCard:  '#16101F',
  light:     '#FAF8FC',
  lightCard: '#FFFFFF',
  txtDark:   '#1A0E2E',
  txtLight:  '#FAF8FC',
  muted:     '#6B5B7E',
  orange:    '#FF8A3D',
  pink:      '#FF5C9D',
  violet:    '#C65CE8',
}
const FF = {
  titre: "'Bricolage Grotesque', sans-serif",
  corps: "'Plus Jakarta Sans', sans-serif",
}

// ── CSS global ────────────────────────────────────────────────────────────────
const GLOBAL = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html  { scroll-behavior: smooth; }
  body  { background: ${C.dark}; font-family: ${FF.corps}; -webkit-font-smoothing: antialiased; overflow-x: hidden; }
  img   { display: block; max-width: 100%; }
  a     { text-decoration: none; }
  ::placeholder { color: rgba(250,248,252,0.35); }
  input:focus   { outline: none; }

  /* Animations */
  @keyframes floatP    { 0% { transform: translateY(0) scale(1); }   100% { transform: translateY(-20px) scale(1.12); } }
  @keyframes iconPop   { 0%,100% { transform: translateY(0); }        50% { transform: translateY(-7px); } }
  @keyframes bounce    { 0%,100% { transform: translateX(-50%) translateY(0); } 50% { transform: translateX(-50%) translateY(9px); } }
  @keyframes fadeIn    { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
  @keyframes haloSpin  { from { transform: translate(-50%,-50%) rotate(0deg); } to { transform: translate(-50%,-50%) rotate(360deg); } }
  @keyframes pricePop  { 0%,100%{ transform: scale(1); } 50%{ transform: scale(1.05); } }

  /* Scroll reveal — classe appliquée par JS */
  .reveal          { opacity: 0; transform: translateY(36px); transition: opacity .7s ease, transform .7s ease; }
  .reveal.visible  { opacity: 1; transform: none; }
  .reveal-d1.visible { transition-delay: .08s; }
  .reveal-d2.visible { transition-delay: .16s; }
  .reveal-d3.visible { transition-delay: .24s; }
  .reveal-d4.visible { transition-delay: .32s; }
  .reveal-d5.visible { transition-delay: .40s; }
  .reveal-d6.visible { transition-delay: .48s; }
  .reveal-d7.visible { transition-delay: .56s; }
  .reveal-d8.visible { transition-delay: .64s; }

  /* Responsive utilitaire */
  @media (max-width: 640px) {
    .hide-mobile { display: none !important; }
  }
`

// ── Hook : IntersectionObserver sur un élément ────────────────────────────────
function useReveal() {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    el.classList.add('reveal')
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.classList.add('visible'); obs.disconnect() } },
      { threshold: 0.12 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return ref
}

// Hook : applique reveal à plusieurs enfants d'un conteneur
function useRevealChildren(selector = '[data-reveal]') {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current) return
    const children = ref.current.querySelectorAll(selector)
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          children.forEach(el => el.classList.add('visible'))
          obs.disconnect()
        }
      },
      { threshold: 0.1 }
    )
    children.forEach(el => el.classList.add('reveal'))
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [selector])
  return ref
}

// ── Logo Blooom ───────────────────────────────────────────────────────────────
function Logo({ taille = 32, mode = 'dark' }) {
  const col = mode === 'dark' ? C.txtLight : C.txtDark
  return (
    <span style={{ fontFamily: FF.titre, fontWeight: 800, fontSize: taille, lineHeight: 1, letterSpacing: 1, userSelect: 'none' }}>
      <span style={{ color: col }}>Bl</span>
      <span style={{ color: C.orange }}>o</span>
      <span style={{ color: C.pink }}>o</span>
      <span style={{ color: C.violet }}>o</span>
      <span style={{ color: col }}>m</span>
    </span>
  )
}

// ── Bouton dégradé principal ──────────────────────────────────────────────────
function BtnGrad({ children, onClick, style = {}, type = 'button' }) {
  return (
    <button type={type} onClick={onClick} style={{
      background: C.grad, color: '#fff', border: 'none', borderRadius: 14,
      padding: '14px 26px', fontSize: 15, fontWeight: 700, fontFamily: FF.corps,
      cursor: 'pointer', transition: 'transform .18s, box-shadow .18s',
      boxShadow: '0 4px 20px rgba(255,92,157,.28)', ...style,
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 36px rgba(255,92,157,.42)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(255,92,157,.28)' }}>
      {children}
    </button>
  )
}

// ── Bouton outline (fond sombre) ──────────────────────────────────────────────
function BtnOutline({ children, onClick, style = {} }) {
  return (
    <button onClick={onClick} style={{
      background: 'transparent', color: C.txtLight, border: '2px solid rgba(255,255,255,.28)',
      borderRadius: 14, padding: '13px 26px', fontSize: 15, fontWeight: 600,
      fontFamily: FF.corps, cursor: 'pointer', transition: 'all .18s', ...style,
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.6)'; e.currentTarget.style.background = 'rgba(255,255,255,.07)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.28)'; e.currentTarget.style.background = 'transparent' }}>
      {children}
    </button>
  )
}


// ── NAVBAR ────────────────────────────────────────────────────────────────────
function Navbar({ onCTA }) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', h, { passive: true })
    return () => window.removeEventListener('scroll', h)
  }, [])
  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
      padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      transition: 'background .3s, backdrop-filter .3s',
      background: scrolled ? 'rgba(15,10,18,.9)' : 'transparent',
      backdropFilter: scrolled ? 'blur(18px)' : 'none',
      borderBottom: scrolled ? '1px solid rgba(255,255,255,.06)' : 'none',
    }}>
      <Logo taille={26} mode="dark" />
      <BtnGrad onClick={onCTA} style={{ padding: '10px 20px', fontSize: 13 }}>
        Rejoindre la liste d'attente
      </BtnGrad>
    </nav>
  )
}


// ── SECTION 1 — HERO ─────────────────────────────────────────────────────────
const STATS = [
  '8 400 souvenirs déjà scellés dans Blooom ✨',
  '1 200 capsules créées ce mois ❤️',
  'Ouverture prévue dans 12 pays 🌍',
  'Note moyenne 4,9 / 5 sur les bêta-tests ⭐',
  '3 min pour créer et partager une capsule ⚡',
]

function Hero({ onCTA }) {
  // Statistique sociale : rotation toutes les 4s avec fondu
  const [idx, setIdx] = useState(0)
  const [fade, setFade] = useState(true)
  useEffect(() => {
    const t = setInterval(() => {
      setFade(false)
      setTimeout(() => { setIdx(i => (i + 1) % STATS.length); setFade(true) }, 380)
    }, 4000)
    return () => clearInterval(t)
  }, [])

  // Particules flottantes générées une seule fois
  const particles = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x:     Math.random() * 100,
      y:     Math.random() * 100,
      size:  3 + Math.random() * 5,
      dur:   5 + Math.random() * 8,
      delay: Math.random() * 6,
      col:   [C.orange, C.pink, C.violet][i % 3],
      op:    0.1 + Math.random() * 0.18,
    }))
  , [])

  return (
    <section style={{ background: C.dark, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '100px 24px 80px', position: 'relative', overflow: 'hidden' }}>

      {/* Halo radial de fond */}
      <div style={{ position: 'absolute', top: '38%', left: '50%', width: 700, height: 700, borderRadius: '50%', background: 'radial-gradient(circle, rgba(198,92,232,.12) 0%, transparent 68%)', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }} />

      {/* Particules */}
      {particles.map(p => (
        <div key={p.id} style={{
          position: 'absolute', left: `${p.x}%`, top: `${p.y}%`,
          width: p.size, height: p.size, borderRadius: '50%',
          background: p.col, opacity: p.op, pointerEvents: 'none',
          animation: `floatP ${p.dur}s ${p.delay}s ease-in-out infinite alternate`,
        }} />
      ))}

      {/* Contenu principal */}
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 740, animation: 'fadeIn .9s ease both' }}>
        <Logo taille={48} mode="dark" />

        <h1 style={{ fontFamily: FF.titre, fontWeight: 800, color: C.txtLight, lineHeight: 1.05, margin: '36px 0 22px', letterSpacing: -2, fontSize: 'clamp(48px, 9vw, 96px)' }}>
          Scelle.<br />
          <span style={{ background: C.grad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Attends.</span><br />
          Révèle.
        </h1>

        <p style={{ fontFamily: FF.corps, fontSize: 'clamp(16px, 2.5vw, 19px)', color: 'rgba(250,248,252,.68)', lineHeight: 1.75, maxWidth: 520, margin: '0 auto 44px' }}>
          Créez une capsule temporelle avec vos proches. Déposez des souvenirs. Rouvrez-la ensemble le jour choisi.
        </p>

        {/* CTA — scrollent vers la liste d'attente (app pas encore publiée) */}
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 56 }}>
          <BtnGrad onClick={onCTA} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 15 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
            App Store
          </BtnGrad>
          <BtnOutline onClick={onCTA} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 15 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3.18 23.76c.33.18.7.2 1.06.04l12.2-6.85-2.61-2.61-10.65 9.42zm-1.1-19.72C2.03 4.3 2 4.6 2 4.9v14.2c0 .3.03.6.08.86l11.04-11.03L2.08 4.04zm20.01 8.6l-2.81-1.58-2.93 2.93 2.93 2.93 2.83-1.59c.8-.45.8-1.73-.02-2.69zM4.24.24C3.88.07 3.51.1 3.18.28L14.12 11.2l2.61-2.61L4.24.24z"/></svg>
            Google Play
          </BtnOutline>
        </div>

        {/* Statistique sociale animée */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,.07)', backdropFilter: 'blur(12px)', borderRadius: 999, padding: '11px 22px', border: '1px solid rgba(255,255,255,.1)' }}>
          <div style={{ display: 'flex' }}>
            {['🧑', '👩', '🧑‍🦱'].map((e, i) => (
              <span key={i} style={{ fontSize: 17, marginLeft: i > 0 ? -7 : 0, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.3))' }}>{e}</span>
            ))}
          </div>
          <span style={{ fontFamily: FF.corps, fontSize: 13, color: 'rgba(250,248,252,.8)', transition: 'opacity .38s', opacity: fade ? 1 : 0 }}>
            {STATS[idx]}
          </span>
        </div>
      </div>

      {/* Flèche scroll */}
      <div style={{ position: 'absolute', bottom: 28, left: '50%', animation: 'bounce 2.2s ease-in-out infinite', opacity: .4 }}>
        <svg width="22" height="22" fill="none" stroke={C.txtLight} strokeWidth="2" viewBox="0 0 24 24">
          <path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </section>
  )
}


// ── SECTION 2 — COMMENT ÇA MARCHE ────────────────────────────────────────────
const ETAPES = [
  { icon: '🔒', titre: 'Créez votre capsule',     desc: "Choisissez une occasion, une date d'ouverture, invitez vos proches avec un simple lien." },
  { icon: '💛', titre: 'Déposez vos souvenirs',   desc: 'Messages, photos, vidéos, dessins, chansons, secrets… Chacun contribue à son rythme.' },
  { icon: '🎉', titre: 'Rouvrez ensemble',         desc: 'Le jour choisi, découvrez tous les souvenirs en même temps. Un moment inoubliable.' },
]

function HowItWorks() {
  const container = useRevealChildren()
  const title     = useReveal()
  return (
    <section style={{ background: C.light, padding: '112px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
        <h2 ref={title} style={{ fontFamily: FF.titre, fontWeight: 800, fontSize: 'clamp(30px, 5vw, 52px)', color: C.txtDark, marginBottom: 14 }}>
          Comment ça marche ?
        </h2>
        <p ref={useReveal()} style={{ fontFamily: FF.corps, fontSize: 17, color: C.muted, marginBottom: 72 }}>
          Trois étapes simples pour un souvenir qui dure toute une vie.
        </p>

        <div ref={container} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 28 }}>
          {ETAPES.map((e, i) => (
            <div key={i} data-reveal className={`reveal-d${i + 1}`} style={{ background: C.lightCard, borderRadius: 24, padding: '44px 32px', boxShadow: '0 4px 28px rgba(26,14,46,.07)', border: '1px solid rgba(26,14,46,.05)' }}>
              <div style={{ fontSize: 52, marginBottom: 22, display: 'inline-block', animation: `iconPop 3s ${i * .6}s ease-in-out infinite` }}>{e.icon}</div>
              <h3 style={{ fontFamily: FF.titre, fontWeight: 700, fontSize: 22, color: C.txtDark, marginBottom: 12 }}>{e.titre}</h3>
              <p style={{ fontFamily: FF.corps, fontSize: 15, color: C.muted, lineHeight: 1.75, margin: 0 }}>{e.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}


// ── SECTION 3 — MOCKUPS ───────────────────────────────────────────────────────
// Aperçus CSS des 3 écrans principaux de l'app
const ScreenCapsules = (
  <div style={{ padding: '10px 10px 0', height: '100%' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
      <span style={{ fontFamily: FF.titre, fontWeight: 800, fontSize: 16, background: 'linear-gradient(135deg,#FF8A3D,#C65CE8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Blooom</span>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#FF8A3D,#FF5C9D)' }} />
    </div>
    {[
      { nom: '🍼 Capsule Léa',   date: 'Ouvre dans 14 ans',  nb: 23 },
      { nom: '💍 Notre mariage', date: 'Ouvre dans 8 ans',   nb: 47 },
      { nom: '🎂 Anniversaire',  date: 'Ouvre dans 6 mois',  nb: 12 },
      { nom: '🎒 Promo 2024',    date: 'Ouvre dans 3 mois',  nb: 8  },
    ].map((c, i) => (
      <div key={i} style={{ background: 'rgba(255,255,255,.07)', borderRadius: 14, padding: '10px 11px', marginBottom: 9 }}>
        <div style={{ fontFamily: FF.corps, fontSize: 11, fontWeight: 700, color: '#FAF8FC' }}>{c.nom}</div>
        <div style={{ fontFamily: FF.corps, fontSize: 9.5, color: 'rgba(250,248,252,.45)', marginTop: 2 }}>{c.date} · {c.nb} souvenirs</div>
      </div>
    ))}
  </div>
)

const ScreenSouvenir = (
  <div style={{ padding: '12px 10px 0', height: '100%' }}>
    <div style={{ fontFamily: FF.corps, fontSize: 10, fontWeight: 600, color: 'rgba(250,248,252,.55)', marginBottom: 14 }}>Ajouter un souvenir</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7 }}>
      {[['✉️','Message'],['📷','Photo'],['🎵','Chanson'],['🎨','Dessin'],['🤫','Secret'],['🎲','Pari']].map(([ic, nom]) => (
        <div key={nom} style={{ background: 'rgba(255,255,255,.07)', borderRadius: 11, padding: '9px 4px', textAlign: 'center' }}>
          <div style={{ fontSize: 20 }}>{ic}</div>
          <div style={{ fontFamily: FF.corps, fontSize: 8.5, color: 'rgba(250,248,252,.55)', marginTop: 4 }}>{nom}</div>
        </div>
      ))}
    </div>
    <div style={{ marginTop: 12, background: 'linear-gradient(135deg,#FF8A3D,#C65CE8)', borderRadius: 11, padding: '9px 0', textAlign: 'center', fontFamily: FF.corps, fontSize: 10, fontWeight: 700, color: '#fff' }}>
      Déposer un souvenir
    </div>
  </div>
)

const ScreenOuverture = (
  <div style={{ height: '100%', background: 'linear-gradient(180deg,#2D1060 0%,#0F0A12 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 14px', gap: 10 }}>
    <div style={{ fontSize: 42, filter: 'drop-shadow(0 0 18px rgba(198,92,232,.6))' }}>🎉</div>
    <div style={{ fontFamily: FF.titre, fontSize: 14, fontWeight: 800, color: '#FAF8FC', lineHeight: 1.3 }}>La capsule<br/>est ouverte !</div>
    <div style={{ fontFamily: FF.corps, fontSize: 10, color: 'rgba(250,248,252,.5)' }}>47 souvenirs vous attendent</div>
    <div style={{ width: '72%', height: 2, background: 'linear-gradient(90deg,#FF8A3D,#C65CE8)', borderRadius: 1 }} />
    <div style={{ fontFamily: FF.corps, fontSize: 9, color: 'rgba(250,248,252,.38)', fontStyle: 'italic' }}>Retour en 2015…</div>
  </div>
)

function PhoneMockup({ screen, legende, delay = 0 }) {
  const ref = useReveal()
  return (
    <div ref={ref} className={`reveal-d${delay}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      <div style={{ width: 196, height: 394, background: '#16101F', borderRadius: 34, border: '3.5px solid #2A1D3D', boxShadow: '0 32px 64px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.06)', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
        {/* Notch */}
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 72, height: 20, background: '#0F0A12', borderRadius: '0 0 14px 14px', zIndex: 10 }} />
        {/* Screen */}
        <div style={{ paddingTop: 26, height: '100%', overflow: 'hidden' }}>{screen}</div>
        {/* Home bar */}
        <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', width: 72, height: 4, background: 'rgba(255,255,255,.18)', borderRadius: 2 }} />
      </div>
      <p style={{ fontFamily: FF.corps, fontSize: 13, color: 'rgba(250,248,252,.5)', textAlign: 'center', maxWidth: 180 }}>{legende}</p>
    </div>
  )
}

function Mockups() {
  const title = useReveal()
  return (
    <section style={{ background: C.dark, padding: '112px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
        <h2 ref={title} style={{ fontFamily: FF.titre, fontWeight: 800, fontSize: 'clamp(28px, 5vw, 48px)', color: C.txtLight, marginBottom: 14 }}>
          Une expérience pensée pour l'émotion.
        </h2>
        <p ref={useReveal()} style={{ fontFamily: FF.corps, fontSize: 16, color: 'rgba(250,248,252,.55)', marginBottom: 72 }}>
          Interface soignée. Animations mémorables. Conçue pour durer.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', gap: 48, flexWrap: 'wrap' }}>
          <PhoneMockup screen={ScreenCapsules}   legende="Toutes vos capsules en un coup d'œil"           delay={1} />
          <PhoneMockup screen={ScreenSouvenir}   legende="Déposez vos souvenirs en quelques secondes"     delay={2} />
          <PhoneMockup screen={ScreenOuverture}  legende="L'animation d'ouverture — un moment de magie"   delay={3} />
        </div>
      </div>
    </section>
  )
}


// ── SECTION 4 — OCCASIONS ────────────────────────────────────────────────────
const OCCASIONS = [
  { icone: '🍼', nom: 'Naissance',        teinte: '#4D7CFF' },
  { icone: '💍', nom: 'Mariage',          teinte: '#FF5C9D' },
  { icone: '🎂', nom: 'Anniversaire',     teinte: '#FFC436' },
  { icone: '🎄', nom: 'Noël',             teinte: '#22C7B8' },
  { icone: '🎉', nom: 'EVJF / EVG',       teinte: '#9B5DE5' },
  { icone: '🎒', nom: 'Rentrée scolaire', teinte: '#FF8A3D' },
  { icone: '🤝', nom: 'Entre amis',       teinte: '#00BBF9' },
  { icone: '🌻', nom: 'Retraite',         teinte: '#FF6B5E' },
]

function Occasions() {
  const title     = useReveal()
  const subtitle  = useReveal()
  const container = useRevealChildren()
  return (
    <section style={{ background: C.dark, padding: '112px 24px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '50%', left: '50%', width: 900, height: 900, borderRadius: '50%', background: 'radial-gradient(circle, rgba(198,92,232,.09) 0%, transparent 65%)', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }} />
      <div style={{ maxWidth: 980, margin: '0 auto', textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <h2 ref={title} style={{ fontFamily: FF.titre, fontWeight: 800, fontSize: 'clamp(28px, 5vw, 48px)', color: C.txtLight, marginBottom: 14 }}>
          Pour tous les moments qui comptent.
        </h2>
        <p ref={subtitle} style={{ fontFamily: FF.corps, fontSize: 16, color: 'rgba(250,248,252,.5)', marginBottom: 64 }}>
          Chaque occasion mérite d'être préservée.
        </p>
        <div ref={container} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 16 }}>
          {OCCASIONS.map((o, i) => (
            <div key={i} data-reveal className={`reveal-d${(i % 4) + 1}`}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
                padding: '36px 24px 28px', borderRadius: 24,
                flex: '1 1 130px', minWidth: 130, maxWidth: 160,
                background: `radial-gradient(circle at 50% 10%, ${o.teinte}20 0%, rgba(255,255,255,.02) 70%)`,
                border: `1px solid ${o.teinte}30`,
                transition: 'transform .22s, border-color .22s',
                cursor: 'default',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-7px) scale(1.03)'; e.currentTarget.style.borderColor = `${o.teinte}65` }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = `${o.teinte}30` }}>
              <div style={{ fontSize: 44, filter: `drop-shadow(0 0 20px ${o.teinte}90)` }}>{o.icone}</div>
              <div style={{ fontFamily: FF.corps, fontSize: 14, fontWeight: 600, color: 'rgba(250,248,252,.88)', letterSpacing: .3 }}>{o.nom}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}


// ── SECTION 5 — TÉMOIGNAGES ───────────────────────────────────────────────────
const TEMOIGNAGES = [
  { prenom: 'Sophie', ville: 'Lyon',     initiale: 'S', col: '#FF5C9D', texte: "On a ouvert la capsule de notre mariage à notre 10ème anniversaire. J'ai pleuré pendant 20 minutes." },
  { prenom: 'Thomas', ville: 'Paris',    initiale: 'T', col: '#4D7CFF', texte: "Ma fille avait 2 ans quand j'ai créé sa capsule. Elle l'ouvrira à 18 ans. Je tremble déjà." },
  { prenom: 'Camille', ville: 'Bordeaux', initiale: 'C', col: '#22C7B8', texte: "Toute notre classe de terminale a contribué. On s'est retrouvés 5 ans plus tard autour de cette capsule." },
]

function Testimonials() {
  const title     = useReveal()
  const container = useRevealChildren()
  return (
    <section style={{ background: C.light, padding: '112px 24px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
        <h2 ref={title} style={{ fontFamily: FF.titre, fontWeight: 800, fontSize: 'clamp(28px, 5vw, 48px)', color: C.txtDark, marginBottom: 14 }}>
          Ce que vivent les familles Blooom.
        </h2>
        <p ref={useReveal()} style={{ fontFamily: FF.corps, fontSize: 16, color: C.muted, marginBottom: 64 }}>
          De vraies émotions. De vrais moments.
        </p>
        <div ref={container} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(268px, 1fr))', gap: 24 }}>
          {TEMOIGNAGES.map((t, i) => (
            <div key={i} data-reveal className={`reveal-d${i + 1}`}
              style={{ background: C.lightCard, borderRadius: 24, padding: '36px 28px', textAlign: 'left', boxShadow: '0 4px 28px rgba(26,14,46,.07)', border: '1px solid rgba(26,14,46,.05)' }}>
              <div style={{ display: 'flex', gap: 3, marginBottom: 18 }}>
                {Array.from({ length: 5 }).map((_, j) => (
                  <span key={j} style={{ color: '#FFC436', fontSize: 17 }}>★</span>
                ))}
              </div>
              <p style={{ fontFamily: FF.corps, fontSize: 16, color: C.txtDark, lineHeight: 1.75, marginBottom: 28, fontStyle: 'italic' }}>
                "{t.texte}"
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: `linear-gradient(135deg, ${t.col}, #C65CE8)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FF.titre, fontWeight: 800, fontSize: 17, color: '#fff', flexShrink: 0 }}>
                  {t.initiale}
                </div>
                <div>
                  <div style={{ fontFamily: FF.corps, fontSize: 14, fontWeight: 700, color: C.txtDark }}>{t.prenom}</div>
                  <div style={{ fontFamily: FF.corps, fontSize: 12, color: C.muted }}>{t.ville}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}



// ── SECTION 6 — CONFIDENTIALITÉ ──────────────────────────────────────────────
const POINTS_CONF = [
  { ic: '🔐', titre: 'Chiffrement de bout en bout', texte: 'Personne ne peut lire vos souvenirs, même Blooom.' },
  { ic: '🇪🇺', titre: 'Hébergement en Europe',       texte: "Vos données ne quittent jamais l'Union Européenne." },
  { ic: '🚫', titre: 'Zéro publicité, jamais',        texte: "Blooom ne vend pas vos données et n'affichera jamais de pub." },
  { ic: '🗑️', titre: 'Suppression réelle',            texte: 'Supprimez votre compte et toutes vos données disparaissent en 24h.' },
]

function Privacy() {
  const title     = useReveal()
  const container = useRevealChildren()
  return (
    <section style={{ background: C.dark, padding: '112px 24px' }}>
      <div style={{ maxWidth: 920, margin: '0 auto', textAlign: 'center' }}>
        <h2 ref={title} style={{ fontFamily: FF.titre, fontWeight: 800, fontSize: 'clamp(28px, 5vw, 48px)', color: C.txtLight, marginBottom: 14 }}>
          Vos souvenirs vous appartiennent.
        </h2>
        <p ref={useReveal()} style={{ fontFamily: FF.corps, fontSize: 16, color: 'rgba(250,248,252,.55)', marginBottom: 68 }}>
          La confiance est la base de tout ce qu'on construit.
        </p>
        <div ref={container} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
          {POINTS_CONF.map((p, i) => (
            <div key={i} data-reveal className={`reveal-d${i + 1}`}
              style={{ background: 'rgba(255,255,255,.04)', borderRadius: 22, padding: '36px 24px', border: '1px solid rgba(255,255,255,.08)' }}>
              <div style={{ fontSize: 38, marginBottom: 18 }}>{p.ic}</div>
              <h3 style={{ fontFamily: FF.titre, fontWeight: 700, fontSize: 17, color: C.txtLight, marginBottom: 10 }}>{p.titre}</h3>
              <p style={{ fontFamily: FF.corps, fontSize: 14, color: 'rgba(250,248,252,.5)', lineHeight: 1.65, margin: 0 }}>{p.texte}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}


// ── SECTION 7 — TARIFS ────────────────────────────────────────────────────────
// Nouveau modèle : packs à l'acte — pas d'abonnement général les 6 premiers mois
const PACKS_SITE = [
  {
    id: 'gratuit',
    icone: '🌱',
    nom: 'Gratuit',
    prix: '0€', periode: '',
    badge: null, hero: false,
    features: [
      '1 capsule active',
      '10 participants',
      '15 photos',
      'Messages illimités',
    ],
    cta: 'Commencer gratuitement',
  },
  {
    id: 'occasion',
    icone: '🎉',
    nom: 'Pack Occasion',
    soustitre: 'Weekend · Soirée · Voyage · EVG',
    prix: '9,99€', periode: ' une seule fois',
    badge: 'Le plus populaire', hero: true,
    features: [
      '150 photos',
      '20 vidéos',
      '10 vocaux',
      '50 participants',
      'QR code de partage',
    ],
    cta: 'Choisir ce pack',
  },
  {
    id: 'mariage',
    icone: '💍',
    nom: 'Pack Mariage',
    prix: '29,99€', periode: ' une seule fois',
    badge: null, hero: false,
    features: [
      '500 photos',
      '50 vidéos',
      '30 vocaux',
      'Participants illimités',
      'QR code pour les tables',
    ],
    cta: 'Choisir ce pack',
  },
]

const PACK_PAPY = {
  id: 'papy',
  icone: '👴',
  nom: 'Pack Mamie/Papy',
  prixMensuel: '4,99€/mois', prixAnnuel: '44,99€/an',
  economie: '−15€/an',
  features: [
    'Interface ultra-simplifiée pour seniors',
    '40 photos par mois',
    '4 vidéos par mois',
    '4 vocaux par mois',
    'Participants illimités',
    'Capsule mensuelle automatique',
    'Album papier (bientôt)',
  ],
}

function Pricing({ onCTA, onScrollToStores }) {
  const title     = useReveal()
  const container = useRevealChildren()

  return (
    <section style={{ background: C.light, padding: '112px 24px' }} id="tarifs">
      <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>

        <h2 ref={title} style={{ fontFamily: FF.titre, fontWeight: 800, fontSize: 'clamp(28px, 5vw, 48px)', color: C.txtDark, marginBottom: 14 }}>
          Payez uniquement pour ce dont vous avez besoin.
        </h2>
        <p ref={useReveal()} style={{ fontFamily: FF.corps, fontSize: 16, color: C.muted, marginBottom: 56 }}>
          Pas d'abonnement général. Un pack ciblé pour l'occasion qui compte, ou un rituel mensuel pour les proches qui comptent.
        </p>

        {/* Grille 4 packs */}
        <div ref={container} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24, alignItems: 'stretch', marginBottom: 32 }}>
          {PACKS_SITE.map((p, i) => (
            <div key={p.id} data-reveal className={`reveal-d${i + 1}`} style={{
              ...(p.hero ? {
                background: `linear-gradient(${C.lightCard}, ${C.lightCard}) padding-box, ${C.grad} border-box`,
                border: '2.5px solid transparent',
                boxShadow: '0 20px 56px rgba(198,92,232,.16)',
              } : {
                background: C.lightCard,
                border: '1px solid rgba(26,14,46,.06)',
                boxShadow: '0 4px 28px rgba(26,14,46,.07)',
              }),
              borderRadius: 28, padding: p.hero ? '52px 28px 44px' : '44px 28px',
              display: 'flex', flexDirection: 'column', position: 'relative',
            }}>
              {p.badge && (
                <div style={{
                  position: 'absolute', top: -15, left: '50%', transform: 'translateX(-50%)',
                  background: C.grad, color: '#fff', borderRadius: 999, padding: '5px 18px',
                  fontSize: 12, fontWeight: 700, fontFamily: FF.corps, whiteSpace: 'nowrap',
                }}>
                  {p.badge}
                </div>
              )}
              <div style={{ fontSize: 36, marginBottom: 8 }}>{p.icone}</div>
              <h3 style={{ fontFamily: FF.titre, fontWeight: 700, fontSize: 20, color: C.txtDark, marginBottom: 4, textAlign: 'center' }}>
                {p.nom}
              </h3>
              {p.soustitre && (
                <p style={{ fontFamily: FF.corps, fontSize: 12, color: C.muted, margin: '0 0 12px' }}>{p.soustitre}</p>
              )}
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4, margin: '8px 0 20px' }}>
                <span style={{
                  fontFamily: FF.titre, fontWeight: 800, fontSize: 44,
                  ...(p.hero
                    ? { background: C.grad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }
                    : { color: C.txtDark }),
                }}>
                  {p.prix}
                </span>
                {p.periode && <span style={{ fontFamily: FF.corps, fontSize: 13, color: C.muted }}>{p.periode}</span>}
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', textAlign: 'left', flex: 1 }}>
                {p.features.map((f, j) => (
                  <li key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10, fontFamily: FF.corps, fontSize: 14, color: C.txtDark }}>
                    <span style={{ color: p.hero ? C.violet : C.muted, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <BtnGrad onClick={onCTA} style={{ width: '100%', textAlign: 'center' }}>
                {p.cta}
              </BtnGrad>
            </div>
          ))}

          {/* Pack Mamie/Papy — 4e carte, abonnement mensuel */}
          <div data-reveal className="reveal-d4" style={{
            background: `linear-gradient(${C.lightCard}, ${C.lightCard}) padding-box, linear-gradient(135deg, #C65CE8 0%, #FF5C9D 100%) border-box`,
            border: '2.5px solid transparent',
            boxShadow: '0 20px 56px rgba(198,92,232,.14)',
            borderRadius: 28, padding: '52px 28px 44px',
            display: 'flex', flexDirection: 'column', position: 'relative',
          }}>
            <div style={{ position: 'absolute', top: -15, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg, #C65CE8, #FF5C9D)', color: '#fff', borderRadius: 999, padding: '5px 18px', fontSize: 12, fontWeight: 700, fontFamily: FF.corps, whiteSpace: 'nowrap' }}>
              Abonnement mensuel
            </div>
            <div style={{ fontSize: 36, marginBottom: 8 }}>{PACK_PAPY.icone}</div>
            <h3 style={{ fontFamily: FF.titre, fontWeight: 700, fontSize: 20, color: C.txtDark, marginBottom: 4, textAlign: 'center' }}>
              {PACK_PAPY.nom}
            </h3>
            <p style={{ fontFamily: FF.corps, fontSize: 12, color: C.muted, margin: '0 0 12px' }}>
              Conçu pour les personnes peu à l'aise avec le numérique
            </p>
            <div style={{ textAlign: 'center', margin: '8px 0 20px' }}>
              <div>
                <span style={{ fontFamily: FF.titre, fontWeight: 800, fontSize: 40, background: 'linear-gradient(135deg, #C65CE8, #FF5C9D)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>4,99€</span>
                <span style={{ fontFamily: FF.corps, fontSize: 13, color: C.muted }}>/mois</span>
              </div>
              <div style={{ fontFamily: FF.corps, fontSize: 12, color: C.muted, marginTop: 4 }}>
                ou <span style={{ fontWeight: 700, color: C.txtDark }}>44,99€/an</span>{' '}
                <span style={{ color: '#22C7B8', fontWeight: 700 }}>−15€</span>
              </div>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', textAlign: 'left', flex: 1 }}>
              {PACK_PAPY.features.map((f, j) => (
                <li key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10, fontFamily: FF.corps, fontSize: 14, color: C.txtDark }}>
                  <span style={{ color: C.violet, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <BtnGrad onClick={onCTA} style={{ width: '100%', textAlign: 'center', background: 'linear-gradient(135deg, #C65CE8 0%, #FF5C9D 100%)' }}>
              Choisir ce pack
            </BtnGrad>
          </div>
        </div>

        <p style={{ marginTop: 16, fontFamily: FF.corps, fontSize: 13, color: C.muted, lineHeight: 2 }}>
          🔐 Paiement sécurisé par Stripe &nbsp;·&nbsp; 🇪🇺 Données hébergées en Europe &nbsp;·&nbsp; ❌ Zéro publicité &nbsp;·&nbsp; 🗑️ Annulation à tout moment
        </p>
      </div>
    </section>
  )
}


// ── SECTION 8 — OFFRIR BLOOOM ─────────────────────────────────────────────────
const CADEAUX = [
  { icone: '🎉', nom: 'Pack Occasion',    desc: 'Weekend, Soirée, Voyage ou EVG',     prix: '9,99€' },
  { icone: '💍', nom: 'Pack Mariage',     desc: "L'événement d'une vie",              prix: '29,99€' },
  { icone: '👴', nom: 'Pack Mamie/Papy',  desc: '1 an de souvenirs partagés',         prix: '44,99€' },
]

function GiftSection({ onCTA }) {
  const title     = useReveal()
  const container = useRevealChildren()
  return (
    <section style={{ background: 'linear-gradient(135deg, #FF8A3D 0%, #FFC436 50%, #FF5C9D 100%)', padding: '112px 24px' }}>
      <div style={{ maxWidth: 920, margin: '0 auto', textAlign: 'center' }}>

        {/* Titre de la section cadeau */}
        <h2 ref={title} style={{ fontFamily: FF.titre, fontWeight: 800, fontSize: 'clamp(28px, 5vw, 48px)', color: '#fff', marginBottom: 18, textShadow: '0 2px 16px rgba(0,0,0,.15)' }}>
          🎁 Offrez Blooom à quelqu'un que vous aimez
        </h2>
        <p ref={useReveal()} style={{ fontFamily: FF.corps, fontSize: 17, color: 'rgba(255,255,255,.88)', lineHeight: 1.75, marginBottom: 56 }}>
          Un an de souvenirs partagés. Le cadeau qui compte encore dans 10 ans.
        </p>

        {/* Trois cartes cadeaux */}
        <div ref={container} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
          {CADEAUX.map((c, i) => (
            <div key={i} data-reveal className={`reveal-d${i + 1}`} style={{
              background: 'rgba(255,255,255,.18)', backdropFilter: 'blur(16px)',
              borderRadius: 24, padding: '36px 24px',
              border: '1px solid rgba(255,255,255,.35)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
            }}>
              <div style={{ fontSize: 42 }}>{c.icone}</div>
              <h3 style={{ fontFamily: FF.titre, fontWeight: 700, fontSize: 18, color: '#fff', margin: 0 }}>{c.nom}</h3>
              <p style={{ fontFamily: FF.corps, fontSize: 13, color: 'rgba(255,255,255,.75)', margin: 0 }}>{c.desc}</p>
              {/* Prix du cadeau */}
              <div style={{ fontFamily: FF.titre, fontWeight: 800, fontSize: 34, color: '#fff', margin: '4px 0' }}>{c.prix}</div>
              {/* Bouton Offrir — fond blanc, texte orange */}
              <button onClick={onCTA} style={{
                background: '#fff', color: C.orange, border: 'none', borderRadius: 12,
                padding: '11px 26px', fontFamily: FF.corps, fontSize: 14, fontWeight: 700,
                cursor: 'pointer', transition: 'transform .15s, box-shadow .15s',
                boxShadow: '0 4px 16px rgba(0,0,0,.12)',
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,.18)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.12)' }}>
                Offrir
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}


// ── SECTION 9 — FAQ ───────────────────────────────────────────────────────────
const FAQ_ITEMS = [
  {
    q: 'Les participants doivent-ils payer ?',
    r: "Non. Rejoindre une capsule et y déposer des souvenirs est toujours gratuit pour tout le monde. Seul le créateur de la capsule achète un pack.",
  },
  {
    q: "Que se passe-t-il si j'arrête le Pack Mamie/Papy ?",
    r: "Vos capsules et tous vos souvenirs restent accessibles pour toujours. Les quotas mensuels ne se rechargent plus, mais rien n'est supprimé.",
  },
  {
    q: 'Mes souvenirs sont-ils vraiment privés ?',
    r: "Oui. Vos souvenirs sont chiffrés et hébergés en Europe. Personne, pas même Blooom, ne peut lire le contenu de vos capsules avant leur ouverture.",
  },
  {
    q: "Puis-je offrir un pack en cadeau ?",
    r: "Oui. Les packs Occasion, Mariage et Mamie/Papy font d'excellents cadeaux. Contactez-nous pour créer un bon cadeau personnalisé.",
  },
  {
    q: "Qu'est-ce que le Pack Mamie/Papy ?",
    r: "Une capsule mensuelle que votre famille alimente tout au long du mois. Le 1er de chaque mois, vos proches reçoivent une notification et découvrent tous les souvenirs que vous leur avez préparés. L'interface est ultra-simplifiée pour les personnes moins à l'aise avec le numérique.",
  },
  {
    q: "Y a-t-il un engagement pour le Pack Mamie/Papy ?",
    r: "Non. Le Pack Mamie/Papy en mensuel est résiliable à tout moment. La formule annuelle est facturée en une fois — économisez 15€/an.",
  },
]

function FAQ() {
  // Index de la question actuellement ouverte — null = tout fermé
  const [ouvert, setOuvert] = useState(null)
  const title = useReveal()

  return (
    <section style={{ background: C.light, padding: '112px 24px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* Titre centré */}
        <h2 ref={title} style={{ fontFamily: FF.titre, fontWeight: 800, fontSize: 'clamp(28px, 5vw, 44px)', color: C.txtDark, textAlign: 'center', marginBottom: 56 }}>
          Questions fréquentes
        </h2>

        {/* Liste des items accordéon */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {FAQ_ITEMS.map((item, i) => {
            const estOuvert = ouvert === i
            return (
              <div key={i} style={{
                background: C.lightCard, borderRadius: 18,
                border: '1px solid rgba(26,14,46,.07)', overflow: 'hidden',
                transition: 'box-shadow .2s',
                boxShadow: estOuvert ? '0 8px 32px rgba(26,14,46,.09)' : '0 2px 10px rgba(26,14,46,.04)',
              }}>
                {/* En-tête cliquable — affiche/masque la réponse */}
                <button onClick={() => setOuvert(estOuvert ? null : i)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                  padding: '22px 24px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                }}>
                  <span style={{ fontFamily: FF.corps, fontWeight: 700, fontSize: 15, color: C.txtDark, lineHeight: 1.4 }}>
                    {item.q}
                  </span>
                  {/* Chevron qui pivote à l'ouverture */}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.violet} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ flexShrink: 0, transition: 'transform .25s', transform: estOuvert ? 'rotate(180deg)' : 'none' }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* Réponse — rendue uniquement si la question est ouverte */}
                {estOuvert && (
                  <div style={{ padding: '0 24px 22px', animation: 'fadeIn .22s ease both' }}>
                    <p style={{ fontFamily: FF.corps, fontSize: 14, color: C.muted, lineHeight: 1.85, margin: 0 }}>
                      {item.r}
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}


// ── SECTION 8 — LISTE D'ATTENTE ───────────────────────────────────────────────
function Waitlist({ sectionRef }) {
  const [email,  setEmail]  = useState('')
  const [statut, setStatut] = useState(null) // null | 'loading' | 'ok' | 'already' | 'error'
  const title = useReveal()

  async function inscrire(e) {
    e.preventDefault()
    if (!email.includes('@')) return
    setStatut('loading')
    if (!supabase) { setStatut('error'); return }
    const { error } = await supabase.from('waitlist').insert({ email: email.trim().toLowerCase() })
    if (!error)                   setStatut('ok')
    else if (error.code === '23505') setStatut('already')
    else                          setStatut('error')
  }

  return (
    <section ref={sectionRef} style={{ background: C.grad, padding: '120px 24px' }}>
      <div style={{ maxWidth: 620, margin: '0 auto', textAlign: 'center' }}>
        <h2 ref={title} style={{ fontFamily: FF.titre, fontWeight: 800, fontSize: 'clamp(36px, 7vw, 68px)', color: '#fff', marginBottom: 18, textShadow: '0 4px 28px rgba(0,0,0,.2)', lineHeight: 1.1 }}>
          Blooom arrive bientôt.
        </h2>
        <p ref={useReveal()} style={{ fontFamily: FF.corps, fontSize: 17, color: 'rgba(255,255,255,.82)', lineHeight: 1.75, marginBottom: 52 }}>
          Inscrivez-vous pour être parmi les premiers à l'essayer et bénéficier d'un tarif early adopter exclusif.
        </p>

        {statut === 'ok' ? (
          <div style={{ background: 'rgba(255,255,255,.18)', backdropFilter: 'blur(16px)', borderRadius: 22, padding: '40px 32px', border: '1px solid rgba(255,255,255,.3)', animation: 'fadeIn .5s ease both' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>🎉</div>
            <p style={{ fontFamily: FF.titre, fontWeight: 700, fontSize: 20, color: '#fff', margin: 0 }}>
              C'est noté ! Vous serez parmi les premiers informés.
            </p>
          </div>
        ) : (
          <form onSubmit={inscrire} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="votre@email.com" required disabled={statut === 'loading'}
              style={{ flex: 1, minWidth: 240, padding: '16px 20px', borderRadius: 14, border: '2px solid rgba(255,255,255,.3)', background: 'rgba(255,255,255,.15)', backdropFilter: 'blur(8px)', color: '#fff', fontFamily: FF.corps, fontSize: 15 }}
            />
            <button type="submit" disabled={statut === 'loading' || !email.includes('@')}
              style={{ padding: '16px 26px', borderRadius: 14, border: '2px solid rgba(255,255,255,.9)', background: '#fff', color: C.violet, fontFamily: FF.corps, fontSize: 15, fontWeight: 700, cursor: 'pointer', flexShrink: 0, transition: 'transform .15s', opacity: email.includes('@') ? 1 : .65 }}>
              {statut === 'loading' ? 'Inscription…' : '🚀 Je veux être early adopter'}
            </button>

            {statut === 'already' && (
              <p style={{ width: '100%', color: 'rgba(255,255,255,.8)', fontSize: 13, fontFamily: FF.corps, marginTop: 4 }}>
                Vous êtes déjà sur la liste 🎉
              </p>
            )}
            {statut === 'error' && (
              <p style={{ width: '100%', color: 'rgba(255,255,255,.8)', fontSize: 13, fontFamily: FF.corps, marginTop: 4 }}>
                Une erreur est survenue. Réessayez.
              </p>
            )}
          </form>
        )}
      </div>
    </section>
  )
}


// ── SECTION 9 — FOOTER ────────────────────────────────────────────────────────
const FOOTER_LINKS = ['Confidentialité', 'CGU', 'Contact', 'Instagram']

function Footer() {
  return (
    <footer style={{ background: C.dark, padding: '56px 24px 36px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
      <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, textAlign: 'center' }}>
        <Logo taille={28} mode="dark" />
        <p style={{ fontFamily: FF.corps, fontSize: 14, color: 'rgba(250,248,252,.35)', margin: 0 }}>
          Scelle. Attends. Révèle.
        </p>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
          {FOOTER_LINKS.map(lien => (
            <a key={lien} href="#"
              style={{ fontFamily: FF.corps, fontSize: 13, color: 'rgba(250,248,252,.38)', transition: 'color .2s' }}
              onMouseEnter={e => e.target.style.color = C.pink}
              onMouseLeave={e => e.target.style.color = 'rgba(250,248,252,.38)'}>
              {lien}
            </a>
          ))}
        </div>
        <p style={{ fontFamily: FF.corps, fontSize: 12, color: 'rgba(250,248,252,.2)', margin: 0 }}>
          © 2025 Blooom. Fait avec 💛 en France.
        </p>
      </div>
    </footer>
  )
}


// ── COMPOSANT PRINCIPAL ────────────────────────────────────────────────────────
export default function App() {
  const waitlistRef = useRef(null)
  const heroRef     = useRef(null)

  // Scroll vers la liste d'attente (formulaire email)
  function scrollToWaitlist() {
    waitlistRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Scroll vers le haut de page où se trouvent les boutons App Store / Google Play
  function scrollToStores() {
    heroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      <style>{GLOBAL}</style>
      <Navbar       onCTA={scrollToWaitlist} />
      {/* ref sur Hero pour que le CTA "Télécharger et commencer" scroll vers les stores */}
      <div ref={heroRef}>
        <Hero onCTA={scrollToWaitlist} />
      </div>
      <HowItWorks   />
      <Mockups      />
      <Occasions    />
      <Testimonials />
      <Privacy      />
      {/* Section tarifs — toggle mensuel/annuel, 3 cartes, réassurance */}
      <Pricing      onCTA={scrollToWaitlist} onScrollToStores={scrollToStores} />
      {/* Section cadeau — fond solaire, 3 options cadeaux */}
      <GiftSection  onCTA={scrollToWaitlist} />
      {/* FAQ accordéon — 6 questions sur tarification, confidentialité, abonnements */}
      <FAQ />
      <Waitlist     sectionRef={waitlistRef} />
      <Footer       />
    </>
  )
}
