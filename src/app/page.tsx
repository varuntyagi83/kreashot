import Link from 'next/link'
import {
  Package2,
  Camera,
  Layers,
  ScanLine,
  FileText,
  LayoutTemplate,
  Megaphone,
  Grid2X2,
  ArrowRight,
} from 'lucide-react'

// Brand Direction A: The Studio
// Colors: Parchment #F5F0E8 | Roast #1A1208 | Studio Gold #C9922A | Forest #2D4A35
//         Linen #DDD8CE | Taupe #5C5245 | Sage #4A7C59 | Terracotta #B85C38
// Display: Canela / Playfair Display (var(--font-playfair))
// Body: Inter (var(--font-inter))

const PIPELINE = [
  { Icon: Package2, label: 'Products' },
  { Icon: Camera, label: 'Angled Shots' },
  { Icon: Layers, label: 'Scenes' },
  { Icon: ScanLine, label: 'Photoshoots' },
  { Icon: FileText, label: 'Ad Copy' },
  { Icon: LayoutTemplate, label: 'Templates' },
  { Icon: Megaphone, label: 'Ads' },
  { Icon: Grid2X2, label: 'Collage' },
]

const STEPS = [
  {
    n: '01',
    title: 'Upload a product photo',
    body: 'Any angle, any background. Kreashot generates studio-grade angled shots from a single packshot. No studio, no photographer, no scheduling.',
  },
  {
    n: '02',
    title: 'Get 20 variations in under an hour',
    body: 'Custom lifestyle backgrounds, matched lighting, your brand kit on every frame. Each composite passes a 4-point quality check before it reaches you.',
  },
  {
    n: '03',
    title: 'Export to Meta Ads Manager',
    body: 'Every format: 1:1, 4:5, 16:9, 9:16. Headlines and CTAs written by GPT-4o against your brand voice. One-click CSV export.',
  },
]

const DIFFERENTIATORS = [
  {
    label: 'Not Canva',
    body: 'Canva needs a finished product image. We generate the product image.',
  },
  {
    label: 'Not Midjourney',
    body: 'Midjourney makes art. We make ads with copy, layout, logo, and Meta export.',
  },
  {
    label: 'Not an agency',
    body: 'We are the production line that lets a one-person performance team behave like an agency.',
  },
]

const displayFont = '"Canela", var(--font-playfair), "Georgia", serif'
const bodyFont = 'var(--font-inter), system-ui, sans-serif'

export default function LandingPage() {
  return (
    <div style={{ backgroundColor: '#F5F0E8', color: '#1A1208', fontFamily: bodyFont, minHeight: '100vh' }}>

      {/* Nav */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        backgroundColor: '#F5F0E8',
        borderBottom: '1px solid #DDD8CE',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 40px',
      }}>
        <Link href="/" style={{
          fontFamily: displayFont,
          fontStyle: 'italic',
          fontSize: '28px',
          fontWeight: 400,
          color: '#1A1208',
          letterSpacing: '-0.01em',
          textDecoration: 'none',
        }}>
          kreashot
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <Link href="/auth/login" style={{
            color: '#5C5245',
            fontSize: '14px',
            fontWeight: 500,
            textDecoration: 'none',
          }}>
            Sign in
          </Link>
          <Link href="/auth/signup" style={{
            backgroundColor: '#B85C38',
            color: '#F5F0E8',
            padding: '10px 22px',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 600,
            textDecoration: 'none',
            letterSpacing: '0.01em',
          }}>
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{
        maxWidth: '840px',
        margin: '0 auto',
        padding: '96px 32px 80px',
        textAlign: 'center',
      }}>
        <p style={{
          color: '#C9922A',
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          marginBottom: '36px',
        }}>
          The creative studio your brand can afford to hire
        </p>

        <h1 style={{
          fontFamily: displayFont,
          fontSize: 'clamp(40px, 6vw, 66px)',
          fontWeight: 400,
          lineHeight: 1.08,
          color: '#1A1208',
          letterSpacing: '-0.02em',
          marginBottom: '28px',
        }}>
          Upload a product photo.<br />Get 20 ad variations by lunch.
        </h1>

        <p style={{
          color: '#5C5245',
          fontSize: '17px',
          lineHeight: 1.65,
          maxWidth: '460px',
          margin: '0 auto 44px',
          fontFamily: bodyFont,
        }}>
          Gemini generates the images. GPT-4o writes the copy. Your brand kit goes on top.
          Export to Meta Ads Manager when done.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <Link href="/auth/signup" style={{
            backgroundColor: '#B85C38',
            color: '#F5F0E8',
            padding: '15px 32px',
            borderRadius: '6px',
            fontSize: '15px',
            fontWeight: 600,
            textDecoration: 'none',
          }}>
            Start for free
          </Link>
          <Link href="/auth/login" style={{
            color: '#2D4A35',
            fontSize: '15px',
            fontWeight: 500,
            textDecoration: 'none',
            borderBottom: '1.5px solid #2D4A35',
            paddingBottom: '2px',
          }}>
            Sign in
          </Link>
        </div>
      </section>

      {/* Pipeline filmstrip */}
      <section style={{ backgroundColor: '#F5F0E8' }}>

        {/* Top film border: dark strip with label + parchment perforations */}
        <div style={{ backgroundColor: '#1A1208' }}>
          <div style={{ padding: '12px 40px 8px' }}>
            <p style={{
              color: '#C9922A',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              margin: 0,
            }}>
              The 8-step pipeline
            </p>
          </div>
          {/* Perforations: parchment rectangles punched through the dark strip */}
          <div style={{ display: 'flex', gap: '7px', padding: '6px 24px 10px', overflow: 'hidden' }}>
            {Array.from({ length: 48 }).map((_, i) => (
              <div key={i} style={{
                width: '16px', height: '12px', borderRadius: '3px',
                backgroundColor: '#F5F0E8', flexShrink: 0,
              }} />
            ))}
          </div>
        </div>

        {/* Main content: warm parchment, step icons with dark style */}
        <div style={{
          backgroundColor: '#EDE6D9',
          padding: '28px 40px',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          overflowX: 'auto',
        }}>
          {PIPELINE.map(({ Icon, label }, i) => (
            <div key={label} style={{ display: 'flex', alignItems: 'flex-start' }}>
              {/* Step: icon box + label */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '80px' }}>
                <div style={{
                  width: '54px', height: '54px',
                  border: '1.5px solid #C4B49A',
                  borderRadius: '10px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backgroundColor: '#F5F0E8',
                  boxShadow: '0 1px 3px rgba(26,18,8,0.08)',
                }}>
                  <Icon size={22} color="#1A1208" strokeWidth={1.5} />
                </div>
                <span style={{
                  color: '#5C5245',
                  fontSize: '10px',
                  fontWeight: 500,
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  fontFamily: bodyFont,
                  lineHeight: 1.3,
                }}>
                  {label}
                </span>
              </div>
              {/* Arrow aligned to icon center (54px icon + 8px gap → center at 27px from top) */}
              {i < PIPELINE.length - 1 && (
                <div style={{ marginTop: '16px', flexShrink: 0, padding: '0 2px' }}>
                  <ArrowRight size={13} color="#C9922A" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Bottom film border: dark strip with parchment perforations */}
        <div style={{ backgroundColor: '#1A1208' }}>
          <div style={{ display: 'flex', gap: '7px', padding: '10px 24px 8px', overflow: 'hidden' }}>
            {Array.from({ length: 48 }).map((_, i) => (
              <div key={i} style={{
                width: '16px', height: '12px', borderRadius: '3px',
                backgroundColor: '#F5F0E8', flexShrink: 0,
              }} />
            ))}
          </div>
        </div>

      </section>

      {/* Editorial quote */}
      <section style={{
        backgroundColor: '#2D4A35',
        padding: '100px 32px',
        textAlign: 'center',
      }}>
        <p style={{
          fontFamily: displayFont,
          fontStyle: 'italic',
          fontSize: 'clamp(22px, 3.5vw, 42px)',
          fontWeight: 400,
          color: '#F5F0E8',
          lineHeight: 1.35,
          maxWidth: '680px',
          margin: '0 auto',
        }}>
          We made this. No photographer. No studio. No waiting.
          Production quality is not a claim. It is the output.
        </p>
      </section>

      {/* How it works */}
      <section style={{ padding: '100px 40px' }}>
        <div style={{ maxWidth: '980px', margin: '0 auto' }}>
          <p style={{
            color: '#C9922A',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            marginBottom: '16px',
          }}>
            How it works
          </p>
          <h2 style={{
            fontFamily: displayFont,
            fontSize: 'clamp(28px, 3.5vw, 42px)',
            fontWeight: 400,
            color: '#1A1208',
            lineHeight: 1.15,
            letterSpacing: '-0.015em',
            marginBottom: '64px',
          }}>
            From raw packshot to Meta-ready composite
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '48px' }}>
            {STEPS.map(({ n, title, body }) => (
              <div key={n}>
                <p style={{
                  fontFamily: displayFont,
                  fontSize: '48px',
                  fontWeight: 400,
                  color: '#DDD8CE',
                  lineHeight: 1,
                  marginBottom: '20px',
                }}>
                  {n}
                </p>
                <h3 style={{
                  fontSize: '17px',
                  fontWeight: 600,
                  color: '#1A1208',
                  marginBottom: '12px',
                  fontFamily: bodyFont,
                }}>
                  {title}
                </h3>
                <p style={{
                  fontSize: '15px',
                  color: '#5C5245',
                  lineHeight: 1.7,
                  fontFamily: bodyFont,
                }}>
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Divider */}
      <div style={{ borderTop: '1px solid #DDD8CE', margin: '0 40px' }} />

      {/* What we are not */}
      <section style={{ padding: '100px 40px' }}>
        <div style={{
          maxWidth: '980px', margin: '0 auto',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '80px', alignItems: 'start',
        }}>
          <div>
            <h2 style={{
              fontFamily: displayFont,
              fontSize: 'clamp(28px, 3vw, 40px)',
              fontWeight: 400,
              color: '#1A1208',
              lineHeight: 1.2,
              letterSpacing: '-0.015em',
            }}>
              Not Canva. Not Midjourney. Not an agency.
            </h2>
            <p style={{
              color: '#5C5245', fontSize: '15px', lineHeight: 1.65,
              marginTop: '20px', fontFamily: bodyFont,
            }}>
              Every tool in your stack solves a different problem. Kreashot solves the one none of them touch: replacing the $8,000 product photoshoot with a two-minute pipeline.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
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
      </section>

      {/* Numbers strip */}
      <section style={{
        backgroundColor: '#F5F0E8',
        borderTop: '1px solid #DDD8CE',
        borderBottom: '1px solid #DDD8CE',
        padding: '48px 40px',
      }}>
        <div style={{
          maxWidth: '980px', margin: '0 auto',
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '32px', textAlign: 'center',
        }}>
          {[
            { stat: '20', label: 'ad variations per product shoot' },
            { stat: '< 2 min', label: 'from upload to first composite' },
            { stat: '8 steps', label: 'from packshot to Meta export' },
          ].map(({ stat, label }) => (
            <div key={stat}>
              <p style={{
                fontFamily: displayFont,
                fontSize: '40px',
                fontWeight: 400,
                color: '#1A1208',
                marginBottom: '8px',
              }}>
                {stat}
              </p>
              <p style={{ fontSize: '13px', color: '#5C5245', fontFamily: bodyFont }}>{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{
        backgroundColor: '#1A1208',
        padding: '100px 40px',
        textAlign: 'center',
      }}>
        <p style={{
          color: '#C9922A',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          marginBottom: '28px',
        }}>
          Replace your photoshoot
        </p>
        <h2 style={{
          fontFamily: displayFont,
          fontSize: 'clamp(30px, 5vw, 54px)',
          fontWeight: 400,
          color: '#F5F0E8',
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
          marginBottom: '20px',
        }}>
          Upload a product photo.<br />Get export-ready Meta ads.
        </h2>
        <p style={{
          color: '#DDD8CE',
          opacity: 0.55,
          fontSize: '16px',
          marginBottom: '44px',
          maxWidth: '380px',
          margin: '0 auto 44px',
          fontFamily: bodyFont,
          lineHeight: 1.6,
        }}>
          Set up in under 10 minutes. No credit card required.
        </p>
        <Link href="/auth/signup" style={{
          backgroundColor: '#B85C38',
          color: '#F5F0E8',
          padding: '16px 40px',
          borderRadius: '6px',
          fontSize: '16px',
          fontWeight: 600,
          textDecoration: 'none',
          display: 'inline-block',
        }}>
          Start for free
        </Link>
      </section>

      {/* Footer */}
      <footer style={{
        backgroundColor: '#1A1208',
        borderTop: '1px solid rgba(221,216,206,0.08)',
        padding: '28px 40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{
          fontFamily: displayFont,
          fontStyle: 'italic',
          fontSize: '20px',
          fontWeight: 400,
          color: '#F5F0E8',
          opacity: 0.6,
        }}>
          kreashot
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
