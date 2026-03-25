"use client";

import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { MermaidCanvas } from "@/components/flow/MermaidCanvas";
import { FlowStats } from "@/components/flow/FlowStats";

export default function Home() {
  return (
    <div className="flex h-screen flex-col">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex flex-1 flex-col">
          <div className="flex-1">
            <MermaidCanvas />
          </div>
          <FlowStats />
        </main>
      </div>
    </div>
  );
}
