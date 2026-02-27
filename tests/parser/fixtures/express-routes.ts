import { Router } from "express";

const router = Router();

export async function getTickets(req: Request, res: Response) {
  const tickets = await ticketService.findAll();
  return res.json(tickets);
}

export async function getTicketById(req: Request, res: Response) {
  const ticket = await ticketService.findById(req.params.id);
  if (!ticket) {
    throw new NotFoundError("수강권 없음");
  }
  return res.json(ticket);
}

export async function updateTicket(req: Request, res: Response) {
  const ticket = await ticketService.update(req.params.id, req.body);
  return res.json(ticket);
}

export async function deleteTicket(req: Request, res: Response) {
  await ticketService.delete(req.params.id);
  return res.status(204).send();
}

router.get("/api/tickets", getTickets);
router.get("/api/tickets/:id", getTicketById);
router.patch("/api/tickets/:id", updateTicket);
router.delete("/api/tickets/:id", deleteTicket);

export default router;
