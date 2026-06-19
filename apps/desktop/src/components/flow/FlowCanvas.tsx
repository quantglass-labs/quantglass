// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { clsx } from 'clsx';
import { Lock } from 'lucide-react';
import type { ComponentType } from 'react';
import { useMemo } from 'react';
import {
  Background,
  BackgroundVariant,
  type Edge,
  type EdgeProps,
  getBezierPath,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';
import './flow.css';

/**
 * Plain string union for handle sides, so modules that only *build* diagrams can
 * stay free of any runtime `@xyflow/react` import (keeps the library lazy).
 */
export type FlowSide = 'left' | 'right' | 'top' | 'bottom';

const SIDE_TO_POSITION: Record<FlowSide, Position> = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
};

/** Data carried by every QuantGlass flow node. */
export type QgNodeData = {
  label: string;
  /** Optional secondary line (e.g. progress "3/12"). */
  sublabel?: string;
  /** Optional leading icon (a lucide-react icon component). */
  icon?: ComponentType<{ className?: string }>;
  /** Renders a lock glyph and dims the node. */
  locked?: boolean;
  /** Side the incoming edge attaches to. Defaults to 'left'. */
  targetPos?: FlowSide;
  /** Side the outgoing edge leaves from. Defaults to 'right'. */
  sourcePos?: FlowSide;
  /** When set, the node is clickable and selecting it navigates here. */
  route?: string;
  /** Visual emphasis. */
  tone?: 'default' | 'accent';
};

export type QgNode = Node<QgNodeData>;

function FlowNode({ data }: NodeProps<QgNode>) {
  const clickable = Boolean(data.route);
  const accent = data.tone === 'accent';
  const Icon = data.icon;
  return (
    <div
      className={clsx(
        'qg-node relative min-w-[124px] rounded-2xl border px-4 py-2.5 text-center backdrop-blur-sm',
        accent
          ? 'qg-node-accent border-accent/70 bg-gradient-to-br from-accentStrong/35 via-panelStrong to-surface'
          : 'border-white/10 bg-gradient-to-br from-panelStrong to-surface/80 shadow-[0_10px_30px_rgba(8,17,31,0.5)]',
        clickable && 'cursor-pointer hover:border-accent',
        data.locked && 'opacity-60',
      )}
    >
      <Handle
        type="target"
        position={SIDE_TO_POSITION[data.targetPos ?? 'left']}
        className="!size-1.5 !border-0 !bg-accent/60"
      />
      <div className="flex items-center justify-center gap-2">
        {data.locked ? (
          <Lock className="size-3.5 text-muted" aria-hidden />
        ) : Icon ? (
          <span
            className={clsx(
              'grid size-6 shrink-0 place-items-center rounded-lg',
              accent ? 'bg-accent/25 text-accent' : 'bg-accent/12 text-accent',
            )}
          >
            <Icon className="size-3.5" />
          </span>
        ) : null}
        <span className="text-sm font-semibold text-ink">{data.label}</span>
      </div>
      {data.sublabel ? (
        <div className="mt-1 text-[11px] font-medium tracking-wide text-muted">{data.sublabel}</div>
      ) : null}
      <Handle
        type="source"
        position={SIDE_TO_POSITION[data.sourcePos ?? 'right']}
        className="!size-1.5 !border-0 !bg-accent/60"
      />
    </div>
  );
}

/** Edge with a glow underlay, a gradient base line, and a flowing highlight. */
function GlowEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
}: EdgeProps) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  return (
    <>
      <path d={path} fill="none" stroke="url(#qg-edge-grad)" strokeWidth={7} strokeOpacity={0.16} />
      <path
        d={path}
        fill="none"
        stroke="url(#qg-edge-grad)"
        strokeWidth={2}
        strokeOpacity={0.55}
        markerEnd={markerEnd}
      />
      <path d={path} fill="none" stroke="#dbe6ff" strokeWidth={1.5} className="qg-edge-flow" />
    </>
  );
}

const nodeTypes = { qg: FlowNode };
const edgeTypes = { qgGlow: GlowEdge };

/** SVG <defs> for the edge gradient + arrow marker, referenced by id. */
function FlowDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <defs>
        <linearGradient id="qg-edge-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#3a74f0" />
          <stop offset="100%" stopColor="#8db7ff" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export type FlowCanvasProps = {
  nodes: QgNode[];
  edges: Edge[];
  /** Called with a node's `route` when a clickable node is selected. */
  onNodeSelect?: (route: string) => void;
  /** Disable edge animation (honours prefers-reduced-motion). */
  reducedMotion?: boolean;
  /** Accessible label for the diagram region. */
  ariaLabel: string;
  heightClass?: string;
};

/**
 * Themed, non-interactive-by-default React Flow canvas with glowing gradient
 * edges and depth-styled nodes. Nodes are read-only (no drag/connect) and only
 * "clickable" when they carry a `route`. Rendered inside an LTR wrapper so the
 * spatial layout stays stable under right-to-left languages while labels remain
 * translated.
 */
export default function FlowCanvas({
  nodes,
  edges,
  onNodeSelect,
  reducedMotion = false,
  ariaLabel,
  heightClass = 'h-[360px]',
}: FlowCanvasProps) {
  const renderedEdges = useMemo<Edge[]>(
    () =>
      edges.map((edge) => ({
        ...edge,
        type: edge.type ?? 'qgGlow',
        markerEnd: edge.markerEnd ?? { type: MarkerType.ArrowClosed, color: '#8db7ff' },
      })),
    [edges],
  );

  return (
    <div
      dir="ltr"
      className={clsx(
        heightClass,
        'relative w-full overflow-hidden rounded-2xl border border-white/5 bg-background/40',
        reducedMotion && 'qg-reduced',
      )}
      role="img"
      aria-label={ariaLabel}
    >
      <FlowDefs />
      <ReactFlow
        nodes={nodes}
        edges={renderedEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        elementsSelectable={Boolean(onNodeSelect)}
        panOnDrag={false}
        panOnScroll={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        onNodeClick={(_event, node) => {
          const route = (node.data as QgNodeData).route;
          if (route && onNodeSelect) onNodeSelect(route);
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1}
          color="rgba(141,183,255,0.10)"
        />
      </ReactFlow>
    </div>
  );
}
