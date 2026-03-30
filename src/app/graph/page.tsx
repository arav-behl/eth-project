"use client";

import { useState, useCallback, useEffect, useRef, type FormEvent, type ReactNode } from "react";
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

interface RelationshipResponse {
  directTxCount: number;
  totalValueEth: string;
  lastTxTimestamp: number | null;
  aToB: number;
  bToA: number;
  sharedTokens: string[];
  sharedContracts: number;
  sharedContractDetails: Array<{
    address: string;
    label: string;
  }>;
  recentInteractions: Array<{
    hash: string;
    timestamp: number | null;
    kind: "native" | "token";
    from: string | null;
    to: string | null;
    value: string;
    asset: string;
  }>;
  strength: number;
  label: string;
}

function buildEdgeKey(source: string, target: string): string {
  return [source, target].sort().join("::");
}

function shortenAddress(address: string | null): string {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatTimestamp(timestamp: number | null): string {
  if (!timestamp) return "Unknown";
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function chooseSelectedEdge(nextEdges: GraphEdge[], currentEdgeKey: string | null): string | null {
  if (currentEdgeKey && nextEdges.some((edge) => buildEdgeKey(edge.source, edge.target) === currentEdgeKey)) {
    return currentEdgeKey;
  }

  const strongest = [...nextEdges]
    .filter((edge) => edge.strength > 0)
    .sort((left, right) => right.strength - left.strength || right.directTxCount - left.directTxCount)[0];

  return strongest ? buildEdgeKey(strongest.source, strongest.target) : null;
}

export default function GraphPage() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEdgeKey, setSelectedEdgeKey] = useState<string | null>(null);
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

  const fetchRelationship = useCallback(
    async (addressA: string, addressB: string): Promise<RelationshipResponse> => {
      const empty: RelationshipResponse = {
        directTxCount: 0,
        totalValueEth: "0",
        lastTxTimestamp: null,
        aToB: 0,
        bToA: 0,
        sharedTokens: [],
        sharedContracts: 0,
        sharedContractDetails: [],
        recentInteractions: [],
        strength: 0,
        label: "no on-chain link",
      };

      try {
        const res = await fetch(`/api/transactions?a=${encodeURIComponent(addressA)}&b=${encodeURIComponent(addressB)}`);
        if (!res.ok) return empty;
        return await res.json();
      } catch {
        return empty;
      }
    },
    []
  );

  const fetchFriendships = useCallback((): FriendshipRecord[] => {
    return listFriendships();
  }, []);

  const refreshFriendshipEdges = useCallback(() => {
    const friendships = fetchFriendships();
    const currentNodeIds = new Set(nodesRef.current.map((node) => node.ensName));

    setEdges((prev) => {
      const nonFriendship = prev.filter((edge) => edge.edgeType !== "friendship");
      const friendshipEdges: GraphEdge[] = friendships
        .filter((friendship) => currentNodeIds.has(friendship.ens_a) && currentNodeIds.has(friendship.ens_b))
        .map((friendship) => ({
          source: friendship.ens_a,
          target: friendship.ens_b,
          directTxCount: 0,
          totalValueEth: "0",
          lastTxTimestamp: null,
          sharedTokens: [],
          sharedContracts: 0,
          sharedContractDetails: [],
          recentInteractions: [],
          strength: 0,
          label: "manual friendship",
          edgeType: "friendship" as const,
        }));

      const nextEdges = [...nonFriendship, ...friendshipEdges];
      setSelectedEdgeKey((current) => chooseSelectedEdge(nextEdges, current));
      return nextEdges;
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

      if (nodesRef.current.some((node) => node.ensName === ensName)) {
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

        if (existingNodes.length > 0) {
          setTxLoading(true);
          const results = await Promise.all(
            existingNodes
              .filter((node) => node.address)
              .map(async (existing) => {
                const relationship = await fetchRelationship(newNode.address!, existing.address!);
                return {
                  source: existing.id,
                  target: newNode.id,
                  directTxCount: relationship.directTxCount,
                  totalValueEth: relationship.totalValueEth,
                  lastTxTimestamp: relationship.lastTxTimestamp,
                  sharedTokens: relationship.sharedTokens,
                  sharedContracts: relationship.sharedContracts,
                  sharedContractDetails: relationship.sharedContractDetails,
                  recentInteractions: relationship.recentInteractions,
                  strength: relationship.strength,
                  label: relationship.label,
                  edgeType: "inferred" as const,
                } satisfies GraphEdge;
              })
          );

          setEdges((prev) => {
            const nextEdges = [...prev, ...results];
            setSelectedEdgeKey((current) => chooseSelectedEdge(nextEdges, current));
            return nextEdges;
          });
          setTxLoading(false);
        }

        refreshFriendshipEdges();
      } catch {
        setError(`Network error resolving ${ensName}`);
      } finally {
        setLoading(null);
      }
    },
    [fetchRelationship, refreshFriendshipEdges]
  );

  const removeNode = useCallback((ensName: string) => {
    nodesRef.current = nodesRef.current.filter((node) => node.ensName !== ensName);
    setNodes(nodesRef.current);
    setEdges((prev) => {
      const nextEdges = prev.filter((edge) => edge.source !== ensName && edge.target !== ensName);
      setSelectedEdgeKey((current) => chooseSelectedEdge(nextEdges, current));
      return nextEdges;
    });
    setSelectedNodes((prev) => prev.filter((node) => node !== ensName));
  }, []);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
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
        return prev.filter((node) => node !== ensName);
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

      const confirmed = window.confirm(`Remove friendship between ${source} and ${target}?`);
      if (!confirmed) return;

      setFriendshipLoading(true);
      try {
        const deleted = removeFriendship(source, target);
        if (deleted) {
          setEdges((prev) => {
            const nextEdges = prev.filter(
              (edge) =>
                !(
                  edge.edgeType === "friendship" &&
                  ((edge.source === source && edge.target === target) ||
                    (edge.source === target && edge.target === source))
                )
            );
            setSelectedEdgeKey((current) => chooseSelectedEdge(nextEdges, current));
            return nextEdges;
          });
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
    const nodeA = nodesRef.current.find((node) => node.ensName === ensA);
    const nodeB = nodesRef.current.find((node) => node.ensName === ensB);

    setFriendshipLoading(true);
    setError(null);

    try {
      const result = createFriendship(ensA, ensB, nodeA?.address, nodeB?.address);
      if (result.friendship) {
        refreshFriendshipEdges();
        setSelectedEdgeKey(buildEdgeKey(ensA, ensB));
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

  const friendshipCount = edges.filter((edge) => edge.edgeType === "friendship").length;
  const connectionCount = edges.filter((edge) => edge.strength > 0 || edge.edgeType === "friendship").length;

  const strongEdges = [...edges]
    .filter((edge) => edge.strength > 0 || edge.edgeType === "friendship")
    .sort((left, right) => {
      if (left.edgeType === "friendship" && right.edgeType !== "friendship") return -1;
      if (right.edgeType === "friendship" && left.edgeType !== "friendship") return 1;
      return right.strength - left.strength || right.directTxCount - left.directTxCount;
    });

  const selectedEdge =
    edges.find((edge) => buildEdgeKey(edge.source, edge.target) === selectedEdgeKey) ?? strongEdges[0] ?? null;
  const selectedSource = selectedEdge ? nodes.find((node) => node.id === selectedEdge.source) ?? null : null;
  const selectedTarget = selectedEdge ? nodes.find((node) => node.id === selectedEdge.target) ?? null : null;

  return (
    <main className="flex h-screen w-full max-w-[1600px] mx-auto flex-col px-4 py-5">
      <header className="mb-5 flex shrink-0 items-center justify-between">
        <button
          onClick={() => router.push("/")}
          className="text-lg font-semibold text-accent-purple transition-colors hover:text-accent-blue"
        >
          ENS Explorer
        </button>
        <div className="flex items-center gap-3">
          <h1 className="bg-gradient-to-r from-accent-purple via-accent-blue to-accent-green bg-clip-text text-xl font-bold text-transparent">
            Social Graph
          </h1>
          <button
            id="manage-friendships-btn"
            onClick={() => setPanelOpen(true)}
            className="group relative flex items-center gap-2 rounded-lg border border-amber-500/25 bg-gradient-to-r from-amber-500/10 to-red-500/10 px-3.5 py-1.5 text-xs font-medium text-amber-300 transition-all hover:border-amber-500/40 hover:from-amber-500/20 hover:to-red-500/20 hover:text-amber-200"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Manage Friendships
            {friendshipCount > 0 && (
              <span className="ml-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-500/30 px-1 text-[10px] font-bold text-amber-200">
                {friendshipCount}
              </span>
            )}
          </button>
        </div>
      </header>

      <div className="mb-4 shrink-0">
        <form onSubmit={handleSubmit}>
          <div className="group relative">
            <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-accent-purple to-accent-blue opacity-20 blur transition duration-300 group-hover:opacity-40" />
            <div className="relative flex items-center rounded-xl border border-white/10 bg-dark-100">
              <div className="pl-4 pr-2">
                <svg className="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <input
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Add ENS name (e.g. vitalik.eth)"
                className="flex-1 bg-transparent py-3 text-sm text-white placeholder-gray-500 focus:outline-none"
                disabled={!!loading}
              />
              <button
                type="submit"
                disabled={!!loading || !input.trim()}
                className="m-1.5 rounded-lg bg-gradient-to-r from-accent-purple to-accent-blue px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
              >
                {loading ? "Resolving..." : "Add"}
              </button>
            </div>
          </div>
        </form>

        {error && <p className="ml-1 mt-2 text-xs text-red-400/90">{error}</p>}
      </div>

      {nodes.length === 0 && !loading && (
        <div className="mb-4 flex shrink-0 flex-wrap items-center gap-2">
          <span className="text-xs text-gray-600">Try adding:</span>
          {SUGGESTIONS.map((name) => (
            <button
              key={name}
              onClick={() => addNode(name)}
              className="rounded-full border border-white/[0.07] bg-white/[0.03] px-3 py-1 text-xs text-gray-400 transition-colors hover:bg-white/[0.08] hover:text-gray-300"
            >
              + {name}
            </button>
          ))}
        </div>
      )}

      {(nodes.length > 0 || loading) && (
        <div className="mb-4 flex shrink-0 items-start justify-between gap-4">
          <div className="flex min-w-0 flex-wrap gap-2">
            {nodes.map((node) => (
              <div
                key={node.ensName}
                className="group flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] pl-1.5 pr-2.5 py-1 transition-colors hover:bg-white/[0.07]"
              >
                {node.avatar ? (
                  <img src={node.avatar} alt="" className="h-5 w-5 rounded-full object-cover" />
                ) : (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-accent-purple to-accent-blue text-[10px] font-bold text-white">
                    {node.ensName.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-xs text-gray-300">{node.displayName}</span>
                <button
                  onClick={() => removeNode(node.ensName)}
                  className="text-gray-600 transition-colors hover:text-red-400"
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1 animate-pulse">
                <div className="h-5 w-5 rounded-full bg-white/10" />
                <span className="text-xs text-gray-500">{loading}</span>
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-start justify-end gap-2">
            {nodes.length >= 2 && (
              <>
                {!selectionMode ? (
                  <button
                    onClick={() => {
                      setSelectionMode(true);
                      setSelectedNodes([]);
                      setError(null);
                    }}
                    className="rounded-lg border border-amber-500/30 bg-gradient-to-r from-amber-500/20 to-red-500/20 px-3 py-1.5 text-xs font-medium text-amber-300 transition-all hover:from-amber-500/30 hover:to-red-500/30"
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
                        className="rounded-lg bg-gradient-to-r from-amber-500 to-red-500 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        {friendshipLoading ? "Saving..." : "Confirm"}
                      </button>
                    )}
                    <button
                      onClick={cancelSelection}
                      className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-gray-400 transition-colors hover:bg-white/10"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {!txLoading && (
                  <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5">
                    <div className="text-center">
                      <div className="text-xs font-semibold text-white">{connectionCount}</div>
                      <div className="text-[9px] text-gray-500">links</div>
                    </div>
                    <div className="h-5 w-px bg-white/10" />
                    <div className="text-center">
                      <div className="text-xs font-semibold text-white">{nodes.length}</div>
                      <div className="text-[9px] text-gray-500">nodes</div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative min-h-[420px] xl:min-h-0">
          <NetworkGraph
            nodes={nodes}
            edges={edges}
            onNodeClick={handleNodeClick}
            selectedNodes={selectedNodes}
            onNodeSelect={handleNodeSelect}
            onEdgeClick={handleEdgeClick}
            selectionMode={selectionMode}
            onEdgeSelect={(edge) => setSelectedEdgeKey(buildEdgeKey(edge.source, edge.target))}
            selectedEdgeKey={selectedEdge ? buildEdgeKey(selectedEdge.source, selectedEdge.target) : null}
          />
          {txLoading && (
            <div className="absolute right-3 top-3 flex items-center gap-2 rounded-lg border border-white/10 bg-dark-100/90 px-3 py-1.5 backdrop-blur-sm">
              <div className="h-3 w-3 rounded-full border-2 border-accent-purple/40 border-t-accent-purple animate-spin" />
              <span className="text-xs text-gray-400">Analyzing on-chain relationships...</span>
            </div>
          )}
          {friendshipLoading && (
            <div className="absolute left-3 top-3 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-dark-100/90 px-3 py-1.5 backdrop-blur-sm">
              <div className="h-3 w-3 rounded-full border-2 border-amber-500/40 border-t-amber-500 animate-spin" />
              <span className="text-xs text-amber-400/80">Updating friendships...</span>
            </div>
          )}
        </div>

        <RelationshipSidebar
          nodes={nodes}
          edges={strongEdges}
          selectedEdge={selectedEdge}
          selectedSource={selectedSource}
          selectedTarget={selectedTarget}
          onSelectEdge={(edge) => setSelectedEdgeKey(buildEdgeKey(edge.source, edge.target))}
        />
      </div>

      {nodes.length > 0 && (
        <p className="mt-2 shrink-0 text-center text-[10px] text-gray-600">
          Drag nodes to rearrange · Scroll to zoom · Click a node to open its profile · Click a friendship edge to remove · Click a link to inspect the relationship
        </p>
      )}

      <FriendshipsPanel
        isOpen={panelOpen}
        onClose={() => setPanelOpen(false)}
        graphNodeNames={nodes.map((node) => node.ensName)}
        onFriendshipsChanged={refreshFriendshipEdges}
      />

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2.5 rounded-xl border px-4 py-2.5 shadow-2xl shadow-black/40 backdrop-blur-xl animate-[slideUp_0.3s_ease-out] ${
            toast.type === "success"
              ? "border-green-500/25 bg-green-500/10 text-green-300"
              : "border-red-500/25 bg-red-500/10 text-red-300"
          }`}
        >
          {toast.type === "success" ? (
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : (
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M15 9l-6 6M9 9l6 6" />
            </svg>
          )}
          <span className="text-sm font-medium">{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-1 rounded p-0.5 transition-colors hover:bg-white/10">
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </main>
  );
}

function RelationshipSidebar({
  nodes,
  edges,
  selectedEdge,
  selectedSource,
  selectedTarget,
  onSelectEdge,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedEdge: GraphEdge | null;
  selectedSource: GraphNode | null;
  selectedTarget: GraphNode | null;
  onSelectEdge: (edge: GraphEdge) => void;
}) {
  return (
    <aside className="flex min-h-[320px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm xl:min-h-0">
      <div className="shrink-0 border-b border-white/8 p-4">
        <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-gray-500">Relationship Inspector</div>
        {selectedEdge && selectedSource && selectedTarget ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <IdentityBadge node={selectedSource} />
              <div className="text-xs text-gray-600">↔</div>
              <IdentityBadge node={selectedTarget} align="right" />
            </div>

            {selectedEdge.edgeType === "friendship" && (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] font-medium tracking-wide text-amber-400">
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                MANUAL FRIENDSHIP
              </div>
            )}

            <p className="mt-3 text-xs leading-relaxed text-gray-400">{selectedEdge.label}</p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <MetricCard label="Interactions" value={String(selectedEdge.directTxCount)} />
              <MetricCard label="Shared Contracts" value={String(selectedEdge.sharedContracts)} />
              <MetricCard label="ETH Value" value={selectedEdge.totalValueEth} />
              <MetricCard label="Last Seen" value={formatTimestamp(selectedEdge.lastTxTimestamp)} />
            </div>
          </>
        ) : (
          <p className="text-sm leading-relaxed text-gray-400">
            Add at least two ENS names, then click a link in the graph. The details move here so the canvas stays readable.
          </p>
        )}
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4 xl:max-h-full">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Connections in Graph</h2>
            <span className="text-[11px] text-gray-500">{edges.length}</span>
          </div>
          <div className="space-y-2">
            {edges.length > 0 ? (
              edges.map((edge) => {
                const source = nodes.find((node) => node.id === edge.source);
                const target = nodes.find((node) => node.id === edge.target);
                if (!source || !target) return null;

                const isFriendship = edge.edgeType === "friendship";

                return (
                  <button
                    key={buildEdgeKey(edge.source, edge.target)}
                    onClick={() => onSelectEdge(edge)}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                      selectedEdge && buildEdgeKey(selectedEdge.source, selectedEdge.target) === buildEdgeKey(edge.source, edge.target)
                        ? "border-accent-blue/60 bg-accent-blue/10"
                        : "border-white/8 bg-white/[0.02] hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-white">
                        {source.displayName} · {target.displayName}
                        {isFriendship && <div className="h-2 w-2 rounded-full bg-amber-500" title="Friendship" />}
                      </div>
                      <div className="min-w-[30px] text-right text-[11px] text-accent-blue">{edge.directTxCount} tx</div>
                    </div>
                    <div className="mt-1 line-clamp-2 text-[11px] text-gray-500">{edge.label}</div>
                  </button>
                );
              })
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-xs text-gray-500">
                No relationships detected yet.
              </div>
            )}
          </div>
        </div>

        {selectedEdge && (
          <>
            <SidebarSection title="Recent Interactions">
              {selectedEdge.recentInteractions.length > 0 ? (
                selectedEdge.recentInteractions.map((interaction) => (
                  <div
                    key={`${interaction.hash}-${interaction.kind}-${interaction.asset}`}
                    className="rounded-xl border border-white/8 bg-black/20 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-white">
                        {interaction.value} {interaction.asset}
                      </span>
                      <span className="text-[11px] uppercase tracking-wide text-gray-500">{interaction.kind}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-gray-400">
                      {shortenAddress(interaction.from)} → {shortenAddress(interaction.to)}
                    </div>
                    <div className="mt-1 text-[11px] text-gray-500">{formatTimestamp(interaction.timestamp)}</div>
                  </div>
                ))
              ) : (
                <EmptySidebarState
                  text={
                    selectedEdge.edgeType === "friendship"
                      ? "No on-chain interactions recorded for this friendship yet."
                      : "No direct transfers captured for this pair."
                  }
                />
              )}
            </SidebarSection>

            <SidebarSection title="Shared Tokens">
              {selectedEdge.sharedTokens.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedEdge.sharedTokens.map((token) => (
                    <span
                      key={token}
                      className="rounded-full border border-accent-purple/30 bg-accent-purple/10 px-2.5 py-1 text-[11px] text-accent-purple"
                    >
                      {token}
                    </span>
                  ))}
                </div>
              ) : (
                <EmptySidebarState text="No overlapping token contracts found." />
              )}
            </SidebarSection>

            <SidebarSection title="Shared Contracts">
              {selectedEdge.sharedContractDetails.length > 0 ? (
                selectedEdge.sharedContractDetails.map((contract) => (
                  <div
                    key={contract.address}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/20 px-3 py-2"
                  >
                    <div>
                      <div className="text-xs font-medium text-white">{contract.label}</div>
                      <div className="text-[11px] font-mono text-gray-500">{shortenAddress(contract.address)}</div>
                    </div>
                    <a
                      href={`https://eth.blockscout.com/address/${contract.address}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-accent-blue transition-colors hover:text-white"
                    >
                      open
                    </a>
                  </div>
                ))
              ) : (
                <EmptySidebarState text="No shared contracts detected for this relationship." />
              )}
            </SidebarSection>
          </>
        )}
      </div>
    </aside>
  );
}

function IdentityBadge({
  node,
  align = "left",
}: {
  node: GraphNode;
  align?: "left" | "right";
}) {
  return (
    <div className={`flex min-w-0 items-center gap-2 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      {node.avatar ? (
        <img src={node.avatar} alt="" className="h-10 w-10 rounded-full border border-white/10 object-cover" />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-accent-purple to-accent-blue text-sm font-bold text-white">
          {node.ensName.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-white">{node.displayName}</div>
        <div className="truncate font-mono text-[11px] text-gray-500">{shortenAddress(node.address)}</div>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function SidebarSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-white">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function EmptySidebarState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-xs text-gray-500">{text}</div>;
}
