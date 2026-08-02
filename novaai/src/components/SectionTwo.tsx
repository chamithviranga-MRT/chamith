import { ChevronRight } from 'lucide-react';
import Reveal from './Reveal';

const CAPABILITIES = [
  {
    index: '01',
    title: 'Real-time vision',
    body: 'Reads context as it happens and surfaces what matters before you ask.',
  },
  {
    index: '02',
    title: 'Layered insight',
    body: 'Moves from rough outline to sharp output without losing the thread.',
  },
  {
    index: '03',
    title: 'Adaptive speed',
    body: 'Learns your cadence and tightens every pass as you work.',
  },
];

export default function SectionTwo() {
  return (
    <section className="flex min-h-screen flex-col justify-between px-5 pb-12 pt-24 sm:px-8 sm:pt-28 md:px-12 md:pb-16 supports-[height:100svh]:min-h-[100svh]">
      <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
        <Reveal
          delay={120}
          className="inline-block self-start border-l-2 border-white bg-white/15 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-white backdrop-blur-md"
        >
          Insight On Demand
        </Reveal>

        <Reveal
          as="p"
          delay={220}
          className="max-w-sm text-lg leading-relaxed text-white drop-shadow-md sm:text-right sm:text-xl"
        >
          Our AI doesn&apos;t just respond — it interprets, sharpens, and
          delivers the signal you need.
        </Reveal>
      </div>

      <div className="flex flex-1 flex-col justify-end gap-12 md:flex-row md:items-end md:justify-between md:gap-16">
        <div className="max-w-xl">
          <Reveal
            as="h2"
            delay={180}
            className="text-5xl font-normal leading-[1.05] tracking-tight text-white drop-shadow-lg sm:text-6xl lg:text-7xl"
          >
            Learn to see
            <br />
            brilliantly.
          </Reveal>

          <Reveal
            as="p"
            delay={320}
            className="mt-6 max-w-md text-sm text-white/80 drop-shadow-md sm:text-base"
          >
            From the first sketch to the final render, Nova turns raw intent into
            decisions your team can act on — quietly, precisely, at speed.
          </Reveal>

          <Reveal delay={420} className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full bg-white px-5 py-2.5 text-xs font-medium text-black transition-colors duration-300 hover:bg-white/85 sm:text-sm"
            >
              Run the demo
              <ChevronRight size={14} />
            </button>
            <button
              type="button"
              className="rounded-full border border-white/25 bg-white/10 px-5 py-2.5 text-xs text-white backdrop-blur-md transition-colors duration-300 hover:bg-white/20 sm:text-sm"
            >
              Free consultation
            </button>
          </Reveal>
        </div>

        <div className="w-full max-w-md rounded-2xl border border-white/15 bg-white/10 px-5 backdrop-blur-md sm:px-6">
          {CAPABILITIES.map((capability, index) => (
            <Reveal
              key={capability.index}
              delay={300 + index * 110}
              className={`group flex gap-5 py-5 ${
                index < CAPABILITIES.length - 1 ? 'border-b border-white/15' : ''
              }`}
            >
              <span className="font-mono text-[11px] tracking-[0.15em] text-white/55">
                {capability.index}
              </span>
              <div>
                <div className="flex items-center gap-2 text-base font-medium text-white sm:text-lg">
                  {capability.title}
                  <ChevronRight
                    size={16}
                    className="text-white/40 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-white"
                  />
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-white/70">
                  {capability.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
