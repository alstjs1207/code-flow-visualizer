import { describe, it, expect } from "vitest";
import { traceServiceCalls, TracedCall } from "@/lib/parser/call-tracer";
import { Project } from "ts-morph";
import { readFileSync } from "fs";
import { join } from "path";

const fixturesDir = join(__dirname, "fixtures");

function readFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf-8");
}

function getFunction(code: string, functionName: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile("test.ts", code);
  const fn = sourceFile.getFunction(functionName);
  if (fn) return fn;
  for (const cls of sourceFile.getClasses()) {
    const method = cls.getMethod(functionName);
    if (method) return method;
  }
  throw new Error(`Function ${functionName} not found`);
}

describe("call-tracer", () => {
  it("detects service layer calls (e.g. enrollmentService.create)", () => {
    const code = readFixture("simple-handler.ts");
    const fn = getFunction(code, "createEnrollment");
    const calls = traceServiceCalls(fn);

    expect(calls.length).toBeGreaterThanOrEqual(1);
    const serviceCall = calls.find((c) => c.objectName === "enrollmentService");
    expect(serviceCall).toBeDefined();
    expect(serviceCall!.methodName).toBe("create");
    expect(serviceCall!.layer).toBe("service");
  });

  it("detects dao layer calls (e.g. this.ticketDao.findById)", () => {
    const code = readFixture("nested-conditions.ts");
    const fn = getFunction(code, "create");
    const calls = traceServiceCalls(fn);

    const daoCalls = calls.filter((c) => c.layer === "dao");
    expect(daoCalls.length).toBeGreaterThanOrEqual(3);

    const daoNames = daoCalls.map((c) => `${c.objectName}.${c.methodName}`);
    expect(daoNames).toContain("ticketDao.findById");
    expect(daoNames).toContain("ticketDao.update");
    expect(daoNames).toContain("enrollmentDao.insert");
  });

  it("infers layer from naming convention (*Service → service, *Dao → dao)", () => {
    const code = readFixture("multi-service.ts");
    const fn = getFunction(code, "createEnrollmentWithNotification");
    const calls = traceServiceCalls(fn);

    const enrollmentCall = calls.find(
      (c) => c.objectName === "enrollmentService"
    );
    expect(enrollmentCall?.layer).toBe("service");

    const notificationCall = calls.find(
      (c) => c.objectName === "notificationService"
    );
    expect(notificationCall?.layer).toBe("service");
  });

  it("preserves call order (line numbers)", () => {
    const code = readFixture("nested-conditions.ts");
    const fn = getFunction(code, "create");
    const calls = traceServiceCalls(fn);

    // Calls should be ordered by line number
    for (let i = 1; i < calls.length; i++) {
      expect(calls[i].line).toBeGreaterThanOrEqual(calls[i - 1].line);
    }
  });

  it("detects this.method() as internal call", () => {
    const code = `
class AccountService {
  repository: AccountRepository;

  async getAccountById(id: string) {
    const account = await this.repository.findById(id);
    if (!account) throw new Error("Not found");
    return this.formatAccount(account);
  }

  private formatAccount(account: any) {
    return { ...account, formatted: true };
  }
}`;
    const fn = getFunction(code, "getAccountById");
    const calls = traceServiceCalls(fn);

    // Should detect DAO call
    const daoCall = calls.find((c) => c.objectName === "repository");
    expect(daoCall).toBeDefined();
    expect(daoCall!.layer).toBe("dao");
    expect(daoCall!.isInternalCall).toBeFalsy();

    // Should detect internal call
    const internalCall = calls.find((c) => c.methodName === "formatAccount");
    expect(internalCall).toBeDefined();
    expect(internalCall!.objectName).toBe("this");
    expect(internalCall!.isInternalCall).toBe(true);
    expect(internalCall!.layer).toBe("service");
  });

  it("detects repository pattern as dao layer", () => {
    const code = `
export class OrderService {
  private orderRepository: any;
  async findOrder(id: string) {
    return await this.orderRepository.findById(id);
  }
}`;
    const fn = getFunction(code, "findOrder");
    const calls = traceServiceCalls(fn);

    expect(calls.length).toBe(1);
    expect(calls[0].layer).toBe("dao");
    expect(calls[0].objectName).toBe("orderRepository");
  });
});
