import { describe, it, expect } from "vitest";
import {
  parseTsconfigPaths,
  resolvePathAlias,
} from "../../src/lib/github/tsconfig-paths";

describe("parseTsconfigPaths", () => {
  it("should parse basic paths config", () => {
    const tsconfig = JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "@/*": ["./src/*"],
        },
      },
    });

    const mappings = parseTsconfigPaths(tsconfig);

    expect(mappings).toHaveLength(1);
    expect(mappings[0].prefix).toBe("@");
    expect(mappings[0].hasWildcard).toBe(true);
    expect(mappings[0].replacements).toEqual(["src"]);
  });

  it("should handle multiple path mappings", () => {
    const tsconfig = JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "@/*": ["./src/*"],
          "@services/*": ["./src/services/*"],
        },
      },
    });

    const mappings = parseTsconfigPaths(tsconfig);

    expect(mappings).toHaveLength(2);
    // More specific pattern should come first
    expect(mappings[0].prefix).toBe("@services");
    expect(mappings[1].prefix).toBe("@");
  });

  it("should handle baseUrl other than '.'", () => {
    const tsconfig = JSON.stringify({
      compilerOptions: {
        baseUrl: "./src",
        paths: {
          "@/*": ["./*"],
        },
      },
    });

    const mappings = parseTsconfigPaths(tsconfig);

    expect(mappings).toHaveLength(1);
    expect(mappings[0].replacements).toEqual(["src"]);
  });

  it("should strip JSON comments", () => {
    const tsconfig = `{
      // This is a comment
      "compilerOptions": {
        "baseUrl": ".",
        /* Multi-line
           comment */
        "paths": {
          "@/*": ["./src/*"]
        }
      }
    }`;

    const mappings = parseTsconfigPaths(tsconfig);

    expect(mappings).toHaveLength(1);
    expect(mappings[0].prefix).toBe("@");
  });

  it("should return empty array for invalid JSON", () => {
    const mappings = parseTsconfigPaths("not valid json");
    expect(mappings).toEqual([]);
  });

  it("should return empty array when no paths defined", () => {
    const tsconfig = JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
      },
    });

    const mappings = parseTsconfigPaths(tsconfig);
    expect(mappings).toEqual([]);
  });

  it("should handle exact match patterns (no wildcard)", () => {
    const tsconfig = JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "@config": ["./src/config/index.ts"],
        },
      },
    });

    const mappings = parseTsconfigPaths(tsconfig);

    expect(mappings).toHaveLength(1);
    expect(mappings[0].prefix).toBe("@config");
    expect(mappings[0].hasWildcard).toBe(false);
    expect(mappings[0].replacements).toEqual(["src/config/index.ts"]);
  });

  it("should default baseUrl to '.' when not specified", () => {
    const tsconfig = JSON.stringify({
      compilerOptions: {
        paths: {
          "@/*": ["./src/*"],
        },
      },
    });

    const mappings = parseTsconfigPaths(tsconfig);

    expect(mappings).toHaveLength(1);
    expect(mappings[0].replacements).toEqual(["src"]);
  });
});

describe("resolvePathAlias", () => {
  it("should resolve wildcard alias", () => {
    const mappings = parseTsconfigPaths(
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: { "@/*": ["./src/*"] },
        },
      })
    );

    const result = resolvePathAlias("@/services/user.service", mappings);
    expect(result).toBe("src/services/user.service");
  });

  it("should resolve nested wildcard alias", () => {
    const mappings = parseTsconfigPaths(
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: { "@services/*": ["./src/services/*"] },
        },
      })
    );

    const result = resolvePathAlias("@services/user.service", mappings);
    expect(result).toBe("src/services/user.service");
  });

  it("should prefer more specific mapping", () => {
    const mappings = parseTsconfigPaths(
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@/*": ["./src/*"],
            "@services/*": ["./src/services/*"],
          },
        },
      })
    );

    const result = resolvePathAlias("@services/user.service", mappings);
    // Should match @services/* (more specific) not @/*
    expect(result).toBe("src/services/user.service");
  });

  it("should resolve exact match alias", () => {
    const mappings = parseTsconfigPaths(
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: { "@config": ["./src/config/index.ts"] },
        },
      })
    );

    const result = resolvePathAlias("@config", mappings);
    expect(result).toBe("src/config/index.ts");
  });

  it("should return null for unmatched import", () => {
    const mappings = parseTsconfigPaths(
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: { "@/*": ["./src/*"] },
        },
      })
    );

    expect(resolvePathAlias("express", mappings)).toBeNull();
    expect(resolvePathAlias("@nestjs/common", mappings)).toBeNull();
  });

  it("should return null for empty mappings", () => {
    const result = resolvePathAlias("@/services/user", []);
    expect(result).toBeNull();
  });
});
