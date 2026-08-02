import { ChevronRight } from 'lucide-react';
import Reveal from './Reveal';

const SERVICES = [
  '/ AI AUTOMATION',
  '/ AI INTEGRATION',
  '/ AI AGENT DEVELOPMENT',
];

const PORTRAIT_URL =
  'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260728_050334_5b076e26-0ce7-4898-b432-d764190e448f.png&w=1280&q=85';

export default function SectionOne() {
  return (
    <section className="flex min-h-screen flex-col justify-between px-5 pb-12 pt-24 sm:px-8 sm:pt-28 md:px-12 md:pb-16 supports-[height:100svh]:min-h-[100svh]">
      <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          {SERVICES.map((service, index) => (
            <Reveal
              key={service}
              delay={150 + index * 120}
              className="font-mono text-xs uppercase tracking-[0.15em] text-white/90 drop-shadow-md"
            >
              {service}
            </Reveal>
          ))}
        </div>

        <Reveal
          as="p"
          delay={300}
          className="max-w-xs text-lg leading-relaxed text-white drop-shadow-md sm:text-right sm:text-xl"
        >
          We design automation that brings clarity, precision, and efficiency to
          the way your company operates.
        </Reveal>
      </div>

      <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <div>
          <Reveal
            delay={150}
            className="mb-5 inline-block border-l-2 border-white bg-white/15 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-white backdrop-blur-md"
          >
            We Automate 100+ Businesses
          </Reveal>

          <Reveal
            as="h1"
            delay={280}
            className="text-5xl font-normal leading-[1.05] tracking-tight text-white drop-shadow-lg sm:text-6xl lg:text-7xl"
          >
            Clear. Precise.
            <br />
            Automated.
          </Reveal>
        </div>

        <Reveal delay={420}>
          <div className="flex items-center gap-4 rounded-xl bg-white/15 p-3 backdrop-blur-md">
            <img
              src={PORTRAIT_URL}
              alt="Mitha, co-founder of NovaAI"
              className="h-24 w-20 rounded-lg object-cover"
            />
            <div className="flex flex-col gap-1.5 pr-2">
              <span className="text-sm font-medium text-white">
                Talk with Mitha
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/60">
                Co-founder of NovaAI
              </span>
              <button
                type="button"
                className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-white px-4 py-2 text-xs font-medium text-black transition-colors duration-300 hover:bg-white/85"
              >
                Book 15-mins call
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
