export class EnrollmentService {
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
