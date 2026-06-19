// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Lock } from 'lucide-react';
import { useMemo } from 'react';
import {
  Background,
  BackgroundVariant,
  Handle,
  type Edge,
  MarkerType,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';

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
  return (
    <div
      className={[
        'rounded-xl border px-4 py-2 text-center shadow-glow transition-colors',
        accent ? 'border-accent/60 bg-panelStrong text-ink' : 'border-border bg-panel text-ink',
        clickable ? 'cursor-pointer hover:border-accent hover:bg-panelStrong' : 'cursor-default',
        data.locked ? 'opacity-60' : '',
      ].join(' ')}
    >
      <Handle
        type="target"
        position={SIDE_TO_POSITION[data.targetPos ?? 'left']}
        className="!h-1.5 !w-1.5 !border-0 !bg-accent/70"
      />
      <div className="flex items-center justify-center gap-1.5 text-sm font-medium">
        {data.locked ? <Lock className="size-3.5 text-muted" aria-hidden /> : null}
        {data.label}
      </div>
      {data.sublabel ? <div className="mt-0.5 text-xs text-muted">{data.sublabel}</div> : null}
      <Handle
        type="source"
        position={SIDE_TO_POSITION[data.sourcePos ?? 'right']}
        className="!h-1.5 !w-1.5 !border-0 !bg-accent/70"
      />
    </div>
  );
}

const nodeTypes = { qg: FlowNode };

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
 * Themed, non-interactive-by-default React Flow canvas. Edges animate unless
 * reduced motion is requested; nodes are read-only (no drag/connect) and only
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
        animated: reducedMotion ? false : (edge.animated ?? true),
        markerEnd: edge.markerEnd ?? { type: MarkerType.ArrowClosed, color: '#8db7ff' },
        style: { stroke: '#8db7ff', strokeWidth: 1.5, ...edge.style },
      })),
    [edges, reducedMotion],
  );

  return (
    <div
      dir="ltr"
      className={`${heightClass} w-full overflow-hidden rounded-2xl`}
      role="img"
      aria-label={ariaLabel}
    >
      <ReactFlow
        nodes={nodes}
        edges={renderedEdges}
        nodeTypes={nodeTypes}
        fitView
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
          gap={20}
          size={1}
          color="rgba(255,255,255,0.06)"
        />
      </ReactFlow>
    </div>
  );
}
