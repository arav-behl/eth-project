"use client";

import {
  useEffect,
  useRef,
  useReducer,
  useCallback,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
  type Simulation,
} from "d3-force";

export interface GraphNode {
  id: string;
  ensName: string;
  address: string | null;
  avatar: string | null;
  displayName: string;
  ethBalance: string | null;
}

export interface GraphEdge {
  source: string;
  target: string;
  txCount: number;
  totalValueEth: string;
  lastTxTimestamp: number | null;
  types: string[]; // e.g. ["eth", "erc20", "internal"]
  edgeType: "inferred" | "friendship";
}

interface SimNode extends SimulationNodeDatum {
  id: string;
  ensName: string;
  address: string | null;
  avatar: string | null;
  displayName: string;
  ethBalance: string | null;
}

type SimLink = SimulationLinkDatum<SimNode>;

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick: (ensName: string) => void;
  selectedNodes: string[];
  onNodeSelect: (ensName: string) => void;
  onEdgeClick: (source: string, target: string, edgeType: "inferred" | "friendship") => void;
  selectionMode: boolean;
}

function shortenAddress(address: string | null): string {
  if (!address) return "";
  return `${address.slice(0, 6)}\u2026${address.slice(-4)}`;
}

function getSourceId(link: SimLink): string {
  return typeof link.source === "object" ? (link.source as SimNode).id : String(link.source);
}

function getTargetId(link: SimLink): string {
  return typeof link.target === "object" ? (link.target as SimNode).id : String(link.target);
}

function getSimNode(link: SimLink, which: "source" | "target"): SimNode | null {
  const val = link[which];
  return typeof val === "object" ? (val as SimNode) : null;
}

export function NetworkGraph({
  nodes,
  edges,
  onNodeClick,
  selectedNodes,
  onNodeSelect,
  onEdgeClick,
  selectionMode,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<Simulation<SimNode, SimLink>>();
  const simNodesRef = useRef<SimNode[]>([]);
  const simLinksRef = useRef<SimLink[]>([]);
  const [, forceRender] = useReducer((x: number) => x + 1, 0);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<number | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{ nodeId: string; didMove: boolean } | null>(null);
  const lastDragDidMoveRef = useRef(false);
  const panRef = useRef<{
    startX: number;
    startY: number;
    startTx: number;
    startTy: number;
  } | null>(null);

  // Responsive sizing
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Rebuild simulation when nodes/edges/dimensions change
  useEffect(() => {
    const { width, height } = dimensions;
    if (width === 0 || height === 0) return;

    // Preserve positions of existing nodes
    const posMap = new Map<string, { x: number; y: number; vx: number; vy: number }>();
    for (const n of simNodesRef.current) {
      if (n.x !== undefined && n.y !== undefined) {
        posMap.set(n.id, { x: n.x, y: n.y, vx: n.vx ?? 0, vy: n.vy ?? 0 });
      }
    }

    const simNodes: SimNode[] = nodes.map((n) => {
      const prev = posMap.get(n.id);
      return {
        ...n,
        x: prev?.x ?? width / 2 + (Math.random() - 0.5) * 120,
        y: prev?.y ?? height / 2 + (Math.random() - 0.5) * 120,
        vx: prev?.vx ?? 0,
        vy: prev?.vy ?? 0,
      };
    });

    const simLinks: SimLink[] = edges.map((e) => ({
      source: e.source,
      target: e.target,
    }));

    simNodesRef.current = simNodes;
    simLinksRef.current = simLinks;

    simulationRef.current?.stop();

    const sim = forceSimulation<SimNode>(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(200)
          .strength(0.4)
      )
      .force("charge", forceManyBody<SimNode>().strength(-600))
      .force("center", forceCenter(width / 2, height / 2).strength(0.08))
      .force("collision", forceCollide<SimNode>().radius(65))
      .alpha(posMap.size > 0 ? 0.4 : 1)
      .alphaDecay(0.02)
      .on("tick", forceRender);

    simulationRef.current = sim;

    return () => {
      sim.stop();
    };
  }, [nodes, edges, dimensions, forceRender]);

  // Zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.93 : 1.07;
    const svg = svgRef.current;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    setTransform((prev) => {
      const newScale = Math.max(0.15, Math.min(4, prev.scale * factor));
      const ratio = newScale / prev.scale;
      return {
        scale: newScale,
        x: mx - (mx - prev.x) * ratio,
        y: my - (my - prev.y) * ratio,
      };
    });
  }, []);

  // Node drag
  const handleNodePointerDown = useCallback(
    (e: ReactPointerEvent, nodeId: string) => {
      e.stopPropagation();
      e.preventDefault();
      (e.target as Element).setPointerCapture(e.pointerId);
      dragRef.current = { nodeId, didMove: false };

      const node = simNodesRef.current.find((n) => n.id === nodeId);
      if (node) {
        node.fx = node.x;
        node.fy = node.y;
      }
    },
    []
  );

  const handleNodePointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!dragRef.current) return;
      dragRef.current.didMove = true;

      const node = simNodesRef.current.find((n) => n.id === dragRef.current!.nodeId);
      if (!node) return;

      const dx = e.movementX / transform.scale;
      const dy = e.movementY / transform.scale;

      node.fx = (node.fx ?? node.x ?? 0) + dx;
      node.fy = (node.fy ?? node.y ?? 0) + dy;
      node.x = node.fx;
      node.y = node.fy;

      simulationRef.current?.alpha(0.15).restart();
      forceRender();
    },
    [transform.scale, forceRender]
  );

  const handleNodePointerUp = useCallback(() => {
    if (!dragRef.current) return;

    lastDragDidMoveRef.current = dragRef.current.didMove;

    const node = simNodesRef.current.find((n) => n.id === dragRef.current!.nodeId);
    if (node) {
      node.fx = null;
      node.fy = null;
    }

    dragRef.current = null;
    simulationRef.current?.alpha(0.15).restart();
  }, []);

  // Background pan
  const handleBgPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (dragRef.current) return;
      (e.target as Element).setPointerCapture(e.pointerId);
      panRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startTx: transform.x,
        startTy: transform.y,
      };
    },
    [transform.x, transform.y]
  );

  const handleBgPointerMove = useCallback((e: ReactPointerEvent) => {
    const pan = panRef.current;
    if (!pan) return;
    setTransform((prev) => ({
      ...prev,
      x: pan.startTx + (e.clientX - pan.startX),
      y: pan.startTy + (e.clientY - pan.startY),
    }));
  }, []);

  const handleBgPointerUp = useCallback(() => {
    panRef.current = null;
  }, []);

  // Hover highlighting
  const connectedSet = new Set<string>();
  if (hoveredNode) {
    connectedSet.add(hoveredNode);
    for (const link of simLinksRef.current) {
      const sId = getSourceId(link);
      const tId = getTargetId(link);
      if (sId === hoveredNode) connectedSet.add(tId);
      if (tId === hoveredNode) connectedSet.add(sId);
    }
  }

  const selectedSet = new Set(selectedNodes);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden rounded-2xl border border-white/10"
      style={{ background: "radial-gradient(ellipse at center, rgba(139,92,246,0.04) 0%, #0e0f14 70%)" }}
    >
      {nodes.length === 0 ? (
        <EmptyState />
      ) : (
        <svg
          ref={svgRef}
          width={dimensions.width}
          height={dimensions.height}
          className={selectionMode ? "cursor-crosshair select-none" : "cursor-grab active:cursor-grabbing select-none"}
          onWheel={handleWheel}
          onPointerDown={handleBgPointerDown}
          onPointerMove={handleBgPointerMove}
          onPointerUp={handleBgPointerUp}
        >
          <defs>
            <filter id="node-glow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="10" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <filter id="selected-glow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="14" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>

            <linearGradient id="ring-grad-green" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>

            <linearGradient id="ring-selected" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>

            <linearGradient id="friendship-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>

            {/* Per-edge gradients */}
            {simLinksRef.current.map((link, i) => {
              const s = getSimNode(link, "source");
              const t = getSimNode(link, "target");
              if (!s || !t) return null;
              const matchingEdge = edges.find(
                (e) =>
                  (e.source === getSourceId(link) && e.target === getTargetId(link)) ||
                  (e.source === getTargetId(link) && e.target === getSourceId(link))
              );
              const isFriendship = matchingEdge?.edgeType === "friendship";
              return (
                <linearGradient
                  key={`eg-${i}`}
                  id={`eg-${i}`}
                  gradientUnits="userSpaceOnUse"
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                >
                  {isFriendship ? (
                    <>
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.7" />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity="0.7" />
                    </>
                  ) : (
                    <>
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.6" />
                      <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.15" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0.6" />
                    </>
                  )}
                </linearGradient>
              );
            })}
          </defs>

          {/* Transform group */}
          <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
            {/* Edges */}
            {simLinksRef.current.map((link, i) => {
              const s = getSimNode(link, "source");
              const t = getSimNode(link, "target");
              if (!s?.x || !t?.x || !s?.y || !t?.y) return null;

              const edgeConnected =
                !hoveredNode || (connectedSet.has(getSourceId(link)) && connectedSet.has(getTargetId(link)));

              const matchingEdge = edges.find(
                (e) =>
                  (e.source === getSourceId(link) && e.target === getTargetId(link)) ||
                  (e.source === getTargetId(link) && e.target === getSourceId(link))
              );

              const isFriendship = matchingEdge?.edgeType === "friendship";
              const hasTx = matchingEdge && matchingEdge.txCount > 0;
              const hasContent = hasTx || isFriendship;
              const midX = (s.x + t.x) / 2;
              const midY = (s.y + t.y) / 2;
              const isEdgeHovered = hoveredEdge === i;

              return (
                <g key={`e-${i}`}>
                  {/* Invisible wider line for easier click target */}
                  <line
                    x1={s.x}
                    y1={s.y}
                    x2={t.x}
                    y2={t.y}
                    stroke="transparent"
                    strokeWidth={20}
                    style={{ cursor: isFriendship ? "pointer" : "default" }}
                    onMouseEnter={() => setHoveredEdge(i)}
                    onMouseLeave={() => setHoveredEdge(null)}
                    onClick={(e) => {
                      if (matchingEdge) {
                        e.stopPropagation();
                        onEdgeClick(getSourceId(link), getTargetId(link), matchingEdge.edgeType);
                      }
                    }}
                  />
                  <line
                    x1={s.x}
                    y1={s.y}
                    x2={t.x}
                    y2={t.y}
                    stroke={hasContent ? `url(#eg-${i})` : "#374151"}
                    strokeWidth={
                      isFriendship
                        ? isEdgeHovered ? 4 : 2.5
                        : hasTx
                          ? (hoveredNode && edgeConnected ? 3 : 2)
                          : 1
                    }
                    strokeDasharray={isFriendship ? undefined : hasTx ? undefined : "4 4"}
                    opacity={
                      hoveredNode
                        ? edgeConnected ? 0.9 : 0.06
                        : isEdgeHovered ? 1 : hasContent ? 0.5 : 0.15
                    }
                    style={{
                      transition: "opacity 0.3s, stroke-width 0.3s",
                      pointerEvents: "none",
                    }}
                  />

                  {/* Edge label */}
                  {hasContent && (
                    <g
                      transform={`translate(${midX},${midY})`}
                      opacity={hoveredNode ? (edgeConnected ? 1 : 0.06) : isEdgeHovered ? 1 : 0.85}
                      style={{ transition: "opacity 0.3s", cursor: isFriendship ? "pointer" : "default" }}
                      onClick={(e) => {
                        if (matchingEdge) {
                          e.stopPropagation();
                          onEdgeClick(getSourceId(link), getTargetId(link), matchingEdge.edgeType);
                        }
                      }}
                    >
                      <rect
                        x={isFriendship ? "-38" : "-42"}
                        y="-18"
                        width={isFriendship ? "76" : "84"}
                        height="36"
                        rx="10"
                        fill={isFriendship ? "#2d1f0e" : "#1e2028"}
                        stroke={isFriendship ? (isEdgeHovered ? "#f59e0b" : "#78350f") : "#374151"}
                        strokeWidth={isEdgeHovered ? "1.5" : "0.5"}
                        opacity="0.95"
                      />
                      {isFriendship ? (
                        <>
                          <text
                            textAnchor="middle"
                            y="-2"
                            fill="#fbbf24"
                            fontSize="9"
                            fontWeight="600"
                            style={{ pointerEvents: "none", userSelect: "none" }}
                          >
                            friend
                          </text>
                          <text
                            textAnchor="middle"
                            y="10"
                            fill="#92400e"
                            fontSize="7"
                            style={{ pointerEvents: "none", userSelect: "none" }}
                          >
                            {isEdgeHovered ? "click to remove" : "manual"}
                          </text>
                        </>
                      ) : (
                        <>
                          <text
                            textAnchor="middle"
                            y="-4"
                            fill="#d1d5db"
                            fontSize="9"
                            fontWeight="600"
                            style={{ pointerEvents: "none", userSelect: "none" }}
                          >
                            {matchingEdge!.txCount} tx
                          </text>
                          <text
                            textAnchor="middle"
                            y="10"
                            fill="#6b7280"
                            fontSize="7"
                            style={{ pointerEvents: "none", userSelect: "none" }}
                          >
                            {parseFloat(matchingEdge!.totalValueEth) > 0
                              ? `${parseFloat(matchingEdge!.totalValueEth).toFixed(2)} ETH`
                              : matchingEdge!.types.includes("erc20") ? "token transfers" : "contract calls"}
                          </text>
                        </>
                      )}
                    </g>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {simNodesRef.current.map((node, idx) => {
              if (node.x === undefined || node.y === undefined) return null;

              const isHighlighted = !hoveredNode || connectedSet.has(node.id);
              const isHovered = hoveredNode === node.id;
              const isSelected = selectedSet.has(node.id);
              const gradId = isSelected
                ? "ring-selected"
                : idx % 2 === 0
                  ? "ring-grad"
                  : "ring-grad-green";

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x},${node.y})`}
                  style={{
                    opacity: hoveredNode ? (isHighlighted ? 1 : 0.12) : 1,
                    transition: "opacity 0.3s",
                    cursor: selectionMode ? "crosshair" : "pointer",
                  }}
                  onPointerDown={(e) => handleNodePointerDown(e, node.id)}
                  onPointerMove={handleNodePointerMove}
                  onPointerUp={handleNodePointerUp}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onClick={() => {
                    if (lastDragDidMoveRef.current) {
                      lastDragDidMoveRef.current = false;
                      return;
                    }
                    if (selectionMode) {
                      onNodeSelect(node.ensName);
                    } else {
                      onNodeClick(node.ensName);
                    }
                  }}
                >
                  {/* Selection glow */}
                  {isSelected && (
                    <circle
                      r="40"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="3"
                      opacity={0.6}
                      filter="url(#selected-glow)"
                    />
                  )}

                  {/* Glow ring on hover */}
                  <circle
                    r="38"
                    fill="none"
                    stroke={isSelected ? "#f59e0b" : "#8b5cf6"}
                    strokeWidth="2.5"
                    opacity={isHovered ? 0.5 : 0}
                    filter="url(#node-glow)"
                    style={{ transition: "opacity 0.3s" }}
                  />

                  {/* Outer ring */}
                  <circle r="32" fill="#0e0f14" stroke={`url(#${gradId})`} strokeWidth={isSelected ? "3.5" : "2.5"} />

                  {/* Inner fill */}
                  <circle r="29" fill="#1e2028" />

                  {/* Avatar or initial */}
                  {node.avatar ? (
                    <image
                      href={node.avatar}
                      width="54"
                      height="54"
                      x="-27"
                      y="-27"
                      preserveAspectRatio="xMidYMid slice"
                      style={{ clipPath: "circle(27px at center)" }}
                    />
                  ) : (
                    <text
                      y="9"
                      textAnchor="middle"
                      fill="white"
                      fontSize="24"
                      fontWeight="bold"
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {node.ensName.charAt(0).toUpperCase()}
                    </text>
                  )}

                  {/* ENS name */}
                  <text
                    y="50"
                    textAnchor="middle"
                    fill="white"
                    fontSize="12"
                    fontWeight="600"
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {node.displayName}
                  </text>

                  {/* Address */}
                  {node.address && (
                    <text
                      y="64"
                      textAnchor="middle"
                      fill="#6b7280"
                      fontSize="9"
                      fontFamily="monospace"
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {shortenAddress(node.address)}
                    </text>
                  )}

                  {/* Balance badge */}
                  {node.ethBalance && parseFloat(node.ethBalance) > 0 && (
                    <g transform="translate(22, -22)">
                      <rect
                        x="-16"
                        y="-8"
                        width="32"
                        height="16"
                        rx="8"
                        fill="#1e2028"
                        stroke="#8b5cf6"
                        strokeWidth="1"
                        opacity="0.9"
                      />
                      <text
                        textAnchor="middle"
                        y="4"
                        fill="#a78bfa"
                        fontSize="7"
                        fontWeight="600"
                        style={{ pointerEvents: "none", userSelect: "none" }}
                      >
                        {parseFloat(node.ethBalance).toFixed(1)}
                      </text>
                    </g>
                  )}

                  {/* Selection order badge */}
                  {isSelected && (
                    <g transform="translate(-22, -22)">
                      <circle r="10" fill="#f59e0b" />
                      <text
                        textAnchor="middle"
                        y="4"
                        fill="#1e2028"
                        fontSize="10"
                        fontWeight="bold"
                        style={{ pointerEvents: "none", userSelect: "none" }}
                      >
                        {selectedNodes.indexOf(node.ensName) + 1}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="w-24 h-24 rounded-full bg-gradient-to-br from-accent-purple/10 to-accent-blue/10 border border-white/5 flex items-center justify-center mb-6">
        <svg
          className="w-12 h-12 text-accent-purple/40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        >
          <circle cx="12" cy="12" r="2.5" />
          <circle cx="4.5" cy="7" r="1.8" />
          <circle cx="19.5" cy="7" r="1.8" />
          <circle cx="4.5" cy="17" r="1.8" />
          <circle cx="19.5" cy="17" r="1.8" />
          <line x1="6.2" y1="7.8" x2="9.8" y2="10.8" opacity="0.4" />
          <line x1="17.8" y1="7.8" x2="14.2" y2="10.8" opacity="0.4" />
          <line x1="6.2" y1="16.2" x2="9.8" y2="13.2" opacity="0.4" />
          <line x1="17.8" y1="16.2" x2="14.2" y2="13.2" opacity="0.4" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">Build Your Network</h3>
      <p className="text-gray-500 text-sm max-w-xs leading-relaxed">
        Add ENS names or wallet addresses above to start mapping the social graph
      </p>
    </div>
  );
}
