'use client'

import { useState } from 'react'

const displayFont = '"Canela", var(--font-playfair), "Georgia", serif'
const bodyFont = 'var(--font-inter), system-ui, sans-serif'

const FAQS = [
  {
    q: 'How long does it take to get my first ad?',
    a: 'Under 2 minutes from the moment you upload a product photo. The pipeline runs in parallel: angled shots, backgrounds, and copy all generate simultaneously.',
  },
  {
    q: 'Do I need a professional product photo to start?',
    a: 'No. A standard packshot against any background works. Kreashot removes the background, generates studio-grade angles, and places the product into lifestyle scenes. You do not need a photographer.',
  },
  {
    q: 'Can I upload my brand kit?',
    a: 'Yes. Upload your logo, primary colours, fonts, and tone-of-voice guidelines. Every composite and copy line is generated against your brand profile.',
  },
  {
    q: 'What ad formats does the export support?',
    a: 'All Meta-standard formats: 1:1 (feed), 4:5 (feed), 9:16 (stories and reels), 16:9 (display). One-click CSV export for Meta Ads Manager.',
  },
  {
    q: 'Is there a free trial?',
    a: 'Yes. Sign up with no credit card required. You get 3 full pipeline runs to evaluate quality before choosing a plan.',
  },
]

export function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <div>
      {FAQS.map(({ q, a }, i) => (
        <div
          key={i}
          style={{
            borderTop: '1px solid rgba(221,216,206,0.1)',
            borderBottom: i === FAQS.length - 1 ? '1px solid rgba(221,216,206,0.1)' : 'none',
          }}
        >
          <button
            onClick={() => setOpen(open === i ? null : i)}
            style={{
              width: '100%',
              background: 'none',
              border: 'none',
              padding: '26px 0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              textAlign: 'left',
              gap: '24px',
            }}
          >
            <span style={{
              fontFamily: displayFont,
              fontSize: 'clamp(17px, 2vw, 21px)',
              fontWeight: 400,
              color: '#F5F0E8',
              lineHeight: 1.3,
            }}>
              {q}
            </span>
            <span style={{
              color: '#C9922A',
              fontSize: '26px',
              lineHeight: 1,
              flexShrink: 0,
              display: 'block',
              transform: open === i ? 'rotate(45deg)' : 'rotate(0deg)',
              transition: 'transform 0.25s ease',
              fontWeight: 300,
            }}>
              +
            </span>
          </button>

          <div style={{
            maxHeight: open === i ? '300px' : '0',
            overflow: 'hidden',
            transition: 'max-height 0.35s ease',
          }}>
            <p style={{
              fontFamily: bodyFont,
              fontSize: '15px',
              color: '#DDD8CE',
              lineHeight: 1.75,
              opacity: 0.75,
              margin: '0 0 28px',
              maxWidth: '620px',
            }}>
              {a}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
