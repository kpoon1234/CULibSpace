import { Prisma, PrismaClient } from '@prisma/client';

const defaultPrisma = new PrismaClient();

const auditSelect = {
  manageScoreId: true,
  timestamp: true,
  scoreChange: true,
  reason: true,
  user: {
    select: {
      uid: true,
      firstname: true,
      lastname: true,
      email: true,
      universityUser: { select: { studentId: true } },
    },
  },
  admin: {
    select: {
      adminId: true,
      firstname: true,
      lastname: true,
      email: true,
    },
  },
} as const satisfies Prisma.ManageScoreSelect;

type SelectedAudit = Prisma.ManageScoreGetPayload<{ select: typeof auditSelect }>;

export type AuditDirection = 'deduct' | 'add';

export interface AdminAuditListParams {
  q: string;
  direction?: AuditDirection;
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
}

export interface AdminAuditListResult {
  logs: Array<{
    id: number;
    timestamp: string;
    scoreChange: number;
    reason: string;
    user: {
      uid: number;
      firstname: string;
      lastname: string;
      email: string;
      studentId: string | null;
    };
    admin: {
      adminId: number;
      firstname: string;
      lastname: string;
      email: string;
    };
  }>;
  total: number;
  page: number;
  pageSize: number;
}

function buildWhere({
  q,
  direction,
  from,
  to,
}: AdminAuditListParams): Prisma.ManageScoreWhereInput {
  const where: Prisma.ManageScoreWhereInput = {};
  const search = q.trim().replace(/\s+/g, ' ');
  if (search) {
    const contains = (value: string): Prisma.StringFilter => ({
      contains: value,
      mode: 'insensitive',
    });
    const matches: Prisma.ManageScoreWhereInput[] = [
      { reason: contains(search) },
      { user: { is: { firstname: contains(search) } } },
      { user: { is: { lastname: contains(search) } } },
      { user: { is: { email: contains(search) } } },
      { user: { is: { universityUser: { is: { studentId: contains(search) } } } } },
      { admin: { is: { firstname: contains(search) } } },
      { admin: { is: { lastname: contains(search) } } },
      { admin: { is: { email: contains(search) } } },
    ];

    const firstSpace = search.indexOf(' ');
    if (firstSpace !== -1) {
      const firstName = search.slice(0, firstSpace);
      const lastName = search.slice(firstSpace + 1);
      matches.push(
        { user: { is: { firstname: contains(firstName), lastname: contains(lastName) } } },
        { admin: { is: { firstname: contains(firstName), lastname: contains(lastName) } } }
      );
    }

    where.OR = matches;
  }
  if (direction === 'deduct') where.scoreChange = { lt: 0 };
  if (direction === 'add') where.scoreChange = { gt: 0 };
  if (from || to) where.timestamp = { ...(from && { gte: from }), ...(to && { lte: to }) };
  return where;
}

export class AdminAuditService {
  static async list(
    params: AdminAuditListParams,
    prismaClient: PrismaClient = defaultPrisma
  ): Promise<AdminAuditListResult> {
    const where = buildWhere(params);
    const [rows, total] = await prismaClient.$transaction([
      prismaClient.manageScore.findMany({
        where,
        select: auditSelect,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        orderBy: [{ timestamp: 'desc' }, { manageScoreId: 'desc' }],
      }),
      prismaClient.manageScore.count({ where }),
    ]);

    return {
      logs: rows.map((row: SelectedAudit) => ({
        id: row.manageScoreId,
        timestamp: row.timestamp.toISOString(),
        scoreChange: row.scoreChange,
        reason: row.reason,
        user: {
          uid: row.user.uid,
          firstname: row.user.firstname,
          lastname: row.user.lastname,
          email: row.user.email,
          studentId: row.user.universityUser?.studentId ?? null,
        },
        admin: {
          adminId: row.admin.adminId,
          firstname: row.admin.firstname,
          lastname: row.admin.lastname,
          email: row.admin.email,
        },
      })),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }
}
