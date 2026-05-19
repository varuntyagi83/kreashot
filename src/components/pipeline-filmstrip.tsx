'use client'

import { useEffect, useState } from 'react'
import {
  Box,
  ScanLine,
  Sunset,
  Sparkles,
  PenLine,
  LayoutTemplate,
  Rocket,
  LayoutGrid,
} from 'lucide-react'

const bodyFont = 'var(--font-inter), system-ui, sans-serif'

// Alternating brand accent colours keep the eye moving across the strip
const PIPELINE = [
  { Icon: Box,            label: 'Products',      accent: '#C9922A' },
  { Icon: ScanLine,       label: 'Angled Shots',  accent: '#2D4A35' },
  { Icon: Sunset,         label: 'Scenes',        accent: '#B85C38' },
  { Icon: Sparkles,       label: 'Photoshoots',   accent: '#4A7C59' },
  { Icon: PenLine,        label: 'Ad Copy',       accent: '#C9922A' },
  { Icon: LayoutTemplate, label: 'Templates',     accent: '#2D4A35' },
  { Icon: Rocket,         label: 'Ads',           accent: '#B85C38' },
  { Icon: LayoutGrid,     label: 'Collage',       accent: '#4A7C59' },
]

const STEP_MS = 1500

// Animated double-chevron arrow.
// The `animKey` prop changes each time this arrow should fire, which remounts
// the element and re-triggers the CSS keyframe animation.
function FlowArrow({ active, animKey }: { active: boolean; animKey: string }) {
  return (
    <div
      key={animKey}
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        padding: '0 1px',
        animation: active ? 'krea-arrow-shoot 0.65s ease-out forwards' : 'none',
        opacity: active ? undefined : 0.3,
      }}
    >
      <svg width="22" height="14" viewBox="0 0 22 14" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* First chevron */}
        <path
          d="M2 3 L7 7 L2 11"
          stroke={active ? '#C9922A' : '#C4B49A'}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transition: 'stroke 0.3s ease' }}
        />
        {/* Second chevron — slightly offset for depth */}
        <path
          d="M8 3 L13 7 L8 11"
          stroke={active ? '#C9922A' : '#C4B49A'}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={active ? 0.75 : 0.5}
          style={{ transition: 'stroke 0.3s ease, opacity 0.3s ease' }}
        />
        {/* Third chevron — subtle trail */}
        <path
          d="M14 3 L19 7 L14 11"
          stroke={active ? '#C9922A' : '#C4B49A'}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={active ? 0.45 : 0.25}
          style={{ transition: 'stroke 0.3s ease, opacity 0.3s ease' }}
        />
      </svg>
    </div>
  )
}

export function PipelineFilmstrip() {
  const [active, setActive] = useState(0)
  // Tracks how many times each arrow has fired so the key changes on every cycle
  const [fireCounts, setFireCounts] = useState<number[]>(Array(PIPELINE.length - 1).fill(0))

  useEffect(() => {
    const id = setInterval(() => {
      setActive(prev => {
        const next = (prev + 1) % PIPELINE.length
        setFireCounts(counts => {
          const updated = [...counts]
          // Increment the fire count for the arrow AFTER the current step
          if (prev < counts.length) updated[prev] = (updated[prev] ?? 0) + 1
          return updated
        })
        return next
      })
    }, STEP_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <section style={{ backgroundColor: '#F5F0E8', overflowX: 'hidden', width: '100%' }}>

      {/* Top film border */}
      <div style={{ backgroundColor: '#1A1208', width: '100%' }}>
        <div style={{ padding: '12px 40px 8px' }}>
          <p style={{
            color: '#C9922A', fontSize: '10px', fontWeight: 700,
            letterSpacing: '0.18em', textTransform: 'uppercase', margin: 0,
          }}>
            The 8-step pipeline
          </p>
        </div>
        <svg width="100%" height="28" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
          <defs>
            <pattern id="perfs-top" x="12" width="23" height="28" patternUnits="userSpaceOnUse">
              <rect x="0" y="8" width="16" height="12" rx="3" fill="#F5F0E8" />
            </pattern>
          </defs>
          <rect width="100%" height="28" fill="url(#perfs-top)" />
        </svg>
      </div>

      {/* Steps */}
      <div style={{
        backgroundColor: '#EDE6D9',
        padding: '28px 16px',
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        boxSizing: 'border-box',
      }}>
        {PIPELINE.map(({ Icon, label, accent }, i) => (
          <div key={label} style={{ display: 'contents' }}>
            {/* Step card */}
            <div style={{
              flex: '1 1 0',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              minWidth: 0,
            }}>
              <div style={{
                width: 'clamp(40px, 5.5vw, 56px)',
                height: 'clamp(40px, 5.5vw, 56px)',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                // Tinted background when active
                backgroundColor: active === i ? `${accent}1A` : '#F5F0E8',
                border: `1.5px solid ${active === i ? accent : '#C4B49A'}`,
                boxShadow: active === i
                  ? `0 8px 20px ${accent}40, 0 2px 6px ${accent}25`
                  : '0 1px 3px rgba(26,18,8,0.08)',
                // Spring-style bounce via cubic-bezier
                transform: active === i ? 'scale(1.18) translateY(-3px)' : 'scale(1) translateY(0)',
                transition: 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.35s ease, border-color 0.3s ease, background-color 0.3s ease',
              }}>
                <Icon
                  size={20}
                  color={active === i ? accent : '#5C5245'}
                  strokeWidth={1.5}
                  style={{ transition: 'color 0.3s ease' } as React.CSSProperties}
                />
              </div>
              <span style={{
                color: active === i ? accent : '#5C5245',
                fontSize: 'clamp(8px, 0.85vw, 10px)',
                fontWeight: active === i ? 700 : 500,
                textAlign: 'center',
                fontFamily: bodyFont,
                lineHeight: 1.3,
                width: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                transition: 'color 0.3s ease',
              }}>
                {label}
              </span>
            </div>

            {/* Arrow between steps — fires when this step is active */}
            {i < PIPELINE.length - 1 && (
              <FlowArrow
                active={active === i}
                animKey={`${i}-${fireCounts[i]}`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Bottom film border */}
      <div style={{ backgroundColor: '#1A1208', width: '100%' }}>
        <svg width="100%" height="28" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
          <defs>
            <pattern id="perfs-bot" x="12" width="23" height="28" patternUnits="userSpaceOnUse">
              <rect x="0" y="8" width="16" height="12" rx="3" fill="#F5F0E8" />
            </pattern>
          </defs>
          <rect width="100%" height="28" fill="url(#perfs-bot)" />
        </svg>
      </div>

    </section>
  )
}
