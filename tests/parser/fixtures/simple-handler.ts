import { Router } from "express";
import { enrollmentService } from "../services/enrollment.service";

const router = Router();

export async function createEnrollment(req: Request, res: Response) {
  const { ticketId, userId, scheduleId } = req.body;

  // validation
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
