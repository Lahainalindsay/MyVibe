import React from "react";
import { CONTRACT_URL, DISCORD_URL, X_URL } from "../utils/publicLinks";

function FooterLink({ href, label }: { href?: string; label: string }) {
  if (!href) {
    return (
      <span className="text-white/30 cursor-not-allowed" aria-label={`${label} not configured`}>
        {label}
      </span>
    );
  }

  return (
    <a className="hover:text-white/85 transition" href={href} target="_blank" rel="noreferrer noopener">
      {label}
    </a>
  );
}

export function FooterLinks() {
  return (
    <footer className="w-full max-w-5xl mx-auto px-6 py-10 text-xs text-white/55 flex items-center justify-between">
      <div className="tracking-[0.35em] uppercase">VIBE ©</div>
      <div className="flex items-center gap-6">
        <FooterLink href={CONTRACT_URL} label="Contract" />
        <FooterLink href={X_URL} label="X" />
        <FooterLink href={DISCORD_URL} label="Discord" />
      </div>
    </footer>
  );
}
