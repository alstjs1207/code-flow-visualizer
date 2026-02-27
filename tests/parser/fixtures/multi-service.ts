import { Router } from "express";
import { enrollmentService } from "../services/enrollment.service";
import { notificationService } from "../services/notification.service";

const router = Router();

export async function createEnrollmentWithNotification(req: Request, res: Response) {
  const { ticketId, userId, scheduleId } = req.body;

  if (!ticketId || !userId) {
    throw new BadRequestError("필수 파라미터 누락");
  }

  const result = await enrollmentService.create({
    ticketId,
    userId,
    scheduleId,
  });

  await notificationService.sendEnrollmentConfirmation(userId, result.id);

  return res.status(201).json(result);
}

router.post("/api/enrollments", createEnrollmentWithNotification);

export default router;
