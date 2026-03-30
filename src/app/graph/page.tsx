"use client";

import { useState, useCallback, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ENSProfile } from "@/lib/ens";
import { NetworkGraph, type GraphNode, type GraphEdge } from "@/components/NetworkGraph";
import { FriendshipsPanel } from "@/components/FriendshipsPanel";

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
  const [panelOpen, setPanelOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);

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
        const res = await fetch(
          `/api/transactions?a=${encodeURIComponent(addressA)}&b=${encodeURIComponent(addressB)}`
        );
        if (!res.ok) return empty;
        return await res.json();
      } catch {
        return empty;
      }
    },
    []
  );

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
                const rel = await fetchRelationship(newNode.address!, existing.address!);
                return {
                  source: existing.id,
                  target: newNode.id,
                  directTxCount: rel.directTxCount,
                  totalValueEth: rel.totalValueEth,
                  lastTxTimestamp: rel.lastTxTimestamp,
                  sharedTokens: rel.sharedTokens,
                  sharedContracts: rel.sharedContracts,
                  sharedContractDetails: rel.sharedContractDetails,
                  recentInteractions: rel.recentInteractions,
                  strength: rel.strength,
                  label: rel.label,
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
      } catch {
        setError(`Network error resolving ${ensName}`);
      } finally {
        setLoading(null);
      }
    },
    [fetchRelationship]
  );

  const removeNode = useCallback((ensName: string) => {
    nodesRef.current = nodesRef.current.filter((node) => node.ensName !== ensName);
    setNodes(nodesRef.current);
    setEdges((prev) => {
      const nextEdges = prev.filter((edge) => edge.source !== ensName && edge.target !== ensName);
      setSelectedEdgeKey((current) => chooseSelectedEdge(nextEdges, current));
      return nextEdges;
    });
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

  const strongEdges = [...edges]
    .filter((edge) => edge.strength > 0)
    .sort((left, right) => right.strength - left.strength || right.directTxCount - left.directTxCount);
  const selectedEdge =
    strongEdges.find((edge) => buildEdgeKey(edge.source, edge.target) === selectedEdgeKey) ?? strongEdges[0] ?? null;
  const selectedSource = selectedEdge
    ? nodes.find((node) => node.id === selectedEdge.source) ?? null
    : null;
  const selectedTarget = selectedEdge
    ? nodes.find((node) => node.id === selectedEdge.target) ?? null
    : null;

  return (
    <main className="flex flex-col h-screen px-4 py-5 max-w-[1600px] mx-auto w-full">
      <header className="flex items-center justify-between mb-5 flex-shrink-0">
        <button
          onClick={() => router.push("/")}
          className="text-accent-purple hover:text-accent-blue transition-colors font-semibold text-lg"
        >
          ENS Explorer
        </button>
        <h1 className="text-xl font-bold bg-gradient-to-r from-accent-purple via-accent-blue to-accent-green bg-clip-text text-transparent">
          Social Graph
        </h1>
        <button
          onClick={() => setPanelOpen(true)}
          className="relative flex items-center gap-2 px-3.5 py-1.5 bg-gradient-to-r from-amber-500/10 to-red-500/10 hover:from-amber-500/20 hover:to-red-500/20 border border-amber-500/25 hover:border-amber-500/40 rounded-lg text-xs font-medium text-amber-300 hover:text-amber-200 transition-all group"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
          </svg>
          Manage Friendships
        </button>
      </header>

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
                {loading ? "Resolving..." : "Add"}
              </button>
            </div>
          </div>
        </form>

        {error && <p className="text-red-400/90 text-xs mt-2 ml-1">{error}</p>}
      </div>

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

      {(nodes.length > 0 || loading) && (
        <div className="flex items-start justify-between gap-4 mb-4 flex-shrink-0">
          <div className="flex flex-wrap gap-2 min-w-0">
            {nodes.map((node) => (
              <div
                key={node.ensName}
                className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-full pl-1.5 pr-2.5 py-1 hover:bg-white/[0.07] transition-colors group"
              >
                {node.avatar ? (
                  <img src={node.avatar} alt="" className="w-5 h-5 rounded-full object-cover" />
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
          </div>

          {nodes.length >= 2 && !txLoading && (
            <div className="flex-shrink-0 flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-1.5">
              <div className="text-center">
                <div className="text-xs font-semibold text-white">{strongEdges.length}</div>
                <div className="text-[9px] text-gray-500">links</div>
              </div>
              <div className="w-px h-5 bg-white/10" />
              <div className="text-center">
                <div className="text-xs font-semibold text-white">{nodes.length}</div>
                <div className="text-[9px] text-gray-500">nodes</div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
        <div className="min-h-[420px] xl:min-h-0 relative">
          <NetworkGraph
            nodes={nodes}
            edges={edges}
            onNodeClick={handleNodeClick}
            onEdgeSelect={(edge) => setSelectedEdgeKey(buildEdgeKey(edge.source, edge.target))}
            selectedEdgeKey={selectedEdge ? buildEdgeKey(selectedEdge.source, selectedEdge.target) : null}
          />
          {txLoading && (
            <div className="absolute top-3 right-3 flex items-center gap-2 bg-dark-100/90 border border-white/10 rounded-lg px-3 py-1.5 backdrop-blur-sm">
              <div className="w-3 h-3 border-2 border-accent-purple/40 border-t-accent-purple rounded-full animate-spin" />
              <span className="text-xs text-gray-400">Analyzing on-chain relationships...</span>
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
        <p className="text-center text-gray-600 text-[10px] mt-2 flex-shrink-0">
          Drag nodes to rearrange · Scroll to zoom · Click a node to open its profile · Click a link to inspect the relationship
        </p>
      )}

      <FriendshipsPanel
        isOpen={panelOpen}
        onClose={() => setPanelOpen(false)}
        graphNodeNames={nodes.map((n) => n.ensName)}
        onFriendshipsChanged={() => {}}
      />

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slideUp">
          <div className={`px-4 py-2 rounded-lg text-sm font-medium ${
            toast.type === "success" ? "bg-green-500/90 text-white" : "bg-red-500/90 text-white"
          }`}>
            {toast.message}
          </div>
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
    <aside className="min-h-[320px] xl:min-h-0 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm overflow-hidden">
      <div className="p-4 border-b border-white/8">
        <div className="text-[11px] uppercase tracking-[0.2em] text-gray-500 mb-2">Relationship Inspector</div>
        {selectedEdge && selectedSource && selectedTarget ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <IdentityBadge node={selectedSource} />
              <div className="text-gray-600 text-xs">↔</div>
              <IdentityBadge node={selectedTarget} align="right" />
            </div>
            <p className="text-xs text-gray-400 mt-3 leading-relaxed">{selectedEdge.label}</p>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <MetricCard label="Interactions" value={String(selectedEdge.directTxCount)} />
              <MetricCard label="Shared Contracts" value={String(selectedEdge.sharedContracts)} />
              <MetricCard label="ETH Value" value={selectedEdge.totalValueEth} />
              <MetricCard label="Last Seen" value={formatTimestamp(selectedEdge.lastTxTimestamp)} />
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-400 leading-relaxed">
            Add at least two ENS names, then click a link in the graph. The details move here so the canvas stays readable.
          </p>
        )}
      </div>

      <div className="p-4 space-y-5 overflow-y-auto max-h-[calc(100vh-290px)] xl:max-h-full">
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-white">Connections in Graph</h2>
            <span className="text-[11px] text-gray-500">{edges.length}</span>
          </div>
          <div className="space-y-2">
            {edges.length > 0 ? (
              edges.map((edge) => {
                const source = nodes.find((node) => node.id === edge.source);
                const target = nodes.find((node) => node.id === edge.target);
                if (!source || !target) return null;

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
                      <div className="text-xs font-medium text-white">
                        {source.displayName} · {target.displayName}
                      </div>
                      <div className="text-[11px] text-accent-blue">{edge.directTxCount} tx</div>
                    </div>
                    <div className="text-[11px] text-gray-500 mt-1 line-clamp-2">{edge.label}</div>
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
                    <div className="text-[11px] text-gray-400 mt-1">
                      {shortenAddress(interaction.from)} → {shortenAddress(interaction.to)}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-1">{formatTimestamp(interaction.timestamp)}</div>
                  </div>
                ))
              ) : (
                <EmptySidebarState text="No direct transfers captured for this pair." />
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
                      <div className="text-[11px] text-gray-500 font-mono">{shortenAddress(contract.address)}</div>
                    </div>
                    <a
                      href={`https://eth.blockscout.com/address/${contract.address}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-accent-blue hover:text-white transition-colors"
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
    <div className={`flex items-center gap-2 min-w-0 ${align === "right" ? "text-right flex-row-reverse" : ""}`}>
      {node.avatar ? (
        <img src={node.avatar} alt="" className="w-10 h-10 rounded-full object-cover border border-white/10" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent-purple to-accent-blue flex items-center justify-center text-sm font-bold text-white border border-white/10">
          {node.ensName.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0">
        <div className="text-sm font-semibold text-white truncate">{node.displayName}</div>
        <div className="text-[11px] text-gray-500 font-mono truncate">{shortenAddress(node.address)}</div>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-sm font-semibold text-white mt-1">{value}</div>
    </div>
  );
}

function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-white mb-2">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function EmptySidebarState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-xs text-gray-500">
      {text}
    </div>
  );
}
