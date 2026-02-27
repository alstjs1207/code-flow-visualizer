import type { FlowGraph } from "@/types";

export const DEMO_HANDLER_CODE = `import { Router } from "express";
import { enrollmentService } from "../services/enrollment.service";

const router = Router();

export async function createEnrollment(req: Request, res: Response) {
  const { ticketId, userId, scheduleId } = req.body;

  if (!ticketId || !userId || !scheduleId) {
    throw new BadRequestError("필수 파라미터 누락");
  }

  const result = await enrollmentService.create({
    ticketId,
    userId,
    scheduleId,
  });
  return res.status(201).json(result);
}

router.post("/api/enrollments", createEnrollment);

export default router;
`;

export const DEMO_SERVICE_CODE = `export class EnrollmentService {
  private ticketDao: any;
  private scheduleDao: any;
  private enrollmentDao: any;

  async create(dto: CreateEnrollmentDto) {
    const ticket = await this.ticketDao.findById(dto.ticketId);

    if (ticket.status !== TicketStatus.ACTIVE) {
      throw new BusinessException("유효하지 않은 수강권");
    }

    if (ticket.remaining <= 0) {
      throw new BusinessException("횟수 소진");
    }

    const conflict = await this.scheduleDao.checkConflict(
      dto.userId,
      dto.scheduleId,
    );
    if (conflict) {
      throw new BusinessException("스케줄 충돌");
    }

    ticket.remaining -= 1;
    await this.ticketDao.update(ticket);

    const enrollment = await this.enrollmentDao.insert(dto);

    if (ticket.remaining === 0) {
      await this.ticketDao.updateStatus(ticket.id, TicketStatus.EXHAUSTED);
    }

    return enrollment;
  }
}
`;

export const DEMO_FLOW_GRAPH: FlowGraph = {
  handler: "createEnrollment",
  method: "POST",
  path: "/api/enrollments",
  file: "handler.ts",
  nodes: [
    { id: "h1", type: "entry", layer: "handler", label: "POST /api/enrollments" },
    { id: "h2", type: "condition", layer: "handler", label: "!ticketId || !userId || !scheduleId" },
    { id: "h3", type: "error", layer: "handler", label: "throw: 필수 파라미터 누락" },
    { id: "s1", type: "action", layer: "dao", label: "ticketDao.findById()" },
    { id: "s2", type: "condition", layer: "service", label: "ticket.status !== TicketStatus.ACTIVE" },
    { id: "s3", type: "error", layer: "service", label: "throw: 유효하지 않은 수강권" },
    { id: "s4", type: "condition", layer: "service", label: "ticket.remaining <= 0" },
    { id: "s5", type: "error", layer: "service", label: "throw: 횟수 소진" },
    { id: "s6", type: "action", layer: "dao", label: "scheduleDao.checkConflict()" },
    { id: "s7", type: "condition", layer: "service", label: "conflict" },
    { id: "s8", type: "error", layer: "service", label: "throw: 스케줄 충돌" },
    { id: "s9", type: "action", layer: "service", label: "ticket.remaining -= 1" },
    { id: "s10", type: "action", layer: "dao", label: "ticketDao.update()" },
    { id: "s11", type: "action", layer: "dao", label: "enrollmentDao.insert()" },
    { id: "s12", type: "condition", layer: "service", label: "ticket.remaining === 0" },
    { id: "s13", type: "action", layer: "dao", label: "ticketDao.updateStatus()" },
    { id: "r1", type: "return", layer: "handler", label: "201 Created" },
  ],
  edges: [
    { from: "h1", to: "h2" },
    { from: "h2", to: "h3", label: "Yes", type: "true" },
    { from: "h2", to: "s1", label: "No", type: "false" },
    { from: "s1", to: "s2" },
    { from: "s2", to: "s3", label: "Yes", type: "true" },
    { from: "s2", to: "s4", label: "No", type: "false" },
    { from: "s4", to: "s5", label: "Yes", type: "true" },
    { from: "s4", to: "s6", label: "No", type: "false" },
    { from: "s6", to: "s7" },
    { from: "s7", to: "s8", label: "Yes", type: "true" },
    { from: "s7", to: "s9", label: "No", type: "false" },
    { from: "s9", to: "s10" },
    { from: "s10", to: "s11" },
    { from: "s11", to: "s12" },
    { from: "s12", to: "s13", label: "Yes", type: "true" },
    { from: "s12", to: "r1", label: "No", type: "false" },
    { from: "s13", to: "r1" },
  ],
};
