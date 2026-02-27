"use client";

const LAYERS = [
  { name: "Handler", color: "#22d3ee" },
  { name: "Service", color: "#a78bfa" },
  { name: "DAO", color: "#fbbf24" },
];

export function LayerLegend() {
  return (
    <div className="flex items-center gap-4">
      {LAYERS.map((layer) => (
        <span key={layer.name} className="flex items-center gap-1.5 text-xs text-gray-400">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: layer.color }}
          />
          {layer.name}
        </span>
      ))}
    </div>
  );
}
