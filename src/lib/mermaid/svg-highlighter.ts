/**
 * Applies opacity-based highlighting to Mermaid-generated SVG.
 * Mermaid renders nodes as `g.node` elements and edges as paths inside `g.edgePaths`.
 * The order matches the definition order in the Mermaid syntax.
 */

export function highlightSvg(
  svgContainer: HTMLElement,
  highlightedNodeIds: Set<string>,
  highlightedEdgeIndices: Set<number>,
  nodeIds: string[]
) {
  const isHighlighting =
    highlightedNodeIds.size > 0 || highlightedEdgeIndices.size > 0;

  // Highlight nodes
  const nodeElements = svgContainer.querySelectorAll("g.node");
  nodeElements.forEach((el) => {
    const htmlEl = el as HTMLElement;
    // Mermaid sets id like "flowchart-nodeId-N" on the node group
    const nodeId = extractNodeId(htmlEl, nodeIds);
    if (!isHighlighting) {
      htmlEl.style.opacity = "1";
      htmlEl.style.transition = "opacity 0.3s ease";
      return;
    }
    const highlighted = nodeId ? highlightedNodeIds.has(nodeId) : false;
    htmlEl.style.opacity = highlighted ? "1" : "0.15";
    htmlEl.style.transition = "opacity 0.3s ease";
  });

  // Highlight edges — they render in definition order
  const edgePaths = svgContainer.querySelectorAll("g.edgePaths path");
  edgePaths.forEach((el, index) => {
    const htmlEl = el as HTMLElement;
    if (!isHighlighting) {
      htmlEl.style.opacity = "1";
      htmlEl.style.transition = "opacity 0.3s ease";
      return;
    }
    const highlighted = highlightedEdgeIndices.has(index);
    htmlEl.style.opacity = highlighted ? "1" : "0.15";
    htmlEl.style.transition = "opacity 0.3s ease";
  });

  // Also handle edge labels
  const edgeLabels = svgContainer.querySelectorAll("g.edgeLabels g.edgeLabel");
  edgeLabels.forEach((el, index) => {
    const htmlEl = el as HTMLElement;
    if (!isHighlighting) {
      htmlEl.style.opacity = "1";
      htmlEl.style.transition = "opacity 0.3s ease";
      return;
    }
    const highlighted = highlightedEdgeIndices.has(index);
    htmlEl.style.opacity = highlighted ? "1" : "0.15";
    htmlEl.style.transition = "opacity 0.3s ease";
  });
}

function extractNodeId(el: HTMLElement, nodeIds: string[]): string | null {
  // Mermaid sets the id attribute on the node group element
  // Format: "flowchart-{nodeId}-{index}"
  const id = el.id || "";
  for (const nodeId of nodeIds) {
    if (id.includes(`-${nodeId}-`) || id.endsWith(`-${nodeId}`)) {
      return nodeId;
    }
  }
  // Fallback: check data-id attribute
  const dataId = el.getAttribute("data-id");
  if (dataId && nodeIds.includes(dataId)) return dataId;
  return null;
}
