import { describe, it, expect, vi } from "vitest";
import {
  filterHandlerFiles,
  findReferencedFiles,
  fetchReferencedFilesRecursive,
} from "../../src/lib/github/file-fetcher";
import { parseTsconfigPaths } from "../../src/lib/github/tsconfig-paths";
import type { FileTreeEntry } from "../../src/types";

function entry(path: string): FileTreeEntry {
  return { path, type: "blob", sha: "abc123" };
}

describe("filterHandlerFiles", () => {
  const entries: FileTreeEntry[] = [
    entry("src/handlers/user.handler.ts"),
    entry("src/controllers/auth.controller.ts"),
    entry("src/services/user.service.ts"),
    entry("src/routes/api/v1/users.ts"),
    entry("src/utils/helpers.ts"),
    entry("src/models/user.model.ts"),
    entry("src/handlers/nested/deep/order.handler.ts"),
    entry("README.md"),
  ];

  it("should match default handler patterns", () => {
    const result = filterHandlerFiles(entries);
    const paths = result.map((e) => e.path);

    expect(paths).toContain("src/handlers/user.handler.ts");
    expect(paths).toContain("src/controllers/auth.controller.ts");
    expect(paths).toContain("src/routes/api/v1/users.ts");
    expect(paths).toContain("src/handlers/nested/deep/order.handler.ts");
  });

  it("should not match non-handler files", () => {
    const result = filterHandlerFiles(entries);
    const paths = result.map((e) => e.path);

    expect(paths).not.toContain("src/services/user.service.ts");
    expect(paths).not.toContain("src/utils/helpers.ts");
    expect(paths).not.toContain("src/models/user.model.ts");
    expect(paths).not.toContain("README.md");
  });

  it("should match custom patterns", () => {
    const result = filterHandlerFiles(entries, ["**/*.service.ts"]);
    const paths = result.map((e) => e.path);

    expect(paths).toEqual(["src/services/user.service.ts"]);
  });

  it("should return empty for no matches", () => {
    const result = filterHandlerFiles(entries, ["**/*.go"]);
    expect(result).toHaveLength(0);
  });
});

describe("findReferencedFiles", () => {
  const allEntries: FileTreeEntry[] = [
    entry("src/handlers/user.handler.ts"),
    entry("src/services/user.service.ts"),
    entry("src/dao/user.dao.ts"),
    entry("src/utils/common.ts"),
    entry("src/models/user.ts"),
  ];

  it("should find imported service files", () => {
    const handlerFiles = new Map([
      [
        "src/handlers/user.handler.ts",
        `
import { UserService } from "../services/user.service";
import { UserModel } from "../models/user";

export class UserHandler {
  constructor(private userService: UserService) {}
}
        `,
      ],
    ]);

    const result = findReferencedFiles(handlerFiles, allEntries);

    expect(result).toContain("src/services/user.service.ts");
    expect(result).toContain("src/models/user.ts");
  });

  it("should not include already-included handler files", () => {
    const handlerFiles = new Map([
      [
        "src/handlers/user.handler.ts",
        `import { UserService } from "../services/user.service";`,
      ],
      ["src/services/user.service.ts", `export class UserService {}`],
    ]);

    const result = findReferencedFiles(handlerFiles, allEntries);

    expect(result).not.toContain("src/handlers/user.handler.ts");
    expect(result).not.toContain("src/services/user.service.ts");
  });

  it("should skip absolute imports (node_modules)", () => {
    const handlerFiles = new Map([
      [
        "src/handlers/user.handler.ts",
        `
import { Injectable } from "@nestjs/common";
import express from "express";
        `,
      ],
    ]);

    const result = findReferencedFiles(handlerFiles, allEntries);
    expect(result).toHaveLength(0);
  });

  it("should resolve index.ts imports", () => {
    const entries = [
      ...allEntries,
      entry("src/shared/index.ts"),
    ];

    const handlerFiles = new Map([
      [
        "src/handlers/user.handler.ts",
        `import { something } from "../shared";`,
      ],
    ]);

    const result = findReferencedFiles(handlerFiles, entries);
    expect(result).toContain("src/shared/index.ts");
  });
});

describe("fetchReferencedFilesRecursive", () => {
  const allEntries: FileTreeEntry[] = [
    entry("src/handlers/user.handler.ts"),
    entry("src/services/user.service.ts"),
    entry("src/dao/user.dao.ts"),
    entry("src/utils/common.ts"),
    entry("src/models/user.ts"),
  ];

  function createMockOctokit(fileContents: Record<string, string>) {
    return {
      repos: {
        getContent: vi.fn().mockImplementation(({ path }: { path: string }) => {
          const content = fileContents[path];
          if (!content) {
            throw new Error(`File not found: ${path}`);
          }
          return {
            data: {
              content: Buffer.from(content).toString("base64"),
              encoding: "base64",
            },
          };
        }),
      },
    } as unknown as import("@octokit/rest").Octokit;
  }

  it("should follow one level of imports", async () => {
    const seedFiles = new Map([
      [
        "src/handlers/user.handler.ts",
        `import { UserService } from "../services/user.service";`,
      ],
    ]);

    const octokit = createMockOctokit({
      "src/services/user.service.ts": `export class UserService {}`,
    });

    const result = await fetchReferencedFilesRecursive(
      octokit, "owner", "repo", "main",
      seedFiles, allEntries, 3
    );

    expect(result.has("src/handlers/user.handler.ts")).toBe(true);
    expect(result.has("src/services/user.service.ts")).toBe(true);
    expect(result.size).toBe(2);
  });

  it("should follow two levels of imports", async () => {
    const seedFiles = new Map([
      [
        "src/handlers/user.handler.ts",
        `import { UserService } from "../services/user.service";`,
      ],
    ]);

    const octokit = createMockOctokit({
      "src/services/user.service.ts": `
import { UserDao } from "../dao/user.dao";
export class UserService {}
      `,
      "src/dao/user.dao.ts": `export class UserDao {}`,
    });

    const result = await fetchReferencedFilesRecursive(
      octokit, "owner", "repo", "main",
      seedFiles, allEntries, 3
    );

    expect(result.has("src/handlers/user.handler.ts")).toBe(true);
    expect(result.has("src/services/user.service.ts")).toBe(true);
    expect(result.has("src/dao/user.dao.ts")).toBe(true);
    expect(result.size).toBe(3);
  });

  it("should respect maxDepth limit", async () => {
    const seedFiles = new Map([
      [
        "src/handlers/user.handler.ts",
        `import { UserService } from "../services/user.service";`,
      ],
    ]);

    const octokit = createMockOctokit({
      "src/services/user.service.ts": `
import { UserDao } from "../dao/user.dao";
export class UserService {}
      `,
      "src/dao/user.dao.ts": `export class UserDao {}`,
    });

    // maxDepth=1: only follows one level
    const result = await fetchReferencedFilesRecursive(
      octokit, "owner", "repo", "main",
      seedFiles, allEntries, 1
    );

    expect(result.has("src/handlers/user.handler.ts")).toBe(true);
    expect(result.has("src/services/user.service.ts")).toBe(true);
    expect(result.has("src/dao/user.dao.ts")).toBe(false);
    expect(result.size).toBe(2);
  });

  it("should prevent circular imports", async () => {
    const seedFiles = new Map([
      [
        "src/handlers/user.handler.ts",
        `import { UserService } from "../services/user.service";`,
      ],
    ]);

    const octokit = createMockOctokit({
      "src/services/user.service.ts": `
import { UserHandler } from "../handlers/user.handler";
export class UserService {}
      `,
    });

    const result = await fetchReferencedFilesRecursive(
      octokit, "owner", "repo", "main",
      seedFiles, allEntries, 3
    );

    // Should not re-fetch user.handler.ts (already in collected)
    expect(result.size).toBe(2);
    expect(octokit.repos.getContent).toHaveBeenCalledTimes(1); // only user.service.ts
  });

  it("should terminate early when no new imports found", async () => {
    const seedFiles = new Map([
      [
        "src/handlers/user.handler.ts",
        `import { UserService } from "../services/user.service";`,
      ],
    ]);

    const octokit = createMockOctokit({
      "src/services/user.service.ts": `
import express from "express";
export class UserService {}
      `,
    });

    const result = await fetchReferencedFilesRecursive(
      octokit, "owner", "repo", "main",
      seedFiles, allEntries, 3
    );

    // Only 1 fetch call (user.service.ts), then stops since no more relative imports
    expect(result.size).toBe(2);
    expect(octokit.repos.getContent).toHaveBeenCalledTimes(1);
  });
});

describe("findReferencedFiles with path aliases", () => {
  const pathMappings = parseTsconfigPaths(
    JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: { "@/*": ["./src/*"] },
      },
    })
  );

  const allEntries: FileTreeEntry[] = [
    entry("src/handlers/user.handler.ts"),
    entry("src/services/user.service.ts"),
    entry("src/dao/user.dao.ts"),
    entry("src/utils/common.ts"),
  ];

  it("should resolve path alias imports", () => {
    const handlerFiles = new Map([
      [
        "src/handlers/user.handler.ts",
        `import { UserService } from "@/services/user.service";`,
      ],
    ]);

    const result = findReferencedFiles(handlerFiles, allEntries, pathMappings);
    expect(result).toContain("src/services/user.service.ts");
  });

  it("should resolve mix of relative and alias imports", () => {
    const handlerFiles = new Map([
      [
        "src/handlers/user.handler.ts",
        `
import { UserService } from "@/services/user.service";
import { common } from "../utils/common";
        `,
      ],
    ]);

    const result = findReferencedFiles(handlerFiles, allEntries, pathMappings);
    expect(result).toContain("src/services/user.service.ts");
    expect(result).toContain("src/utils/common.ts");
  });

  it("should still skip node_modules imports when path mappings exist", () => {
    const handlerFiles = new Map([
      [
        "src/handlers/user.handler.ts",
        `
import { Injectable } from "@nestjs/common";
import express from "express";
        `,
      ],
    ]);

    const result = findReferencedFiles(handlerFiles, allEntries, pathMappings);
    expect(result).toHaveLength(0);
  });

  it("should skip alias imports not found in file tree", () => {
    const handlerFiles = new Map([
      [
        "src/handlers/user.handler.ts",
        `import { Foo } from "@/nonexistent/foo";`,
      ],
    ]);

    const result = findReferencedFiles(handlerFiles, allEntries, pathMappings);
    expect(result).toHaveLength(0);
  });
});

describe("fetchReferencedFilesRecursive with path aliases", () => {
  const pathMappings = parseTsconfigPaths(
    JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: { "@/*": ["./src/*"] },
      },
    })
  );

  const allEntries: FileTreeEntry[] = [
    entry("src/handlers/user.handler.ts"),
    entry("src/services/user.service.ts"),
    entry("src/dao/user.dao.ts"),
  ];

  function createMockOctokit(fileContents: Record<string, string>) {
    return {
      repos: {
        getContent: vi.fn().mockImplementation(({ path }: { path: string }) => {
          const content = fileContents[path];
          if (!content) {
            throw new Error(`File not found: ${path}`);
          }
          return {
            data: {
              content: Buffer.from(content).toString("base64"),
              encoding: "base64",
            },
          };
        }),
      },
    } as unknown as import("@octokit/rest").Octokit;
  }

  it("should follow alias imports recursively", async () => {
    const seedFiles = new Map([
      [
        "src/handlers/user.handler.ts",
        `import { UserService } from "@/services/user.service";`,
      ],
    ]);

    const octokit = createMockOctokit({
      "src/services/user.service.ts": `
import { UserDao } from "@/dao/user.dao";
export class UserService {}
      `,
      "src/dao/user.dao.ts": `export class UserDao {}`,
    });

    const result = await fetchReferencedFilesRecursive(
      octokit, "owner", "repo", "main",
      seedFiles, allEntries, 3, pathMappings
    );

    expect(result.has("src/handlers/user.handler.ts")).toBe(true);
    expect(result.has("src/services/user.service.ts")).toBe(true);
    expect(result.has("src/dao/user.dao.ts")).toBe(true);
    expect(result.size).toBe(3);
  });

  it("should follow mixed relative and alias imports", async () => {
    const seedFiles = new Map([
      [
        "src/handlers/user.handler.ts",
        `import { UserService } from "@/services/user.service";`,
      ],
    ]);

    const octokit = createMockOctokit({
      "src/services/user.service.ts": `
import { UserDao } from "../dao/user.dao";
export class UserService {}
      `,
      "src/dao/user.dao.ts": `export class UserDao {}`,
    });

    const result = await fetchReferencedFilesRecursive(
      octokit, "owner", "repo", "main",
      seedFiles, allEntries, 3, pathMappings
    );

    expect(result.has("src/services/user.service.ts")).toBe(true);
    expect(result.has("src/dao/user.dao.ts")).toBe(true);
    expect(result.size).toBe(3);
  });
});
