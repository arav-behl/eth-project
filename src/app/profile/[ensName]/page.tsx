"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { ENSProfile } from "@/lib/ens";
import { ProfileCard } from "@/components/ProfileCard";
import { SearchBar } from "@/components/SearchBar";

export default function ProfilePage() {
  const params = useParams();
  const router = useRouter();
  const ensName = params.ensName as string;

  const [profile, setProfile] = useState<ENSProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/resolve/${ensName}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to resolve ENS name");
          return;
        }
        setProfile(data);
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [ensName]);

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <button
            onClick={() => router.push("/")}
            className="text-accent-purple hover:text-accent-blue transition-colors font-semibold text-lg"
          >
            ENS Explorer
          </button>
          <SearchBar />
        </header>

        {loading && <LoadingSkeleton />}
        {error && <ErrorDisplay message={error} />}
        {profile && !loading && !error && <ProfileCard profile={profile} />}
      </div>
    </main>
  );
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex items-center gap-6">
        <div className="w-24 h-24 rounded-full bg-white/10" />
        <div className="space-y-3 flex-1">
          <div className="h-8 w-48 bg-white/10 rounded-lg" />
          <div className="h-4 w-96 bg-white/5 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 bg-white/5 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="text-center py-20">
      <div className="text-6xl mb-4">{"\u{1F50D}"}</div>
      <h2 className="text-2xl font-bold text-white mb-2">Not Found</h2>
      <p className="text-gray-400">{message}</p>
    </div>
  );
}
