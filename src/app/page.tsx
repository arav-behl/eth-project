"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [ensName, setEnsName] = useState("");
  const router = useRouter();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const name = ensName.trim().toLowerCase();
    if (!name) return;
    const resolved = name.endsWith(".eth") ? name : `${name}.eth`;
    router.push(`/profile/${resolved}`);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-2xl text-center">
        <div className="mb-2">
          <span className="text-5xl font-bold bg-gradient-to-r from-accent-purple via-accent-blue to-accent-green bg-clip-text text-transparent">
            ENS Explorer
          </span>
        </div>
        <p className="text-gray-400 mb-10 text-lg">
          Look up any Ethereum Name Service profile on-chain
        </p>

        <form onSubmit={handleSubmit} className="relative">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-accent-purple to-accent-blue rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-300" />
            <div className="relative flex items-center bg-dark-100 rounded-2xl border border-white/10">
              <div className="pl-5 pr-3">
                <svg
                  className="w-5 h-5 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <input
                type="text"
                value={ensName}
                onChange={(e) => setEnsName(e.target.value)}
                placeholder="Enter ENS name (e.g. vitalik.eth)"
                className="flex-1 bg-transparent py-4 text-lg text-white placeholder-gray-500 focus:outline-none"
              />
              <button
                type="submit"
                className="m-2 px-6 py-2.5 bg-gradient-to-r from-accent-purple to-accent-blue rounded-xl text-white font-medium hover:opacity-90 transition-opacity"
              >
                Explore
              </button>
            </div>
          </div>
        </form>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <span className="text-gray-500 text-sm">Try:</span>
          {["vitalik.eth", "nick.eth", "brantly.eth"].map((name) => (
            <button
              key={name}
              onClick={() => {
                setEnsName(name);
                router.push(`/profile/${name}`);
              }}
              className="px-4 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-sm text-gray-300 transition-colors"
            >
              {name}
            </button>
          ))}
        </div>

        <div className="mt-8">
          <button
            onClick={() => router.push("/graph")}
            className="mx-auto flex items-center gap-2.5 px-5 py-2.5 bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 rounded-xl text-sm text-gray-400 hover:text-white transition-all"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="2.5" />
              <circle cx="4.5" cy="7" r="1.8" />
              <circle cx="19.5" cy="7" r="1.8" />
              <circle cx="4.5" cy="17" r="1.8" />
              <circle cx="19.5" cy="17" r="1.8" />
              <line x1="6.2" y1="7.8" x2="9.8" y2="10.8" opacity="0.5" />
              <line x1="17.8" y1="7.8" x2="14.2" y2="10.8" opacity="0.5" />
              <line x1="6.2" y1="16.2" x2="9.8" y2="13.2" opacity="0.5" />
              <line x1="17.8" y1="16.2" x2="14.2" y2="13.2" opacity="0.5" />
            </svg>
            Build Social Graph
          </button>
        </div>
      </div>
    </main>
  );
}
