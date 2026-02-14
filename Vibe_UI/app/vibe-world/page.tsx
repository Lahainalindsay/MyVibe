import Link from "next/link";
import { APP_URL, CONTRACT_URL, WHITEPAPER_URL } from "../../utils/publicLinks";

export default function VibeWorldPage() {
  return (
    <main className="min-h-screen vibe-bg px-4 py-12 md:py-16">
      <div className="starfield absolute inset-0" />
      <div className="relative z-10 max-w-5xl mx-auto card-surface rounded-2xl p-6 md:p-10">
        <p className="text-xs tracking-[0.28em] uppercase text-white/50 font-heading">VIBE World</p>
        <h1 className="mt-3 font-heading text-3xl md:text-4xl text-white/90">Coming Soon</h1>

        <p className="mt-5 text-white/75 leading-relaxed">
          VIBE World is in active production and not publicly released yet. The app and token contract are ready now, and this
          page serves as the official launch placeholder until the world experience goes live.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <section className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-white/90 font-heading">Current Status</h2>
            <p className="mt-2 text-sm text-white/70">Frontend, systems, and progression design are still being finalized.</p>
          </section>

          <section className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-white/90 font-heading">What Launches First</h2>
            <p className="mt-2 text-sm text-white/70">Wallet connection, VIBE app access, and contract transparency are live.</p>
          </section>

          <section className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-white/90 font-heading">What Is Next</h2>
            <p className="mt-2 text-sm text-white/70">Avatar identity, social spaces, and challenges will be introduced in phases.</p>
          </section>
        </div>

        <div className="mt-8 rounded-xl border border-white/10 bg-black/20 p-4">
          <h2 className="text-white/90 font-heading text-lg">In The Meantime</h2>
          <p className="mt-2 text-sm text-white/70">
            You can already connect your wallet, open the VIBE app, review the contract, and read the project whitepaper.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/" className="btn-primary rounded-xl px-4 py-2 text-sm text-white">
            Return to Landing
          </Link>
          <Link href={APP_URL} className="btn-quiet rounded-xl px-4 py-2 text-sm text-white/85">
            Open App
          </Link>
          <a
            href={CONTRACT_URL || "#"}
            target={CONTRACT_URL ? "_blank" : undefined}
            rel={CONTRACT_URL ? "noreferrer noopener" : undefined}
            className={`rounded-xl px-4 py-2 text-sm border ${
              CONTRACT_URL
                ? "border-white/20 bg-white/5 text-white/90 hover:bg-white/10"
                : "border-white/10 bg-white/5 text-white/45 cursor-not-allowed pointer-events-none"
            }`}
            aria-disabled={!CONTRACT_URL}
          >
            View Contract
          </a>
          <a
            href={WHITEPAPER_URL || "#"}
            target={WHITEPAPER_URL ? "_blank" : undefined}
            rel={WHITEPAPER_URL ? "noreferrer noopener" : undefined}
            className={`rounded-xl px-4 py-2 text-sm border ${
              WHITEPAPER_URL
                ? "border-white/20 bg-white/5 text-white/90 hover:bg-white/10"
                : "border-white/10 bg-white/5 text-white/45 cursor-not-allowed pointer-events-none"
            }`}
            aria-disabled={!WHITEPAPER_URL}
          >
            Read Whitepaper
          </a>
        </div>
      </div>
    </main>
  );
}
