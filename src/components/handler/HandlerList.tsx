"use client";

import type { HandlerEntry } from "@/types";
import { HandlerCard } from "./HandlerCard";

interface HandlerListProps {
  handlers: HandlerEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  hasAnalyzed: boolean;
  disabled?: boolean;
}

export function HandlerList({ handlers, selectedId, onSelect, hasAnalyzed, disabled }: HandlerListProps) {
  if (handlers.length === 0) {
    if (hasAnalyzed) {
      return (
        <div className="rounded-lg border border-amber-800 bg-amber-950 px-3 py-3 text-xs text-amber-400">
          <p className="font-medium">분석 가능한 핸들러 함수를 찾지 못했습니다.</p>
          <p className="mt-1 text-amber-500">
            다음 형태의 코드를 포함해 주세요:
          </p>
          <code className="mt-1 block text-[11px] text-amber-600">
            router.get(&quot;/path&quot;, handler)
          </code>
          <code className="mt-1 block text-[11px] text-amber-600">
            export async function handler(req, res)
          </code>
          <code className="mt-1 block text-[11px] text-amber-600">
            this.server.get(&quot;/path&quot;, opts, handler)
          </code>
        </div>
      );
    }
    return (
      <div className="px-3 py-4 text-center text-xs text-gray-600">
        No handlers detected. Paste handler code above and click Analyze.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {handlers.map((handler) => (
        <HandlerCard
          key={handler.id}
          handler={handler}
          isSelected={handler.id === selectedId}
          onClick={() => !disabled && onSelect(handler.id)}
        />
      ))}
    </div>
  );
}
