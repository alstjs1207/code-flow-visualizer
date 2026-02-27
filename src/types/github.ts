export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string; // "owner/repo"
  owner: string;
  description: string | null;
  private: boolean;
  default_branch: string;
  language: string | null;
  updated_at: string;
  html_url: string;
  stargazers_count: number;
}

export interface FileTreeEntry {
  path: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
}

export interface RepoScanProgress {
  stage: "tree" | "files" | "parsing" | "done" | "error";
  message: string;
  current?: number;
  total?: number;
}

export interface FlowProgress {
  stage: "fetching" | "building" | "done" | "error";
  message: string;
}
