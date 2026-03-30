"use client";

import { useState, useCallback, useEffect, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ENSProfile } from "@/lib/ens";
import { NetworkGraph, type GraphNode, type GraphEdge } from "@/components/NetworkGraph";
import { FriendshipsPanel } from "@/components/FriendshipsPanel";
import {
  createFriendship,
  listFriendships,
  removeFriendship,
  subscribeToFriendships,
  type FriendshipRecord,
} from "@/lib/friendships";

const SUGGESTIONS = ["vitalik.eth", "nick.eth", "brantly.eth", "sassal.eth"];

interface TxSummary {
  txCount: number;
  totalValueEth: string;
  lastTxTimestamp: number | null;
  types: string[];
}

export default function GraphPage() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [friendshipLoading, setFriendshipLoading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchTransactions = useCallback(
    async (addressA: string, addressB: string): Promise<TxSummary> => {
      try {
        const res = await fetch(
          `/api/transactions?a=${encodeURIComponent(addressA)}&b=${encodeURIComponent(addressB)}`
        );
        if (!res.ok) return { txCount: 0, totalValueEth: "0", lastTxTimestamp: null, types: [] };
        return await res.json();
      } catch {
        return { txCount: 0, totalValueEth: "0", lastTxTimestamp: null, types: [] };
      }
    },
    []
  );

  const fetchFriendships = useCallback((): FriendshipRecord[] => {
    return listFriendships();
  }, []);

  const refreshFriendshipEdges = useCallback(() => {
    const friendships = fetchFriendships();
    const currentNodeIds = new Set(nodesRef.current.map((n) => n.ensName));

    setEdges((prev) => {
      const nonFriendship = prev.filter((e) => e.edgeType !== "friendship");
      const friendshipEdges: GraphEdge[] = friendships
        .filter((f) => currentNodeIds.has(f.ens_a) && currentNodeIds.has(f.ens_b))
        .map((f) => ({
          source: f.ens_a,
          target: f.ens_b,
          txCount: 0,
          totalValueEth: "0",
          lastTxTimestamp: null,
          types: [],
          edgeType: "friendship" as const,
        }));
      return [...nonFriendship, ...friendshipEdges];
    });
  }, [fetchFriendships]);

  useEffect(() => {
    refreshFriendshipEdges();
    return subscribeToFriendships(refreshFriendshipEdges);
  }, [refreshFriendshipEdges]);

  const addNode = useCallback(
    async (rawInput: string) => {
      const name = rawInput.trim().toLowerCase();
      if (!name) return;
      const ensName = name.endsWith(".eth") ? name : `${name}.eth`;

      if (nodesRef.current.some((n) => n.ensName === ensName)) {
        setError(`${ensName} is already in the graph`);
        return;
      }

      setLoading(ensName);
      setError(null);

      try {
        const res = await fetch(`/api/resolve/${ensName}`);
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || `Failed to resolve ${ensName}`);
          return;
        }

        const profile: ENSProfile = await res.json();
        if (!profile.address) {
          setError(`${ensName} has no ETH address`);
          return;
        }

        const newNode: GraphNode = {
          id: ensName,
          ensName,
          address: profile.address,
          avatar: profile.avatar,
          displayName: profile.textRecords?.display || ensName,
          ethBalance: profile.ethBalance,
        };

        const existingNodes = nodesRef.current;
        nodesRef.current = [...existingNodes, newNode];
        setNodes(nodesRef.current);

        // Fetch transaction data between new node and all existing nodes
        if (existingNodes.length > 0) {
          setTxLoading(true);
          const txResults = await Promise.all(
            existingNodes
              .filter((n) => n.address)
              .map(async (existing) => {
                const summary = await fetchTransactions(
                  newNode.address!,
                  existing.address!
                );
                return {
                  source: existing.id,
                  target: newNode.id,
                  txCount: summary.txCount,
                  totalValueEth: summary.totalValueEth,
                  lastTxTimestamp: summary.lastTxTimestamp,
                  types: summary.types,
                  edgeType: "inferred" as const,
                };
              })
          );

          setEdges((prev) => [...prev, ...txResults]);
          setTxLoading(false);
        }

        refreshFriendshipEdges();
      } catch {
        setError(`Network error resolving ${ensName}`);
      } finally {
        setLoading(null);
      }
    },
    [fetchTransactions, refreshFriendshipEdges]
  );

  const removeNode = useCallback((ensName: string) => {
    nodesRef.current = nodesRef.current.filter((n) => n.ensName !== ensName);
    setNodes(nodesRef.current);
    setEdges((prev) => prev.filter((e) => e.source !== ensName && e.target !== ensName));
    setSelectedNodes((prev) => prev.filter((n) => n !== ensName));
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    addNode(input);
    setInput("");
  };

  const handleNodeClick = useCallback((ensName: string) => {
    window.open(`/profile/${ensName}`, "_blank");
  }, []);

  const handleNodeSelect = useCallback((ensName: string) => {
    setSelectedNodes((prev) => {
      if (prev.includes(ensName)) {
        return prev.filter((n) => n !== ensName);
      }
      if (prev.length >= 2) {
        return [prev[1], ensName];
      }
      return [...prev, ensName];
    });
  }, []);

  const handleEdgeClick = useCallback(
    async (source: string, target: string, edgeType: "inferred" | "friendship") => {
      if (edgeType !== "friendship") return;

      const confirmed = window.confirm(
        `Remove friendship between ${source} and ${target}?`
      );
      if (!confirmed) return;

      setFriendshipLoading(true);
      try {
        const deleted = removeFriendship(source, target);
        if (deleted) {
          setEdges((prev) =>
            prev.filter(
              (e) =>
                !(
                  e.edgeType === "friendship" &&
                  ((e.source === source && e.target === target) ||
                    (e.source === target && e.target === source))
                )
            )
          );
          showToast(`Removed friendship: ${source} ↔ ${target}`, "success");
        } else {
          showToast("Friendship not found", "error");
        }
      } catch {
        showToast("Error deleting friendship", "error");
      } finally {
        setFriendshipLoading(false);
      }
    },
    [showToast]
  );

  const addFriendship = useCallback(async () => {
    if (selectedNodes.length !== 2) return;

    const [ensA, ensB] = selectedNodes;
    const nodeA = nodesRef.current.find((n) => n.ensName === ensA);
    const nodeB = nodesRef.current.find((n) => n.ensName === ensB);

    setFriendshipLoading(true);
    setError(null);

    try {
      const result = createFriendship(ensA, ensB, nodeA?.address, nodeB?.address);
      if (result.friendship) {
        refreshFriendshipEdges();
        setSelectedNodes([]);
        setSelectionMode(false);
        showToast(`Friendship added: ${ensA} ↔ ${ensB}`, "success");
      } else {
        setError(
          result.reason === "self"
            ? "Cannot befriend yourself"
            : result.reason === "duplicate"
              ? "Friendship already exists"
              : "Both ENS names are required"
        );
      }
    } catch {
      setError("Error creating friendship");
    } finally {
      setFriendshipLoading(false);
    }
  }, [refreshFriendshipEdges, selectedNodes, showToast]);

  const cancelSelection = useCallback(() => {
    setSelectedNodes([]);
    setSelectionMode(false);
  }, []);

  const friendshipCount = edges.filter((e) => e.edgeType === "friendship").length;
  const inferredCount = edges.filter((e) => e.edgeType === "inferred" && e.txCount > 0).length;

  return (
    <main className="flex flex-col h-screen px-4 py-5 max-w-[1400px] mx-auto w-full">
      {/* Header */}
      <header className="flex items-center justify-between mb-5 flex-shrink-0">
        <button
          onClick={() => router.push("/")}
          className="text-accent-purple hover:text-accent-blue transition-colors font-semibold text-lg"
        >
          ENS Explorer
        </button>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold bg-gradient-to-r from-accent-purple via-accent-blue to-accent-green bg-clip-text text-transparent">
            Social Graph
          </h1>
          {/* Manage Friendships button */}
          <button
            id="manage-friendships-btn"
            onClick={() => setPanelOpen(true)}
            className="relative flex items-center gap-2 px-3.5 py-1.5 bg-gradient-to-r from-amber-500/10 to-red-500/10 hover:from-amber-500/20 hover:to-red-500/20 border border-amber-500/25 hover:border-amber-500/40 rounded-lg text-xs font-medium text-amber-300 hover:text-amber-200 transition-all group"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Manage Friendships
            {friendshipCount > 0 && (
              <span className="ml-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-amber-500/30 rounded-full text-[10px] font-bold text-amber-200 px-1">
                {friendshipCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Input */}
      <div className="flex-shrink-0 mb-4">
        <form onSubmit={handleSubmit}>
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-accent-purple to-accent-blue rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-300" />
            <div className="relative flex items-center bg-dark-100 rounded-xl border border-white/10">
              <div className="pl-4 pr-2">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Add ENS name (e.g. vitalik.eth)"
                className="flex-1 bg-transparent py-3 text-white placeholder-gray-500 focus:outline-none text-sm"
                disabled={!!loading}
              />
              <button
                type="submit"
                disabled={!!loading || !input.trim()}
                className="m-1.5 px-5 py-2 bg-gradient-to-r from-accent-purple to-accent-blue rounded-lg text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {loading ? "Resolving\u2026" : "Add"}
              </button>
            </div>
          </div>
        </form>

        {error && <p className="text-red-400/90 text-xs mt-2 ml-1">{error}</p>}
      </div>

      {/* Suggestions when empty */}
      {nodes.length === 0 && !loading && (
        <div className="flex flex-wrap items-center gap-2 mb-4 flex-shrink-0">
          <span className="text-gray-600 text-xs">Try adding:</span>
          {SUGGESTIONS.map((name) => (
            <button
              key={name}
              onClick={() => addNode(name)}
              className="px-3 py-1 bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.07] rounded-full text-xs text-gray-400 hover:text-gray-300 transition-colors"
            >
              + {name}
            </button>
          ))}
        </div>
      )}

      {/* Name chips + Friendship controls */}
      {(nodes.length > 0 || loading) && (
        <div className="flex flex-wrap items-center gap-2 mb-4 flex-shrink-0">
          {nodes.map((node) => (
            <div
              key={node.ensName}
              className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-full pl-1.5 pr-2.5 py-1 hover:bg-white/[0.07] transition-colors group"
            >
              {node.avatar ? (
                <img
                  src={node.avatar}
                  alt=""
                  className="w-5 h-5 rounded-full object-cover"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-accent-purple to-accent-blue flex items-center justify-center text-[10px] font-bold text-white">
                  {node.ensName.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-xs text-gray-300">{node.displayName}</span>
              <button
                onClick={() => removeNode(node.ensName)}
                className="text-gray-600 hover:text-red-400 transition-colors"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded-full px-3 py-1 animate-pulse">
              <div className="w-5 h-5 rounded-full bg-white/10" />
              <span className="text-xs text-gray-500">{loading}</span>
            </div>
          )}

          {/* Friendship action buttons */}
          {nodes.length >= 2 && (
            <div className="ml-auto flex items-center gap-2">
              {!selectionMode ? (
                <button
                  onClick={() => {
                    setSelectionMode(true);
                    setSelectedNodes([]);
                    setError(null);
                  }}
                  className="px-3 py-1.5 bg-gradient-to-r from-amber-500/20 to-red-500/20 hover:from-amber-500/30 hover:to-red-500/30 border border-amber-500/30 rounded-lg text-xs text-amber-300 font-medium transition-all"
                >
                  + Add Friendship
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-amber-400/80">
                    {selectedNodes.length === 0
                      ? "Select first node"
                      : selectedNodes.length === 1
                        ? "Select second node"
                        : "Ready to connect"}
                  </span>
                  {selectedNodes.length === 2 && (
                    <button
                      onClick={addFriendship}
                      disabled={friendshipLoading}
                      className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-red-500 rounded-lg text-xs text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {friendshipLoading ? "Saving\u2026" : "Confirm"}
                    </button>
                  )}
                  <button
                    onClick={cancelSelection}
                    className="px-2 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-gray-400 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Graph */}
      <div className="flex-1 min-h-0 relative">
        <NetworkGraph
          nodes={nodes}
          edges={edges}
          onNodeClick={handleNodeClick}
          selectedNodes={selectedNodes}
          onNodeSelect={handleNodeSelect}
          onEdgeClick={handleEdgeClick}
          selectionMode={selectionMode}
        />
        {txLoading && (
          <div className="absolute top-3 right-3 flex items-center gap-2 bg-dark-100/90 border border-white/10 rounded-lg px-3 py-1.5 backdrop-blur-sm">
            <div className="w-3 h-3 border-2 border-accent-purple/40 border-t-accent-purple rounded-full animate-spin" />
            <span className="text-xs text-gray-400">Checking on-chain transactions...</span>
          </div>
        )}
        {friendshipLoading && (
          <div className="absolute top-3 left-3 flex items-center gap-2 bg-dark-100/90 border border-amber-500/20 rounded-lg px-3 py-1.5 backdrop-blur-sm">
            <div className="w-3 h-3 border-2 border-amber-500/40 border-t-amber-500 rounded-full animate-spin" />
            <span className="text-xs text-amber-400/80">Updating friendships...</span>
          </div>
        )}
      </div>

      {/* Legend + Footer */}
      {nodes.length > 0 && (
        <div className="flex items-center justify-center gap-6 mt-2 flex-shrink-0">
          {inferredCount > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-0.5 bg-gradient-to-r from-accent-purple to-accent-green rounded" />
              <span className="text-[10px] text-gray-500">On-chain transactions</span>
            </div>
          )}
          {friendshipCount > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-0.5 bg-gradient-to-r from-amber-500 to-red-500 rounded" />
              <span className="text-[10px] text-gray-500">Manual friendships ({friendshipCount})</span>
            </div>
          )}
          <span className="text-[10px] text-gray-600">
            Drag nodes &middot; Scroll to zoom &middot; Click node to view profile &middot; Click friendship edge to remove
          </span>
        </div>
      )}

      {/* Friendships Panel */}
      <FriendshipsPanel
        isOpen={panelOpen}
        onClose={() => setPanelOpen(false)}
        graphNodeNames={nodes.map((n) => n.ensName)}
        onFriendshipsChanged={refreshFriendshipEdges}
      />

      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2.5 px-4 py-2.5 rounded-xl border backdrop-blur-xl shadow-2xl shadow-black/40 animate-[slideUp_0.3s_ease-out] ${
            toast.type === "success"
              ? "bg-green-500/10 border-green-500/25 text-green-300"
              : "bg-red-500/10 border-red-500/25 text-red-300"
          }`}
        >
          {toast.type === "success" ? (
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : (
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M15 9l-6 6M9 9l6 6" />
            </svg>
          )}
          <span className="text-sm font-medium">{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-1 p-0.5 rounded hover:bg-white/10 transition-colors"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </main>
  );
}
