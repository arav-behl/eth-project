"use client";

import { useState, useCallback, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ENSProfile } from "@/lib/ens";
import { NetworkGraph, type GraphNode, type GraphEdge } from "@/components/NetworkGraph";

const SUGGESTIONS = ["vitalik.eth", "nick.eth", "brantly.eth", "sassal.eth"];

interface RelationshipResponse {
  directTxCount: number;
  totalValueEth: string;
  lastTxTimestamp: number | null;
  aToB: number;
  bToA: number;
  sharedTokens: string[];
  sharedContracts: number;
  strength: number;
  label: string;
}

export default function GraphPage() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);

  const fetchRelationship = useCallback(
    async (addressA: string, addressB: string): Promise<RelationshipResponse> => {
      const empty: RelationshipResponse = {
        directTxCount: 0, totalValueEth: "0", lastTxTimestamp: null,
        aToB: 0, bToA: 0, sharedTokens: [], sharedContracts: 0,
        strength: 0, label: "no on-chain link",
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

        // Fetch relationship data between new node and all existing nodes
        if (existingNodes.length > 0) {
          setTxLoading(true);
          const results = await Promise.all(
            existingNodes
              .filter((n) => n.address)
              .map(async (existing) => {
                const rel = await fetchRelationship(newNode.address!, existing.address!);
                const edge: GraphEdge = {
                  source: existing.id,
                  target: newNode.id,
                  directTxCount: rel.directTxCount,
                  totalValueEth: rel.totalValueEth,
                  lastTxTimestamp: rel.lastTxTimestamp,
                  sharedTokens: rel.sharedTokens,
                  sharedContracts: rel.sharedContracts,
                  strength: rel.strength,
                  label: rel.label,
                };
                return edge;
              })
          );

          setEdges((prev) => [...prev, ...results]);
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
    nodesRef.current = nodesRef.current.filter((n) => n.ensName !== ensName);
    setNodes(nodesRef.current);
    setEdges((prev) => prev.filter((e) => e.source !== ensName && e.target !== ensName));
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

  // Summary stats
  const strongEdges = edges.filter((e) => e.strength > 0);

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
        <h1 className="text-xl font-bold bg-gradient-to-r from-accent-purple via-accent-blue to-accent-green bg-clip-text text-transparent">
          Social Graph
        </h1>
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

      {/* Name chips + stats */}
      {(nodes.length > 0 || loading) && (
        <div className="flex items-start justify-between gap-4 mb-4 flex-shrink-0">
          <div className="flex flex-wrap gap-2 min-w-0">
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
          </div>

          {/* Stats badge */}
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

      {/* Graph */}
      <div className="flex-1 min-h-0 relative">
        <NetworkGraph nodes={nodes} edges={edges} onNodeClick={handleNodeClick} />
        {txLoading && (
          <div className="absolute top-3 right-3 flex items-center gap-2 bg-dark-100/90 border border-white/10 rounded-lg px-3 py-1.5 backdrop-blur-sm">
            <div className="w-3 h-3 border-2 border-accent-purple/40 border-t-accent-purple rounded-full animate-spin" />
            <span className="text-xs text-gray-400">Analyzing on-chain relationships...</span>
          </div>
        )}
      </div>

      {/* Footer hint */}
      {nodes.length > 0 && (
        <p className="text-center text-gray-600 text-[10px] mt-2 flex-shrink-0">
          Drag nodes to rearrange &middot; Scroll to zoom &middot; Click node to view profile
          &middot; Hover edges for details &middot; Thicker lines = stronger on-chain relationship
        </p>
      )}
    </main>
  );
}
