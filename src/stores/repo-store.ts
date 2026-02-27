import { create } from "zustand";
import type { HandlerEntry } from "@/types";
import type { GitHubRepo, RepoScanProgress, FlowProgress } from "@/types";

interface RepoState {
  // Paste mode fields (unchanged)
  handlerCode: string;
  serviceCode: string;
  handlers: HandlerEntry[];
  selectedHandlerId: string | null;
  isLoading: boolean;
  error: string | null;
  hasAnalyzed: boolean;

  // GitHub mode fields
  mode: "paste" | "github";
  selectedRepo: GitHubRepo | null;
  branch: string;
  globPatterns: string[];
  scanProgress: RepoScanProgress | null;
  fileCount: number;
  isFlowLoading: boolean;
  flowProgress: FlowProgress | null;

  // Paste mode actions
  setHandlerCode: (code: string) => void;
  setServiceCode: (code: string) => void;
  setHandlers: (handlers: HandlerEntry[]) => void;
  setSelectedHandlerId: (id: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setHasAnalyzed: (value: boolean) => void;
  reset: () => void;

  // GitHub mode actions
  setMode: (mode: "paste" | "github") => void;
  setSelectedRepo: (repo: GitHubRepo | null) => void;
  setBranch: (branch: string) => void;
  setGlobPatterns: (patterns: string[]) => void;
  setScanProgress: (progress: RepoScanProgress | null) => void;
  setFileCount: (count: number) => void;
  setIsFlowLoading: (loading: boolean) => void;
  setFlowProgress: (progress: FlowProgress | null) => void;
}

export const useRepoStore = create<RepoState>((set) => ({
  handlerCode: "",
  serviceCode: "",
  handlers: [],
  selectedHandlerId: null,
  isLoading: false,
  error: null,
  hasAnalyzed: false,

  mode: "paste",
  selectedRepo: null,
  branch: "main",
  globPatterns: [
    "**/*.handler.ts",
    "**/*.controller.ts",
    "**/*-handler.ts",
    "**/*-crud-handler.ts",
    "**/handlers/**/*.ts",
    "**/controllers/**/*.ts",
    "**/routes/**/*.ts",
  ],
  scanProgress: null,
  fileCount: 0,
  isFlowLoading: false,
  flowProgress: null,

  setHandlerCode: (code) => set({ handlerCode: code }),
  setServiceCode: (code) => set({ serviceCode: code }),
  setHandlers: (handlers) => set({ handlers }),
  setSelectedHandlerId: (id) => set({ selectedHandlerId: id }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  setHasAnalyzed: (value) => set({ hasAnalyzed: value }),
  reset: () =>
    set({
      handlerCode: "",
      serviceCode: "",
      handlers: [],
      selectedHandlerId: null,
      isLoading: false,
      error: null,
      hasAnalyzed: false,
    }),

  setMode: (mode) => set({ mode }),
  setSelectedRepo: (repo) => set({ selectedRepo: repo }),
  setBranch: (branch) => set({ branch }),
  setGlobPatterns: (patterns) => set({ globPatterns: patterns }),
  setScanProgress: (progress) => set({ scanProgress: progress }),
  setFileCount: (count) => set({ fileCount: count }),
  setIsFlowLoading: (loading) => set({ isFlowLoading: loading }),
  setFlowProgress: (progress) => set({ flowProgress: progress }),
}));
