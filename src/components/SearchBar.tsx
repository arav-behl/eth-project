"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function SearchBar() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const name = query.trim().toLowerCase();
    if (!name) return;
    const resolved = name.endsWith(".eth") ? name : `${name}.eth`;
    router.push(`/profile/${resolved}`);
    setQuery("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search ENS..."
        className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accent-purple/50 w-56 transition-colors"
      />
      <button
        type="submit"
        className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors"
      >
        <svg
          className="w-4 h-4 text-gray-400"
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
      </button>
    </form>
  );
}
