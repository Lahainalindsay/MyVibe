"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { ConnectButton } from "../../components/ConnectButton";
import { useVibeBalance } from "../../hooks/useVibeBalance";
import { shortAddress } from "../../utils/format";

type SetupStep = "name" | "choose" | "space-theme" | "space-time" | "avatar" | "done";

const SPACE_THEMES = ["Natural", "City", "Galactic", "Home", "Ocean", "Minimal Studio"];

export default function MyVibePage() {
  const router = useRouter();
  const { isConnected, address } = useAccount();
  const { displayBalance } = useVibeBalance(address);

  const [step, setStep] = React.useState<SetupStep>("name");
  const [nameInput, setNameInput] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [spaceTheme, setSpaceTheme] = React.useState("");
  const [timeOfDay, setTimeOfDay] = React.useState<"Day" | "Night" | "">("");

  if (!isConnected) {
    return (
      <main className="min-h-screen vibe-bg px-4 py-12">
        <div className="max-w-xl mx-auto card-surface rounded-2xl p-6">
          <h1 className="font-heading text-2xl text-white/90">MY VIBE</h1>
          <p className="mt-3 text-white/65 text-sm">Connect your wallet to begin your guided setup.</p>
          <div className="mt-6">
            <ConnectButton />
          </div>
          <Link href="/" className="mt-4 inline-block text-sm text-white/70 hover:text-white">
            Return to landing
          </Link>
        </div>
      </main>
    );
  }

  function submitName() {
    const cleaned = nameInput.trim();
    if (!cleaned) return;
    setUsername(cleaned);
    setStep("choose");
  }

  return (
    <main className="min-h-screen vibe-bg overflow-hidden">
      <div className="starfield absolute inset-0" />

      <div className="relative z-10">
        <header className="flex items-center justify-between px-4 md:px-8 py-4 border-b border-white/10">
          <div className="text-sm text-white/75">
            <span className="text-white/45">Wallet:</span> <span className="font-mono">{address ? shortAddress(address) : "--"}</span>
          </div>
          <div className="text-sm text-white/75">
            <span className="text-white/45">VIBE Holdings:</span> {displayBalance}
          </div>
          <button
            type="button"
            onClick={() => router.push(`/app/${address?.toLowerCase()}`)}
            className="btn-quiet rounded-xl px-4 py-2 text-sm text-white/90"
          >
            Return to Dashboard
          </button>
        </header>

        <section className="h-[calc(100vh-70px)] p-4 md:p-8 flex items-start justify-center">
          <div className="w-full max-w-3xl card-surface rounded-2xl p-6 md:p-8">
            <p className="text-xs tracking-[0.25em] uppercase text-white/50">AI Guide</p>
            <p className="mt-3 text-white/85">Welcome to your VIBE World.</p>
            <p className="mt-2 text-white/75">Lets give this space your VIBE.</p>

            {step === "name" ? (
              <div className="mt-6">
                <p className="text-white/90">First, Lets create your user name.</p>
                <p className="text-xs text-white/55 mt-1">This will be your VIBE World user name.</p>
                <div className="mt-3 flex gap-3">
                  <input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Enter your VIBE name"
                    className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-white placeholder:text-white/40 outline-none focus:border-white/35"
                  />
                  <button type="button" onClick={submitName} className="btn-primary rounded-xl px-4 py-2 text-white text-sm">
                    Continue
                  </button>
                </div>
              </div>
            ) : null}

            {step !== "name" ? <p className="mt-6 text-white/90">Welcome, {username}.</p> : null}

            {step === "choose" ? (
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" onClick={() => setStep("space-theme")} className="btn-primary rounded-xl px-4 py-2 text-sm text-white">
                  Design Space
                </button>
                <button type="button" onClick={() => setStep("avatar")} className="btn-quiet rounded-xl px-4 py-2 text-sm text-white/85">
                  Design Avatar
                </button>
              </div>
            ) : null}

            {step === "avatar" ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-white/80">Avatar customization is queued next. Start with your space theme now, then return to avatar details.</p>
                <button type="button" onClick={() => setStep("space-theme")} className="mt-3 btn-primary rounded-xl px-4 py-2 text-sm text-white">
                  Continue to Space Design
                </button>
              </div>
            ) : null}

            {step === "space-theme" ? (
              <div className="mt-6">
                <p className="text-white/90">Choose your base space style:</p>
                <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3">
                  {SPACE_THEMES.map((theme) => (
                    <button
                      key={theme}
                      type="button"
                      onClick={() => {
                        setSpaceTheme(theme);
                        setStep("space-time");
                      }}
                      className="btn-quiet rounded-xl px-4 py-3 text-sm text-white/85"
                    >
                      {theme}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {step === "space-time" ? (
              <div className="mt-6">
                <p className="text-white/90">Great choice: {spaceTheme}. Do you want day or night?</p>
                <div className="mt-3 flex gap-3">
                  {(["Day", "Night"] as const).map((time) => (
                    <button
                      key={time}
                      type="button"
                      onClick={() => {
                        setTimeOfDay(time);
                        setStep("done");
                      }}
                      className="btn-primary rounded-xl px-4 py-2 text-sm text-white"
                    >
                      {time}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {step === "done" ? (
              <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-white/90">Setup complete.</p>
                <p className="mt-2 text-white/70 text-sm">
                  Space: {spaceTheme} ({timeOfDay}). You can refine your space and avatar from this MY VIBE area any time.
                </p>
                <button type="button" onClick={() => setStep("choose")} className="mt-4 btn-quiet rounded-xl px-4 py-2 text-sm text-white/85">
                  Edit Choices
                </button>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
