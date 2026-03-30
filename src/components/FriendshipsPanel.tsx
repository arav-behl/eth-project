"use client";

import { useState, useEffect, useCallback } from "react";
import {
  createFriendship,
  listFriendships,
  removeFriendship,
  subscribeToFriendships,
  type FriendshipRecord,
} from "@/lib/friendships";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** All ENS names currently on the graph */
  graphNodeNames: string[];
  /** Called after a friendship is added or deleted so the graph can refresh */
  onFriendshipsChanged: () => void;
}

export function FriendshipsPanel({
  isOpen,
  onClose,
  graphNodeNames,
  onFriendshipsChanged,
}: Props) {
  const [friendships, setFriendships] = useState<FriendshipRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Add-friendship form state
  const [addEnsA, setAddEnsA] = useState("");
  const [addEnsB, setAddEnsB] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  // Filter
  const [filterText, setFilterText] = useState("");

  const fetchFriendships = useCallback(() => {
    setLoading(true);
    try {
      setFriendships(listFriendships());
    } catch {
      setError("Could not load friendships");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchFriendships();
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen, fetchFriendships]);

  useEffect(() => {
    if (!isOpen) return;
    return subscribeToFriendships(fetchFriendships);
  }, [fetchFriendships, isOpen]);

  const handleDelete = async (f: FriendshipRecord) => {
    setDeletingId(f.id);
    setError(null);
    setSuccessMsg(null);
    try {
      const deleted = removeFriendship(f.ens_a, f.ens_b);
      if (deleted) {
        setFriendships((prev) => prev.filter((x) => x.id !== f.id));
        setSuccessMsg(`Removed friendship: ${f.ens_a} ↔ ${f.ens_b}`);
        onFriendshipsChanged();
      } else {
        setError("Friendship not found");
      }
    } catch {
      setError("Error while deleting");
    } finally {
      setDeletingId(null);
    }
  };

  const handleAdd = async () => {
    const a = addEnsA.trim().toLowerCase();
    const b = addEnsB.trim().toLowerCase();
    if (!a || !b) {
      setError("Enter both ENS names");
      return;
    }
    const ensA = a.endsWith(".eth") ? a : `${a}.eth`;
    const ensB = b.endsWith(".eth") ? b : `${b}.eth`;
    if (ensA === ensB) {
      setError("Cannot befriend yourself");
      return;
    }

    setAddLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const result = createFriendship(ensA, ensB);
      if (result.friendship) {
        setAddEnsA("");
        setAddEnsB("");
        setSuccessMsg(`Added friendship: ${ensA} ↔ ${ensB}`);
        fetchFriendships();
        onFriendshipsChanged();
      } else {
        setError(
          result.reason === "self"
            ? "Cannot befriend yourself"
            : result.reason === "duplicate"
              ? "Friendship already exists"
              : "Enter both ENS names"
        );
      }
    } catch {
      setError("Error while adding");
    } finally {
      setAddLoading(false);
    }
  };

  const filtered = friendships.filter((f) => {
    if (!filterText) return true;
    const q = filterText.toLowerCase();
    return f.ens_a.includes(q) || f.ens_b.includes(q);
  });

  const formatDate = (iso: string) => {
    try {
      return new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 transition-all duration-300 ${
          isOpen
            ? "bg-black/50 backdrop-blur-sm pointer-events-auto"
            : "bg-transparent pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-md transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="h-full flex flex-col bg-dark-500/95 backdrop-blur-xl border-l border-white/10 shadow-2xl shadow-black/50">
          {/* Header */}
          <div className="flex-shrink-0 px-5 py-4 border-b border-white/[0.08]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-red-500/20 border border-amber-500/30 flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-amber-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white">
                    Friendships
                  </h2>
                  <p className="text-xs text-gray-500">
                    {friendships.length} relationship
                    {friendships.length !== 1 ? "s" : ""} stored
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white/[0.08] transition-colors group"
              >
                <svg
                  className="w-4 h-4 text-gray-500 group-hover:text-gray-300"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Add form */}
          <div className="flex-shrink-0 px-5 py-4 border-b border-white/[0.06]">
            <p className="text-xs font-medium text-gray-400 mb-3 uppercase tracking-wider">
              Add New Friendship
            </p>
            <div className="space-y-2.5">
              <div className="relative">
                <input
                  type="text"
                  value={addEnsA}
                  onChange={(e) => setAddEnsA(e.target.value)}
                  placeholder="First ENS (e.g. vitalik.eth)"
                  list="graph-nodes-a"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-all"
                />
                <datalist id="graph-nodes-a">
                  {graphNodeNames.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>
              <div className="flex items-center justify-center">
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-amber-500/20 to-red-500/20 border border-amber-500/20 flex items-center justify-center">
                  <svg
                    className="w-3 h-3 text-amber-400/60"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </div>
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={addEnsB}
                  onChange={(e) => setAddEnsB(e.target.value)}
                  placeholder="Second ENS (e.g. nick.eth)"
                  list="graph-nodes-b"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-all"
                />
                <datalist id="graph-nodes-b">
                  {graphNodeNames.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>
              <button
                onClick={handleAdd}
                disabled={addLoading || !addEnsA.trim() || !addEnsB.trim()}
                className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-red-500 hover:from-amber-400 hover:to-red-400 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.99]"
              >
                {addLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Saving…
                  </span>
                ) : (
                  "Add Friendship"
                )}
              </button>
            </div>
          </div>

          {/* Messages */}
          {(error || successMsg) && (
            <div className="flex-shrink-0 px-5 pt-3">
              {error && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <svg
                    className="w-3.5 h-3.5 text-red-400 flex-shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M15 9l-6 6M9 9l6 6" />
                  </svg>
                  <p className="text-xs text-red-400">{error}</p>
                </div>
              )}
              {successMsg && (
                <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <svg
                    className="w-3.5 h-3.5 text-green-400 flex-shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  <p className="text-xs text-green-400">{successMsg}</p>
                </div>
              )}
            </div>
          )}

          {/* Search / filter */}
          <div className="flex-shrink-0 px-5 py-3">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Filter friendships…"
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-white/[0.12] transition-colors"
              />
            </div>
          </div>

          {/* Friendships list */}
          <div className="flex-1 overflow-y-auto px-5 pb-5">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-6 h-6 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                <p className="text-xs text-gray-500">Loading friendships…</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
                  <svg
                    className="w-6 h-6 text-gray-600"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <p className="text-sm text-gray-400 font-medium mb-1">
                  {filterText ? "No matches" : "No friendships yet"}
                </p>
                <p className="text-xs text-gray-600 max-w-[220px]">
                  {filterText
                    ? "Try a different search term"
                    : "Use the form above to add your first friendship connection"}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[10px] text-gray-600 uppercase tracking-wider font-medium mb-2">
                  {filtered.length} friendship{filtered.length !== 1 ? "s" : ""}
                  {filterText && " found"}
                </p>
                {filtered.map((f) => {
                  const isOnGraph =
                    graphNodeNames.includes(f.ens_a) &&
                    graphNodeNames.includes(f.ens_b);
                  const isDeleting = deletingId === f.id;

                  return (
                    <div
                      key={f.id}
                      className={`group relative flex items-center gap-3 px-3.5 py-3 rounded-xl border transition-all duration-200 ${
                        isDeleting
                          ? "bg-red-500/5 border-red-500/20 opacity-60"
                          : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.12]"
                      }`}
                    >
                      {/* Connection visual */}
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        {/* Person A */}
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-500/30 to-amber-600/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                            <span className="text-[9px] font-bold text-amber-300">
                              {f.ens_a.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="text-xs text-gray-200 truncate font-medium">
                            {f.ens_a}
                          </span>
                        </div>

                        {/* Connection line */}
                        <div className="flex items-center gap-1 flex-shrink-0 px-1">
                          <div className="w-3 h-px bg-gradient-to-r from-amber-500/40 to-transparent" />
                          <svg
                            className="w-3 h-3 text-amber-400/50"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                          </svg>
                          <div className="w-3 h-px bg-gradient-to-l from-red-500/40 to-transparent" />
                        </div>

                        {/* Person B */}
                        <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-end">
                          <span className="text-xs text-gray-200 truncate font-medium text-right">
                            {f.ens_b}
                          </span>
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-red-500/30 to-red-600/20 border border-red-500/30 flex items-center justify-center flex-shrink-0">
                            <span className="text-[9px] font-bold text-red-300">
                              {f.ens_b.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Metadata & actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isOnGraph && (
                          <span className="px-1.5 py-0.5 bg-green-500/10 border border-green-500/20 rounded text-[9px] text-green-400 font-medium">
                            on graph
                          </span>
                        )}
                        <span className="text-[10px] text-gray-600 hidden sm:inline">
                          {formatDate(f.created_at)}
                        </span>
                        <button
                          onClick={() => handleDelete(f)}
                          disabled={isDeleting}
                          className="p-1.5 rounded-lg bg-transparent hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                          title={`Remove friendship between ${f.ens_a} and ${f.ens_b}`}
                        >
                          {isDeleting ? (
                            <div className="w-3.5 h-3.5 border-2 border-red-500/40 border-t-red-500 rounded-full animate-spin" />
                          ) : (
                            <svg
                              className="w-3.5 h-3.5 text-gray-500 hover:text-red-400 transition-colors"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              <line x1="10" y1="11" x2="10" y2="17" />
                              <line x1="14" y1="11" x2="14" y2="17" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 px-5 py-3 border-t border-white/[0.06]">
            <p className="text-[10px] text-gray-600 text-center">
              Friendships are stored in this browser and sync with the graph immediately
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
