import { IssueStatus, Prisma, PrismaClient } from '@prisma/client';

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

const adminIssueSelect = {
  issueId: true,
  time: true,
  issueInformation: true,
  status: true,
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
  static async create(
    input: CreateIssueInput,
    prismaClient: PrismaClient = defaultPrisma
  ): Promise<CreatedIssueResult> {
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
    const search = params.q.trim().replace(/\s+/g, ' ');
    const where: Prisma.IssueReportWhereInput = {
      ...(params.status && { status: params.status }),
      ...(search && { issueInformation: { contains: search, mode: 'insensitive' } }),
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
