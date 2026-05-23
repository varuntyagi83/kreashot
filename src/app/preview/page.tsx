import Link from 'next/link'
import Image from 'next/image'
import { PipelineFilmstrip } from '@/components/pipeline-filmstrip'
import { FaqAccordion } from '@/components/faq-accordion'

// PREVIEW ONLY — do not deploy to production without approval.
// Live page: src/app/page.tsx (untouched)
// Changes vs live: hero headline, subhead, CTAs, stats bar, steps, trust chips,
//                  + proof band section (structural addition).

const displayFont = '"Canela", var(--font-playfair), "Georgia", serif'
const bodyFont = 'var(--font-inter), system-ui, sans-serif'

function KreashotWordmark({ height = 28, variant = 'dark' }: { height?: number; variant?: 'dark' | 'light' }) {
  const src = variant === 'light' ? '/kreashot-wordmark-light.png' : '/kreashot-wordmark-dark.png'
  const width = Math.round(height * (498 / 95))
  return (
    <Image
      src={src}
      alt="kreashot"
      width={width}
      height={height}
      style={{ display: 'block' }}
      priority
    />
  )
}

// CHANGED: label on stat 1 ("avg. studio shoot you skip" vs "avg. shoot cost you replace")
// CHANGED: stat 3 label ("Meta-ready ads per product" vs "ad variations per product")
// CHANGED: stat 4 value+label ("4 formats / 1:1, 4:5, 16:9, 9:16" vs "8 steps / from packshot to Meta export")
const STATS = [
  { value: '$8,000', label: 'avg. studio shoot you skip' },
  { value: '< 2 min', label: 'from upload to first composite' },
  { value: '20', label: 'Meta-ready ads per product' },
  { value: '4 formats', label: '1:1  ·  4:5  ·  16:9  ·  9:16' },
]

const PAIN_POINTS = [
  'Studio bookings take 3 weeks to schedule.',
  'Retouching rounds stretch the timeline to 6 weeks.',
  'Assets are outdated before the ads go live.',
]

// CHANGED: all three step titles and bodies
const STEPS = [
  {
    n: '01',
    title: 'Turn one packshot into a studio shoot',
    body: 'Any angle, any background. Drop in your packshot and Kreashot generates multiple product angles, as if you had a full studio shoot. No booking. No waiting.',
  },
  {
    n: '02',
    title: '20 on-brand composites, quality-checked',
    body: 'Custom backgrounds, matched lighting, your logo and color palette on every frame. Each composite passes a quality check before you see it. Your feedback on any version generates a new one instantly.',
  },
  {
    n: '03',
    title: 'Launch across every Meta format today',
    body: 'Every Meta format: 1:1, 4:5, 16:9, 9:16. Headlines and CTAs written in your brand voice. Ready to import into Meta Ads Manager.',
  },
]

const DIFFERENTIATORS = [
  { label: 'Not Canva', body: 'Canva needs a finished product image. We generate the product image.' },
  { label: 'Not Midjourney', body: 'Midjourney makes art. We make ads with copy, layout, logo, and Meta export.' },
  { label: 'Not an agency', body: 'We are the production line that lets a one-person performance team behave like an agency.' },
]

export default function LandingPagePreview() {
  return (
    <div style={{ backgroundColor: '#F5F0E8', color: '#1A1208', fontFamily: bodyFont, minHeight: '100vh', overflowX: 'hidden' }}>

      {/* Preview notice band */}
      <div style={{
        backgroundColor: '#B85C38',
        color: '#F5F0E8',
        textAlign: 'center',
        padding: '10px 24px',
        fontSize: '12px',
        fontWeight: 600,
        letterSpacing: '0.06em',
        fontFamily: bodyFont,
      }}>
        PREVIEW — revised copy · live page is unchanged at /
      </div>

      {/* Nav */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        backgroundColor: '#F5F0E8',
        borderBottom: '1px solid #DDD8CE',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 40px',
        width: '100%',
        boxSizing: 'border-box',
      }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <KreashotWordmark height={32} variant="dark" />
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <Link href="/auth/login" style={{ color: '#5C5245', fontSize: '14px', fontWeight: 500, textDecoration: 'none' }}>
            Sign in
          </Link>
          <Link href="/auth/signup" style={{
            backgroundColor: '#B85C38', color: '#F5F0E8',
            padding: '10px 22px', borderRadius: '6px',
            fontSize: '14px', fontWeight: 600, textDecoration: 'none',
            letterSpacing: '0.01em',
          }}>
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero — split panel */}
      <div className="krea-hero-grid">

        {/* Left: headline + CTAs */}
        <div style={{
          backgroundColor: '#F5F0E8',
          padding: 'clamp(64px, 8vw, 100px) clamp(32px, 5vw, 80px)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}>
          {/* Eyebrow — unchanged */}
          <p style={{
            color: '#C9922A', fontSize: '11px', fontWeight: 700,
            letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: '32px',
          }}>
            The creative studio your brand can afford to hire
          </p>

          {/* CHANGED headline — sized to fit the 4-line copy in the 58% text panel without sub-wrapping */}
          <h1 style={{
            fontFamily: displayFont,
            fontSize: 'clamp(34px, 4.2vw, 50px)',
            fontWeight: 400,
            lineHeight: 1.12,
            color: '#1A1208',
            letterSpacing: '-0.02em',
            marginBottom: '28px',
            textWrap: 'balance',
          }}>
            Upload a product photo.<br />
            Get 20 launch-ready ads<br />
            before your next shoot<br />
            is even booked.
          </h1>

          {/* CHANGED subhead */}
          <p style={{
            color: '#5C5245', fontSize: '17px', lineHeight: 1.65,
            maxWidth: '400px', marginBottom: '44px', fontFamily: bodyFont,
          }}>
            AI composites in your brand&apos;s style, with copy and layouts already sized for Meta. No photographer. No studio booking. No six-week wait.
          </p>

          {/* CHANGED CTAs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
            <Link href="/auth/signup" style={{
              backgroundColor: '#B85C38', color: '#F5F0E8',
              padding: '15px 36px', borderRadius: '6px',
              fontSize: '15px', fontWeight: 600, textDecoration: 'none',
            }}>
              Generate my first 20 ads
            </Link>
            <Link href="/auth/login" style={{
              color: '#2D4A35', fontSize: '15px', fontWeight: 500,
              textDecoration: 'none', borderBottom: '1.5px solid #2D4A35', paddingBottom: '2px',
            }}>
              Sign in
            </Link>
          </div>

          {/* NEW: trust chips below CTA */}
          <p style={{
            marginTop: '16px',
            fontSize: '12px',
            color: '#7A6E62',
            fontFamily: bodyFont,
            letterSpacing: '0.01em',
          }}>
            No credit card required &nbsp;·&nbsp; First product free &nbsp;·&nbsp; Cancel anytime
          </p>
        </div>

        {/* Right: dark panel — image collage — unchanged */}
        <div className="krea-hero-visual" style={{
          backgroundColor: '#0F0B06',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', inset: '16px', display: 'flex', gap: '8px' }}>
            <div style={{ flex: '0 0 38%', position: 'relative', borderRadius: '10px', overflow: 'hidden' }}>
              <Image
                src="/hero/hero-ad-916.jpg"
                alt="LUMINARY — 9:16 Stories format"
                fill
                sizes="20vw"
                quality={90}
                style={{ objectFit: 'cover' }}
                priority
              />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', aspectRatio: '16/9', flexShrink: 0 }}>
                <Image
                  src="/hero/hero-ad-169.jpg"
                  alt="BOTANICA — 16:9 Display format"
                  fill
                  sizes="25vw"
                  quality={90}
                  style={{ objectFit: 'cover' }}
                  priority
                />
              </div>
              <div style={{ flex: 1, display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1, position: 'relative', borderRadius: '10px', overflow: 'hidden' }}>
                  <Image
                    src="/hero/hero-ad-45.jpg"
                    alt="MAISON K — 4:5 Feed format"
                    fill
                    sizes="(max-width: 768px) 45vw, 25vw"
                    quality={90}
                    style={{ objectFit: 'cover' }}
                    priority
                  />
                </div>
                <div style={{ flex: 1, position: 'relative', borderRadius: '10px', overflow: 'hidden' }}>
                  <Image
                    src="/hero/hero-ad-11.jpg"
                    alt="SOLEIL — 1:1 Square format"
                    fill
                    sizes="(max-width: 768px) 45vw, 25vw"
                    quality={90}
                    style={{ objectFit: 'cover' }}
                    priority
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Stat rail — CHANGED: stat 3 label, stat 4 value+label */}
      <div style={{ backgroundColor: '#1A1208', borderTop: '1px solid rgba(201,146,42,0.12)' }}>
        <div className="krea-stats-grid">
          {STATS.map(({ value, label }, i) => (
            <div key={value} style={{
              padding: 'clamp(28px, 3vw, 40px) 32px',
              textAlign: 'center',
              borderRight: i < STATS.length - 1 ? '1px solid rgba(221,216,206,0.07)' : 'none',
            }}>
              <p style={{
                fontFamily: displayFont,
                fontSize: 'clamp(26px, 3.2vw, 40px)',
                fontWeight: 400,
                color: '#C9922A',
                marginBottom: '6px',
                lineHeight: 1,
              }}>
                {value}
              </p>
              <p style={{ fontSize: '11px', color: '#DDD8CE', opacity: 0.45, fontFamily: bodyFont, letterSpacing: '0.02em' }}>
                {label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Problem section — unchanged */}
      <section style={{
        backgroundColor: '#F5F0E8',
        padding: 'clamp(72px, 8vw, 120px) clamp(24px, 5vw, 80px)',
      }}>
        <div style={{ maxWidth: '1040px', margin: '0 auto' }}>
          <p style={{
            color: '#B85C38', fontSize: '11px', fontWeight: 700,
            letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: '40px',
          }}>
            The problem
          </p>
          <div className="krea-two-col">
            <div>
              <h2 style={{
                fontFamily: displayFont,
                fontSize: 'clamp(30px, 4vw, 52px)',
                fontWeight: 400,
                color: '#1A1208',
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
              }}>
                Most product photoshoots cost more than your monthly ad budget.
              </h2>
            </div>
            <div>
              <p style={{
                color: '#5C5245', fontSize: '17px', lineHeight: 1.65,
                marginBottom: '40px', fontFamily: bodyFont,
              }}>
                Brands spend an average of $8,000 per shoot and walk away with assets they use in fewer than 3 campaigns. The rest sits in a folder going stale.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {PAIN_POINTS.map((point) => (
                  <div key={point} style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                    <span style={{
                      flexShrink: 0,
                      width: '24px', height: '24px',
                      borderRadius: '50%',
                      backgroundColor: 'rgba(184,92,56,0.08)',
                      border: '1px solid rgba(184,92,56,0.28)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      marginTop: '1px',
                    }}>
                      <span style={{ color: '#B85C38', fontSize: '14px', lineHeight: 1, fontWeight: 600 }}>×</span>
                    </span>
                    <p style={{ color: '#5C5245', fontSize: '15px', lineHeight: 1.65, fontFamily: bodyFont, margin: 0 }}>
                      {point}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* NEW: Proof band — "Your product photo goes in. These come out." */}
      {/* Structural addition recommended in steelman critique. Shows output without requiring new images. */}
      <section style={{
        backgroundColor: '#0F0B06',
        padding: 'clamp(52px, 6vw, 80px) clamp(24px, 5vw, 80px)',
      }}>
        <div style={{ maxWidth: '1040px', margin: '0 auto' }}>
          <p style={{
            color: '#C9922A', fontSize: '11px', fontWeight: 700,
            letterSpacing: '0.16em', textTransform: 'uppercase',
            marginBottom: '32px', textAlign: 'center', fontFamily: bodyFont,
          }}>
            See it work
          </p>
          <p style={{
            fontFamily: displayFont,
            fontSize: 'clamp(22px, 3vw, 36px)',
            fontWeight: 400,
            color: '#F5F0E8',
            textAlign: 'center',
            marginBottom: '48px',
            lineHeight: 1.2,
          }}>
            One product photo in. Four formats out.
          </p>
          {/* Output row — each tile in its TRUE aspect ratio. Equal height, so the
              differing widths are what communicate the four formats. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center', alignItems: 'center' }}>
            {[
              { src: '/hero/hero-ad-916.jpg', label: '9:16 Stories', ratio: '9 / 16' },
              { src: '/hero/hero-ad-45.jpg', label: '4:5 Feed', ratio: '4 / 5' },
              { src: '/hero/hero-ad-11.jpg', label: '1:1 Square', ratio: '1 / 1' },
              { src: '/hero/hero-ad-169.jpg', label: '16:9 Display', ratio: '16 / 9' },
            ].map(({ src, label, ratio }) => (
              <div key={label} style={{ position: 'relative', height: 'clamp(170px, 22vw, 220px)', aspectRatio: ratio, flexShrink: 0, borderRadius: '10px', overflow: 'hidden' }}>
                <Image src={src} alt={label} fill style={{ objectFit: 'cover' }} quality={90} sizes="(max-width: 768px) 70vw, 440px" />
                <div style={{ position: 'absolute', bottom: '10px', left: '10px', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: '4px', padding: '3px 8px' }}>
                  <span style={{ fontSize: '10px', color: '#C9922A', fontWeight: 700, fontFamily: bodyFont, letterSpacing: '0.08em' }}>{label}</span>
                </div>
              </div>
            ))}
          </div>
          <p style={{
            textAlign: 'center',
            marginTop: '28px',
            fontSize: '13px',
            color: '#DDD8CE',
            opacity: 0.45,
            fontFamily: bodyFont,
            lineHeight: 1.6,
          }}>
            Generated from a single packshot. Brand voice applied. Every format export-ready.
          </p>
        </div>
      </section>

      {/* Transition bridge — unchanged */}
      <div style={{
        backgroundColor: '#2D4A35',
        padding: 'clamp(20px, 2.5vw, 28px) clamp(40px, 6vw, 100px)',
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
      }}>
        <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(245,240,232,0.15)' }} />
        <p style={{
          fontFamily: displayFont,
          fontStyle: 'italic',
          fontSize: 'clamp(15px, 2vw, 20px)',
          color: 'rgba(245,240,232,0.8)',
          flexShrink: 0,
          margin: 0,
          letterSpacing: '0.01em',
        }}>
          There is a different way.
        </p>
        <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(245,240,232,0.15)' }} />
      </div>

      {/* Pipeline filmstrip — unchanged */}
      <PipelineFilmstrip />

      {/* How it works — CHANGED: all step titles and bodies */}
      <section style={{ padding: 'clamp(72px, 8vw, 120px) clamp(24px, 5vw, 80px)' }}>
        <div style={{ maxWidth: '1040px', margin: '0 auto' }}>
          <p style={{
            color: '#C9922A', fontSize: '11px', fontWeight: 700,
            letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '16px',
          }}>
            How it works
          </p>
          <h2 style={{
            fontFamily: displayFont,
            fontSize: 'clamp(28px, 3.5vw, 48px)',
            fontWeight: 400,
            color: '#1A1208',
            lineHeight: 1.1,
            letterSpacing: '-0.015em',
            marginBottom: '72px',
          }}>
            From raw packshot to Meta-ready composite
          </h2>
          <div className="krea-steps-grid">
            {STEPS.map(({ n, title, body }) => (
              <div key={n}>
                <p style={{
                  fontFamily: displayFont,
                  fontSize: '56px',
                  fontWeight: 400,
                  color: '#DDD8CE',
                  lineHeight: 1,
                  marginBottom: '20px',
                }}>
                  {n}
                </p>
                <h3 style={{ fontSize: '17px', fontWeight: 600, color: '#1A1208', marginBottom: '12px', fontFamily: bodyFont }}>
                  {title}
                </h3>
                <p style={{ fontSize: '15px', color: '#5C5245', lineHeight: 1.7, fontFamily: bodyFont }}>
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mid-page CTA rail — CHANGED: button text */}
      <section style={{
        backgroundColor: '#2D4A35',
        padding: 'clamp(52px, 6vw, 80px) clamp(24px, 5vw, 80px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '40px',
        flexWrap: 'wrap',
      }}>
        <p style={{
          fontFamily: displayFont,
          fontStyle: 'italic',
          fontSize: 'clamp(22px, 3vw, 38px)',
          fontWeight: 400,
          color: '#F5F0E8',
          lineHeight: 1.2,
          margin: 0,
          maxWidth: '560px',
        }}>
          Ready to replace your last photoshoot with a two-minute pipeline?
        </p>
        <Link href="/auth/signup" style={{
          backgroundColor: '#F5F0E8',
          color: '#1A1208',
          padding: '15px 36px',
          borderRadius: '6px',
          fontSize: '15px',
          fontWeight: 600,
          textDecoration: 'none',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}>
          Replace my next shoot
        </Link>
      </section>

      {/* Differentiator — unchanged */}
      <section style={{ padding: 'clamp(72px, 8vw, 120px) clamp(24px, 5vw, 80px)' }}>
        <div style={{ maxWidth: '1040px', margin: '0 auto' }}>
          <div className="krea-two-col">
            <div>
              <h2 style={{
                fontFamily: displayFont,
                fontSize: 'clamp(30px, 3.5vw, 50px)',
                fontWeight: 400,
                color: '#1A1208',
                lineHeight: 1.08,
                letterSpacing: '-0.015em',
                marginBottom: '24px',
              }}>
                Not Canva.<br />Not Midjourney.<br />Not an agency.
              </h2>
              <p style={{
                color: '#5C5245', fontSize: '15px', lineHeight: 1.7,
                fontFamily: bodyFont, maxWidth: '360px',
              }}>
                Every tool in your stack solves a different problem. Kreashot solves the one none of them touch: replacing the $8,000 product photoshoot with a two-minute pipeline.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {DIFFERENTIATORS.map(({ label, body }, i) => (
                <div key={label} style={{
                  padding: '28px 0',
                  borderBottom: i < DIFFERENTIATORS.length - 1 ? '1px solid #DDD8CE' : 'none',
                }}>
                  <p style={{
                    fontSize: '11px', fontWeight: 700, color: '#C9922A',
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    marginBottom: '8px', fontFamily: bodyFont,
                  }}>
                    {label}
                  </p>
                  <p style={{ fontSize: '15px', color: '#5C5245', lineHeight: 1.65, fontFamily: bodyFont }}>
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ — unchanged */}
      <section style={{
        backgroundColor: '#1A1208',
        padding: 'clamp(72px, 8vw, 120px) clamp(24px, 5vw, 80px)',
      }}>
        <div style={{ maxWidth: '780px', margin: '0 auto' }}>
          <p style={{
            color: '#C9922A', fontSize: '11px', fontWeight: 700,
            letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: '16px',
          }}>
            Common questions
          </p>
          <h2 style={{
            fontFamily: displayFont,
            fontSize: 'clamp(26px, 3.2vw, 44px)',
            fontWeight: 400,
            color: '#F5F0E8',
            lineHeight: 1.15,
            letterSpacing: '-0.015em',
            marginBottom: '56px',
          }}>
            Everything you need to know before your first upload.
          </h2>
          <FaqAccordion />
        </div>
      </section>

      {/* Final CTA — CHANGED: button text */}
      <section style={{
        backgroundColor: '#1A1208',
        borderTop: '1px solid rgba(221,216,206,0.07)',
        padding: 'clamp(72px, 8vw, 120px) clamp(24px, 5vw, 80px)',
        textAlign: 'center',
      }}>
        <p style={{
          color: '#C9922A', fontSize: '11px', fontWeight: 700,
          letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '28px',
        }}>
          Replace your photoshoot
        </p>
        <h2 style={{
          fontFamily: displayFont,
          fontSize: 'clamp(30px, 5vw, 58px)',
          fontWeight: 400,
          color: '#F5F0E8',
          lineHeight: 1.08,
          letterSpacing: '-0.02em',
          marginBottom: '20px',
        }}>
          Upload a product photo.<br />Get export-ready Meta ads.
        </h2>
        <p style={{
          color: '#DDD8CE',
          opacity: 0.5,
          fontSize: '16px',
          maxWidth: '360px',
          margin: '0 auto 44px',
          fontFamily: bodyFont,
          lineHeight: 1.6,
        }}>
          Set up in under 10 minutes. No credit card required.
        </p>
        <Link href="/auth/signup" style={{
          backgroundColor: '#B85C38',
          color: '#F5F0E8',
          padding: '16px 44px',
          borderRadius: '6px',
          fontSize: '16px',
          fontWeight: 600,
          textDecoration: 'none',
          display: 'inline-block',
        }}>
          Upload my first product
        </Link>
      </section>

      {/* Footer — unchanged */}
      <footer style={{
        backgroundColor: '#1A1208',
        borderTop: '1px solid rgba(221,216,206,0.07)',
        padding: '28px 40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
      }}>
        <span style={{ opacity: 0.65 }}>
          <KreashotWordmark height={24} variant="light" />
        </span>
        <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: '#DDD8CE', opacity: 0.35, fontFamily: bodyFont }}>
            © 2026 Kreashot
          </span>
          <span style={{ fontSize: '12px', color: '#DDD8CE', opacity: 0.35, fontFamily: bodyFont }}>
            Built by Raygency
          </span>
        </div>
      </footer>

    </div>
  )
}
