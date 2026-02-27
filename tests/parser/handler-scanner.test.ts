import { describe, it, expect } from "vitest";
import { scanHandlers } from "@/lib/parser/handler-scanner";
import { inferHttpMethod } from "@/lib/parser/patterns/standalone";
import { readFileSync } from "fs";
import { join } from "path";

const fixturesDir = join(__dirname, "fixtures");

function readFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf-8");
}

describe("handler-scanner", () => {
  it("detects router.post pattern", () => {
    const code = readFixture("simple-handler.ts");
    const handlers = scanHandlers("simple-handler.ts", code);

    expect(handlers).toHaveLength(1);
    expect(handlers[0].method).toBe("POST");
    expect(handlers[0].path).toBe("/api/enrollments");
    expect(handlers[0].functionName).toBe("createEnrollment");
  });

  it("detects multiple routes (GET, POST, PATCH, DELETE)", () => {
    const code = readFixture("express-routes.ts");
    const handlers = scanHandlers("express-routes.ts", code);

    expect(handlers).toHaveLength(4);

    const methods = handlers.map((h) => h.method);
    expect(methods).toContain("GET");
    expect(methods).toContain("PATCH");
    expect(methods).toContain("DELETE");

    const paths = handlers.map((h) => h.path);
    expect(paths).toContain("/api/tickets");
    expect(paths).toContain("/api/tickets/:id");
  });

  it("extracts serviceRefs", () => {
    const code = readFixture("multi-service.ts");
    const handlers = scanHandlers("multi-service.ts", code);

    expect(handlers).toHaveLength(1);
    expect(handlers[0].serviceRefs).toContain("enrollmentService.create");
    expect(handlers[0].serviceRefs).toContain(
      "notificationService.sendEnrollmentConfirmation"
    );
  });

  it("computes complexity (branch count)", () => {
    const code = readFixture("simple-handler.ts");
    const handlers = scanHandlers("simple-handler.ts", code);

    expect(handlers[0].complexity).toBeGreaterThanOrEqual(1);
  });

  it("assigns unique ids to each handler", () => {
    const code = readFixture("express-routes.ts");
    const handlers = scanHandlers("express-routes.ts", code);

    const ids = handlers.map((h) => h.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("detects standalone exported handler function (req, res)", () => {
    const code = readFixture("standalone-handler.ts");
    const handlers = scanHandlers("standalone-handler.ts", code);

    expect(handlers).toHaveLength(1);
    expect(handlers[0].functionName).toBe("createEnrollment");
    expect(handlers[0].method).toBe("POST");
    expect(handlers[0].path).toBe("/");
    expect(handlers[0].serviceRefs).toContain("enrollmentService.create");
    expect(handlers[0].complexity).toBeGreaterThanOrEqual(1);
  });

  it("infers HTTP method from function name", () => {
    expect(inferHttpMethod("createEnrollment")).toBe("POST");
    expect(inferHttpMethod("addUser")).toBe("POST");
    expect(inferHttpMethod("insertRecord")).toBe("POST");
    expect(inferHttpMethod("registerUser")).toBe("POST");

    expect(inferHttpMethod("getTickets")).toBe("GET");
    expect(inferHttpMethod("findById")).toBe("GET");
    expect(inferHttpMethod("listUsers")).toBe("GET");
    expect(inferHttpMethod("fetchData")).toBe("GET");
    expect(inferHttpMethod("loadConfig")).toBe("GET");
    expect(inferHttpMethod("readFile")).toBe("GET");
    expect(inferHttpMethod("searchUsers")).toBe("GET");

    expect(inferHttpMethod("updateTicket")).toBe("PATCH");
    expect(inferHttpMethod("editProfile")).toBe("PATCH");
    expect(inferHttpMethod("modifySettings")).toBe("PATCH");
    expect(inferHttpMethod("patchRecord")).toBe("PATCH");

    expect(inferHttpMethod("putItem")).toBe("PUT");
    expect(inferHttpMethod("replaceConfig")).toBe("PUT");
    expect(inferHttpMethod("setPreference")).toBe("PUT");
    expect(inferHttpMethod("upsertUser")).toBe("PUT");

    expect(inferHttpMethod("deleteTicket")).toBe("DELETE");
    expect(inferHttpMethod("removeUser")).toBe("DELETE");
    expect(inferHttpMethod("destroySession")).toBe("DELETE");

    // unknown prefix defaults to POST
    expect(inferHttpMethod("handleWebhook")).toBe("POST");
  });

  it("detects Fastify this.server route registrations", () => {
    const code = readFixture("fastify-class-handler.ts");
    const handlers = scanHandlers("fastify-class-handler.ts", code);

    expect(handlers).toHaveLength(4);

    const methods = handlers.map((h) => h.method);
    expect(methods).toContain("GET");
    expect(methods).toContain("POST");
    expect(methods).toContain("PUT");
    expect(methods).toContain("DELETE");
  });

  it("extracts path from Fastify template literal", () => {
    const code = readFixture("fastify-class-handler.ts");
    const handlers = scanHandlers("fastify-class-handler.ts", code);

    const getPaths = handlers.filter((h) => h.method === "GET").map((h) => h.path);
    expect(getPaths[0]).toContain("routePath");

    const putPaths = handlers.filter((h) => h.method === "PUT").map((h) => h.path);
    expect(putPaths[0]).toContain(":id");
  });

  it("extracts service refs from Fastify inline handler", () => {
    const code = readFixture("fastify-class-handler.ts");
    const handlers = scanHandlers("fastify-class-handler.ts", code);

    const getHandler = handlers.find((h) => h.method === "GET");
    expect(getHandler?.serviceRefs).toContain("service.findAll");

    const postHandler = handlers.find((h) => h.method === "POST");
    expect(postHandler?.serviceRefs).toContain("service.save");
  });

  it("resolves Fastify route path from class constructor", () => {
    const code = readFixture("fastify-class-full.ts");
    const handlers = scanHandlers("fastify-class-full.ts", code);

    expect(handlers).toHaveLength(3);

    const getHandler = handlers.find((h) => h.method === "GET");
    expect(getHandler?.path).toBe("/account");

    const postHandler = handlers.find((h) => h.method === "POST");
    expect(postHandler?.path).toBe("/account");
  });

  it("resolves Fastify path with suffix", () => {
    const code = readFixture("fastify-class-full.ts");
    const handlers = scanHandlers("fastify-class-full.ts", code);

    const putHandler = handlers.find((h) => h.method === "PUT");
    expect(putHandler?.path).toBe("/account/:id");
  });

  it("builds serviceTypeMap from class property types", () => {
    const code = readFixture("fastify-class-full.ts");
    const handlers = scanHandlers("fastify-class-full.ts", code);

    const getHandler = handlers.find((h) => h.method === "GET");
    expect(getHandler?.serviceTypeMap?.service).toBe("accountService");
    expect(getHandler?.serviceTypeMap?.mapper).toBe("accountMapper");
  });

  it("keeps raw serviceRefs when no class context", () => {
    const code = readFixture("fastify-class-handler.ts");
    const handlers = scanHandlers("fastify-class-handler.ts", code);

    // No class wrapping → no serviceTypeMap
    const getHandler = handlers.find((h) => h.method === "GET");
    expect(getHandler?.serviceTypeMap).toBeUndefined();
    expect(getHandler?.serviceRefs).toContain("service.findAll");
  });

  it("prefers Express routes over standalone when both exist", () => {
    const code = readFixture("simple-handler.ts");
    const handlers = scanHandlers("simple-handler.ts", code);

    // simple-handler.ts has both an exported function AND a router.post()
    // Express routes should be preferred
    expect(handlers).toHaveLength(1);
    expect(handlers[0].path).toBe("/api/enrollments");
    expect(handlers[0].method).toBe("POST");
  });

  it("resolves routePath set in bindRoute() method (not constructor)", () => {
    const code = readFixture("skillflo-handler.ts");
    const handlers = scanHandlers("skillflo-handler.ts", code);

    expect(handlers.length).toBeGreaterThanOrEqual(2);

    const getHandler = handlers.find((h) => h.method === "GET");
    expect(getHandler).toBeDefined();
    expect(getHandler!.path).toBe("/member/:id");

    const postHandler = handlers.find((h) => h.method === "POST");
    expect(postHandler).toBeDefined();
    expect(postHandler!.path).toBe("/member");
  });

  it("detects CRUD handlers from bindRoute() pattern", () => {
    const code = readFixture("skillflo-crud-handler.ts");
    const handlers = scanHandlers("skillflo-crud-handler.ts", code);

    const findHandler = handlers.find((h) => h.method === "GET" && h.path === "/member");
    expect(findHandler).toBeDefined();
    expect(findHandler!.functionName).toBe("find_get");

    const getHandler = handlers.find((h) => h.method === "GET" && h.path === "/member/:id");
    expect(getHandler).toBeDefined();
    expect(getHandler!.functionName).toBe("get_get");

    const createHandler = handlers.find((h) => h.method === "POST" && h.path === "/member");
    expect(createHandler).toBeDefined();
    expect(createHandler!.functionName).toBe("create_post");
  });

  it("detects both CRUD and custom handlers in same class", () => {
    const code = readFixture("skillflo-crud-handler.ts");
    const handlers = scanHandlers("skillflo-crud-handler.ts", code);

    // 3 CRUD (find, get, create) + 1 custom (signUp via this.server.post)
    expect(handlers).toHaveLength(4);

    const methods = handlers.map((h) => `${h.method} ${h.path}`);
    expect(methods).toContain("GET /member");
    expect(methods).toContain("GET /member/:id");
    expect(methods).toContain("POST /member");
    expect(methods).toContain("POST /member/sign-up");
  });

  it("extractClassContext resolves types from extends clause type arguments", () => {
    const code = readFixture("fastify-inherited-handler.ts");
    const handlers = scanHandlers("fastify-inherited-handler.ts", code);

    const postHandler = handlers.find((h) => h.method === "POST");
    expect(postHandler).toBeDefined();
    expect(postHandler!.serviceTypeMap?.service).toBe("accountDeviceService");
    expect(postHandler!.serviceTypeMap?.mapper).toBe("accountDeviceMapper");
  });

  it("extractClassContext prefers explicit properties over extends type args", () => {
    const code = readFixture("fastify-class-full.ts");
    const handlers = scanHandlers("fastify-class-full.ts", code);

    // fastify-class-full.ts has explicit property declarations: service: AccountService
    // Those should take priority over any extends clause
    const getHandler = handlers.find((h) => h.method === "GET");
    expect(getHandler!.serviceTypeMap?.service).toBe("accountService");
    expect(getHandler!.serviceTypeMap?.mapper).toBe("accountMapper");
  });

  it("does not create duplicate entries for custom handlers", () => {
    const code = readFixture("skillflo-crud-handler.ts");
    const handlers = scanHandlers("skillflo-crud-handler.ts", code);

    // signUp uses this.server.post → detected by fastify pattern
    // signUp is NOT in CRUD_METHOD_MAP → not detected by skillflo pattern
    // So no duplicates expected
    const signUpHandlers = handlers.filter(
      (h) => h.path.includes("sign-up")
    );
    expect(signUpHandlers).toHaveLength(1);
  });
});
