import { IssueStatus, Prisma, PrismaClient } from '@prisma/client';
import { applyIssueAvailabilityChange } from './facilityAvailabilityService.js';

const defaultPrisma = new PrismaClient();

const issueCreateSelect = {
  issueId: true,
  time: true,
  tableId: true,
  issueInformation: true,
  status: true,
} as const satisfies Prisma.IssueReportSelect;

type CreatedIssue = Prisma.IssueReportGetPayload<{ select: typeof issueCreateSelect }>;

export interface CreateIssueInput {
  uid: number;
  tableId: number;
  issueInformation: string;
}

export interface CreatedIssueResult {
  issueId: number;
  time: string;
  tableId: number;
  issueInformation: string;
  status: IssueStatusLabel;
}

export type IssueStatusLabel = 'Pending' | 'In Progress' | 'Completed';

export interface AdminIssueListParams {
  q: string;
  status?: IssueStatus;
  page: number;
  pageSize: number;
}

export interface UpdateAdminIssueInput {
  adminId: number;
  issueId: number;
  status: IssueStatus;
  blocksTable: boolean;
  notes: string;
}

const adminIssueSelect = {
  issueId: true,
  time: true,
  issueInformation: true,
  status: true,
  blocksTable: true,
  manageIssues: {
    select: { info: true },
    orderBy: { timestamp: 'desc' },
    take: 1,
  },
  user: { select: { uid: true, firstname: true, lastname: true, email: true } },
  table: {
    select: {
      tableId: true,
      zone: { select: { zoneId: true, zoneType: true } },
    },
  },
} as const satisfies Prisma.IssueReportSelect;

type AdminIssue = Prisma.IssueReportGetPayload<{ select: typeof adminIssueSelect }>;

export function toIssueStatusLabel(status: IssueStatus): IssueStatusLabel {
  switch (status) {
    case IssueStatus.IN_PROGRESS:
      return 'In Progress';
    case IssueStatus.COMPLETED:
      return 'Completed';
    default:
      return 'Pending';
  }
}

export class IssueService {
  static async updateAdmin(
    input: UpdateAdminIssueInput,
    prismaClient: PrismaClient = defaultPrisma
  ) {
    return prismaClient.$transaction(async (tx) => {
      const admin = await tx.admin.findUnique({
        where: { adminId: input.adminId },
        select: { adminId: true },
      });
      if (!admin) {
        throw { status: 403, code: 'ADMIN_NOT_FOUND', message: 'Invalid admin account.' };
      }

      // This helper locks the table before writing the issue and clearing holds.
      const updated = await applyIssueAvailabilityChange(tx, input.issueId, {
        status: input.status,
        blocksTable: input.blocksTable,
      });

      // All updates to this issue hold the same table lock. Keep timestamps strictly
      // increasing even for requests in one millisecond (also part of the audit PK).
      const latest = await tx.manageIssue.findFirst({
        where: { issueId: input.issueId },
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true },
      });
      const timestamp = new Date(Math.max(Date.now(), (latest?.timestamp.getTime() ?? 0) + 1));
      const audit = await tx.manageIssue.create({
        data: {
          issueId: input.issueId,
          adminId: input.adminId,
          timestamp,
          info: input.notes,
        },
        select: { timestamp: true },
      });

      return {
        ...updated,
        status: toIssueStatusLabel(updated.status),
        notes: input.notes,
        updatedBy: input.adminId,
        updatedAt: audit.timestamp.toISOString(),
      };
    });
  }

  static async create(
    input: CreateIssueInput,
    prismaClient: PrismaClient = defaultPrisma
  ): Promise<CreatedIssueResult> {
    const user = await prismaClient.user.findUnique({
      where: { uid: input.uid },
      select: { isProfileComplete: true },
    });
    if (!user) {
      throw {
        status: 401,
        code: 'USER_NOT_FOUND',
        message: 'User session is no longer valid',
      };
    }
    if (!user.isProfileComplete) {
      throw {
        status: 403,
        code: 'PROFILE_INCOMPLETE',
        message: 'Please complete your profile onboarding before reporting an issue',
      };
    }

    const issue: CreatedIssue = await prismaClient.issueReport.create({
      data: {
        uid: input.uid,
        tableId: input.tableId,
        issueInformation: input.issueInformation,
      },
      select: issueCreateSelect,
    });

    return {
      issueId: issue.issueId,
      time: issue.time.toISOString(),
      tableId: issue.tableId,
      issueInformation: issue.issueInformation,
      status: toIssueStatusLabel(issue.status),
    };
  }

  static async listAdmin(params: AdminIssueListParams, prismaClient: PrismaClient = defaultPrisma) {
    const search = params.q.trim();
    const tableId = /^\d+$/.test(search) ? Number(search) : NaN;
    const isTableId = Number.isSafeInteger(tableId) && tableId >= 1 && tableId <= 2_147_483_647;
    const descriptionFilter: Prisma.IssueReportWhereInput = {
      issueInformation: { contains: search, mode: 'insensitive' },
    };
    const where: Prisma.IssueReportWhereInput = {
      ...(params.status && { status: params.status }),
      ...(search && (isTableId ? { OR: [descriptionFilter, { tableId }] } : descriptionFilter)),
    };

    const [rows, total] = await prismaClient.$transaction([
      prismaClient.issueReport.findMany({
        where,
        select: adminIssueSelect,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        orderBy: [{ time: 'desc' }, { issueId: 'desc' }],
      }),
      prismaClient.issueReport.count({ where }),
    ]);

    return {
      issues: rows.map((issue: AdminIssue) => ({
        issueId: issue.issueId,
        time: issue.time.toISOString(),
        issueInformation: issue.issueInformation,
        status: toIssueStatusLabel(issue.status),
        blocksTable: issue.blocksTable,
        notes: issue.manageIssues[0]?.info ?? '',
        user: issue.user,
        table: {
          tableId: issue.table.tableId,
          zoneId: issue.table.zone.zoneId,
          zoneType: issue.table.zone.zoneType,
        },
      })),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }
}
