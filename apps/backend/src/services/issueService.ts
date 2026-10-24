import { Prisma, PrismaClient } from '@prisma/client';

const defaultPrisma = new PrismaClient();

const issueCreateSelect = {
  issueId: true,
  time: true,
  tableId: true,
  issueInformation: true,
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
    };
  }
}
