"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { ConnectButton } from "../../components/ConnectButton";
import { CinematicShell } from "../../components/CinematicShell";
import { APP_URL, CONTRACT_URL, DISCORD_URL, HOME_URL, VIBE_WORLD_URL, WHITEPAPER_URL, X_URL } from "../../utils/publicLinks";

function NavLink({ href, label }: { href?: string; label: string }) {
  if (!href) {
    return (
      <span aria-label={label} title={`${label} link not configured`} className="text-white/35 cursor-not-allowed">
        {label}
      </span>
    );
  }

  const external = href.startsWith("http://") || href.startsWith("https://");
  return (
    <a
      href={href}
      aria-label={label}
      className="hover:text-white transition"
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer noopener" : undefined}
    >
      {label}
    </a>
  );
}

export default function Landing() {
  const router = useRouter();
  const { isConnected, address } = useAccount();

  React.useEffect(() => {
    if (!isConnected || !address) return;
    router.push(`${APP_URL}/${address.toLowerCase()}`);
  }, [isConnected, address, router]);

  return (
    <CinematicShell>
      <main className="max-w-5xl mx-auto px-6 py-10 md:py-14" aria-label="VIBE landing">
        <div className="flex items-center justify-between gap-4">
          <a href={HOME_URL} className="text-sm tracking-[0.25em] text-white/70 hover:text-white transition">
            VIBE
          </a>
          <div className="flex gap-6 text-xs text-white/70">
            <NavLink href={WHITEPAPER_URL} label="Whitepaper" />
            <NavLink href={CONTRACT_URL} label="Contract" />
            <NavLink href={X_URL} label="X" />
            <NavLink href={DISCORD_URL} label="Discord" />
          </div>
        </div>

        <section className="mt-16 rounded-2xl bg-black/35 border border-white/10 p-8 md:p-10 backdrop-blur-md shadow-[0_20px_80px_rgba(0,0,0,0.55)]">
          <p className="text-xs uppercase tracking-[0.3em] text-white/60">VIBE Protocol</p>
          <h1 className="mt-4 text-3xl md:text-5xl font-semibold tracking-tight">Your Vibe. Your Token. Your World.</h1>
          <p className="mt-4 max-w-2xl text-sm md:text-base text-white/75">
            VIBE is a wallet-native ecosystem where identity, community, and onchain utility meet. Launch access starts in
            the app today, while VIBE World is preparing for release.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <ConnectButton
              label="Connect Wallet"
              onConnected={() => {
                if (!address) return;
                router.push(`${APP_URL}/${address.toLowerCase()}`);
              }}
            />
            <a
              href={WHITEPAPER_URL || "#"}
              target={WHITEPAPER_URL ? "_blank" : undefined}
              rel={WHITEPAPER_URL ? "noreferrer noopener" : undefined}
              className={`rounded-xl px-5 py-3 text-sm tracking-wide border transition ${
                WHITEPAPER_URL
                  ? "bg-white/10 border-white/20 text-white hover:bg-white/15"
                  : "bg-white/5 border-white/10 text-white/45 cursor-not-allowed pointer-events-none"
              }`}
              aria-disabled={!WHITEPAPER_URL}
            >
              Read Whitepaper
            </a>
            <Link href={VIBE_WORLD_URL} className="rounded-xl px-5 py-3 text-sm tracking-wide bg-white text-black hover:bg-white/90 transition">
              VIBE World
            </Link>
          </div>
        </section>

        <section className="mt-10 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-white/5 border border-white/10 p-5">
            <h2 className="text-lg font-medium text-white/90">What is VIBE?</h2>
            <p className="mt-2 text-sm text-white/70">
              A community-driven token designed for expression, social coordination, and wallet-based ownership.
            </p>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-5">
            <h2 className="text-lg font-medium text-white/90">Launch Ready</h2>
            <p className="mt-2 text-sm text-white/70">
              The app and contract links are live on this landing page so users can connect and verify onchain access quickly.
            </p>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-5">
            <h2 className="text-lg font-medium text-white/90">VIBE World Status</h2>
            <p className="mt-2 text-sm text-white/70">
              VIBE World is not public yet. The route now opens a complete coming-soon page for launch communication.
            </p>
          </div>
        </section>

        <section className="mt-8 rounded-2xl bg-white/5 border border-white/10 p-6 md:p-8">
          <h2 className="text-xl font-semibold text-white/90">Why VIBE</h2>
          <p className="mt-3 text-white/70 text-sm leading-relaxed">
            VIBE is structured for phased growth: accessible wallet onboarding now, open contract transparency, and an expanding
            social layer through VIBE World. This gives users immediate utility while setting clear expectations for what ships next.
          </p>

          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <a
              href={CONTRACT_URL || "#"}
              target={CONTRACT_URL ? "_blank" : undefined}
              rel={CONTRACT_URL ? "noreferrer noopener" : undefined}
              className={`rounded-xl px-4 py-2 border transition ${
                CONTRACT_URL
                  ? "bg-white/10 border-white/20 text-white hover:bg-white/15"
                  : "bg-white/5 border-white/10 text-white/45 cursor-not-allowed pointer-events-none"
              }`}
              aria-disabled={!CONTRACT_URL}
            >
              View Contract
            </a>
            <Link href={APP_URL} className="rounded-xl px-4 py-2 border border-white/20 bg-transparent hover:bg-white/10 transition">
              Open App
            </Link>
            <Link href={VIBE_WORLD_URL} className="rounded-xl px-4 py-2 border border-white/20 bg-transparent hover:bg-white/10 transition">
              VIBE World Coming Soon
            </Link>
          </div>
        </section>
      </main>
    </CinematicShell>
  );
}
