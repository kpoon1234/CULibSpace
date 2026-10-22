import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class TicketService {
  /**
   * US6-2: Retrieve ticket details, payment history, and valid time period
   */
  static async getTicketHistory(userId: number) {
    const tickets = await prisma.ticket.findMany({
      where: {
        uid: userId,
      },
      orderBy: {
        createdAt: 'desc', // หากใน schema.prisma ตั้งไว้เป็น created_at ให้เปลี่ยนเป็น created_at: 'desc'
      },
    });

    return tickets;
  }
}
