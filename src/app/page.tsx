import Link from 'next/link'
import { Sparkles, ImageIcon, Layers, Zap } from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#07070f] text-white">

      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-8 py-5 border-b border-white/5 backdrop-blur-md bg-[#07070f]/80">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-900/50">
            <span className="text-white font-bold text-sm leading-none">K</span>
          </div>
          <span className="text-xl font-bold tracking-tight">Kreashot</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/auth/login"
            className="text-sm text-white/50 hover:text-white transition-colors px-4 py-2 rounded-lg"
          >
            Sign in
          </Link>
          <Link
            href="/auth/signup"
            className="text-sm bg-violet-600 hover:bg-violet-500 transition-colors text-white px-4 py-2 rounded-lg font-medium shadow-lg shadow-violet-900/30"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center min-h-screen text-center px-6 pt-20">
        {/* Background glows */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[55%] w-[900px] h-[700px] rounded-full bg-violet-700/10 blur-[130px]" />
          <div className="absolute top-1/3 left-1/4 w-[500px] h-[400px] rounded-full bg-indigo-600/6 blur-[110px]" />
          <div className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] rounded-full bg-violet-800/8 blur-[100px]" />
        </div>
        {/* Top edge line */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />

        {/* Badge */}
        <div className="relative mb-8 inline-flex items-center gap-2 rounded-full border border-violet-500/25 bg-violet-500/8 px-4 py-1.5 text-xs text-violet-300 font-medium tracking-wide">
          <Sparkles className="h-3 w-3" />
          AI-powered ad creative pipeline
        </div>

        {/* Headline */}
        <h1 className="relative max-w-4xl text-5xl sm:text-6xl lg:text-[72px] font-bold tracking-tight leading-[1.05]">
          Ad creatives that{' '}
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: 'linear-gradient(135deg, #a78bfa 0%, #818cf8 50%, #60a5fa 100%)' }}
          >
            convert, at scale
          </span>
        </h1>

        {/* Subheadline */}
        <p className="relative mt-7 max-w-lg text-lg text-white/40 leading-relaxed">
          Upload your product photos, set your brand voice, and generate
          pixel-perfect ad creatives for every format in minutes.
        </p>

        {/* CTAs */}
        <div className="relative mt-10 flex items-center gap-4 flex-wrap justify-center">
          <Link
            href="/auth/signup"
            className="bg-violet-600 hover:bg-violet-500 transition-all text-white px-8 py-3.5 rounded-xl font-semibold text-sm shadow-xl shadow-violet-900/40"
          >
            Get started free
          </Link>
          <Link
            href="/auth/login"
            className="border border-white/10 hover:border-white/20 hover:bg-white/5 transition-all text-white/60 hover:text-white px-8 py-3.5 rounded-xl font-medium text-sm"
          >
            Sign in &rarr;
          </Link>
        </div>

        {/* Decorative format grid */}
        <div className="relative mt-24 w-full max-w-4xl mx-auto grid grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { aspect: 'aspect-square', from: 'from-violet-900/35', to: 'to-indigo-900/35' },
            { aspect: 'aspect-video', from: 'from-slate-800/50', to: 'to-slate-900/50' },
            { aspect: 'aspect-[9/16] max-h-40', from: 'from-indigo-900/30', to: 'to-violet-900/30' },
            { aspect: 'aspect-[4/5]', from: 'from-violet-900/25', to: 'to-slate-900/40' },
            { aspect: 'aspect-square', from: 'from-indigo-900/35', to: 'to-violet-800/25' },
            { aspect: 'aspect-video', from: 'from-violet-900/30', to: 'to-indigo-900/40' },
          ].map((item, i) => (
            <div
              key={i}
              className={`${item.aspect} rounded-2xl bg-gradient-to-br ${item.from} ${item.to} border border-white/5 flex items-center justify-center opacity-50`}
            >
              <div className="h-6 w-6 rounded-md bg-white/8" />
            </div>
          ))}
        </div>
        <p className="relative mt-4 text-xs text-white/18 tracking-widest uppercase">
          1:1 &nbsp;&middot;&nbsp; 16:9 &nbsp;&middot;&nbsp; 9:16 &nbsp;&middot;&nbsp; 4:5
        </p>
      </section>

      {/* Features */}
      <section className="py-28 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-white mb-3">
            The full pipeline, in one place
          </h2>
          <p className="text-center text-white/30 mb-16 text-base">
            From raw product photo to campaign-ready creative
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                icon: ImageIcon,
                title: 'AI product photography',
                desc: 'Generate studio-quality composites with custom backgrounds. No photographer, no studio, no waiting.',
              },
              {
                icon: Layers,
                title: 'Brand voice at scale',
                desc: 'Upload your brand kit once. Every headline, tagline, and CTA stays on-brand across every asset you generate.',
              },
              {
                icon: Zap,
                title: 'Multi-format export',
                desc: 'Square, portrait, landscape, story. One product shoot, every ad placement, all pixel-perfect.',
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="rounded-2xl border border-white/6 bg-white/[0.025] p-8 hover:bg-white/[0.04] hover:border-white/10 transition-all"
              >
                <div className="mb-5 h-11 w-11 rounded-xl bg-violet-600/15 border border-violet-500/20 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-violet-400" />
                </div>
                <h3 className="font-semibold text-base text-white mb-2.5">{title}</h3>
                <p className="text-sm text-white/35 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section className="py-20 px-6">
        <div className="max-w-2xl mx-auto">
          <div className="relative rounded-3xl border border-violet-500/15 bg-gradient-to-br from-violet-900/20 via-violet-900/10 to-indigo-900/20 p-16 text-center overflow-hidden">
            {/* Inner glow */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-64 h-64 rounded-full bg-violet-600/10 blur-[80px]" />
            </div>
            <h2 className="relative text-4xl font-bold text-white mb-4">Ready to create?</h2>
            <p className="relative text-white/35 mb-10 text-base leading-relaxed">
              Set up your brand and launch your first ad creative in under 10 minutes.
            </p>
            <Link
              href="/auth/signup"
              className="relative inline-block bg-violet-600 hover:bg-violet-500 transition-colors text-white px-10 py-3.5 rounded-xl font-semibold text-sm shadow-xl shadow-violet-900/50"
            >
              Get started free
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 px-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-violet-600 flex items-center justify-center">
            <span className="text-white font-bold text-xs leading-none">K</span>
          </div>
          <span className="text-xs text-white/25">© 2026 Kreashot</span>
        </div>
        <span className="text-xs text-white/20">Built by Raygency</span>
      </footer>
    </div>
  )
}
