import { Prisma, PrismaClient, UserType } from '@prisma/client';

const defaultPrisma = new PrismaClient();

const userSelect = {
  uid: true,
  firstname: true,
  lastname: true,
  email: true,
  phone: true,
  userType: true,
  behaviourScore: true,
  isProfileComplete: true,
  imageUrl: true,
  createdAt: true,
  universityUser: { select: { studentId: true } },
  outsideUser: {
    select: {
      thaiUser: { select: { citizenId: true } },
      foreignUser: { select: { passportId: true } },
    },
  },
} as const satisfies Prisma.UserSelect;

type SelectedUser = Prisma.UserGetPayload<{ select: typeof userSelect }>;

export interface AdminUserSearchParams {
  q: string;
  userType?: UserType;
  page: number;
  pageSize: number;
}

export interface AdminUserSearchResult {
  users: Array<{
    uid: number;
    firstname: string;
    lastname: string;
    email: string;
    phone: string | null;
    userType: UserType;
    behaviourScore: number;
    isProfileComplete: boolean;
    studentId: string | null;
    citizenId: string | null;
    passportId: string | null;
    imageUrl: string | null;
    createdAt: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

function maskCitizenId(citizenId: string | null | undefined): string | null {
  if (!citizenId) return null;
  const groups = /^(\d)(\d{4})\d{5}(\d{2})(\d)$/.exec(citizenId);
  // Never expose an unexpected value rather than risk returning a full ID.
  return groups ? `${groups[1]}-${groups[2]}-xxxxx-${groups[3]}-${groups[4]}` : null;
}

function buildWhere(q: string, userType?: UserType): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};
  if (userType) where.userType = userType;

  const search = q.trim().replace(/\s+/g, ' ');
  if (!search) return where;

  const contains = (value: string): Prisma.StringFilter => ({
    contains: value,
    mode: 'insensitive',
  });
  const matches: Prisma.UserWhereInput[] = [
    { firstname: contains(search) },
    { lastname: contains(search) },
    { email: contains(search) },
    { phone: contains(search) },
    { universityUser: { is: { studentId: contains(search) } } },
  ];

  const firstSpace = search.indexOf(' ');
  if (firstSpace !== -1) {
    matches.push({
      AND: [
        { firstname: contains(search.slice(0, firstSpace)) },
        { lastname: contains(search.slice(firstSpace + 1)) },
      ],
    });
  }

  where.OR = matches;
  return where;
}

export class AdminUserService {
  static async search(
    { q, userType, page, pageSize }: AdminUserSearchParams,
    prismaClient: PrismaClient = defaultPrisma
  ): Promise<AdminUserSearchResult> {
    const where = buildWhere(q, userType);
    const [users, total] = await prismaClient.$transaction([
      prismaClient.user.findMany({
        where,
        select: userSelect,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ firstname: 'asc' }, { lastname: 'asc' }],
      }),
      prismaClient.user.count({ where }),
    ]);

    return {
      users: users.map((user: SelectedUser) => ({
        uid: user.uid,
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email,
        phone: user.phone,
        userType: user.userType,
        behaviourScore: Number(user.behaviourScore),
        isProfileComplete: user.isProfileComplete,
        studentId: user.universityUser?.studentId ?? null,
        citizenId: maskCitizenId(user.outsideUser?.thaiUser?.citizenId),
        passportId: user.outsideUser?.foreignUser?.passportId ?? null,
        imageUrl: user.imageUrl,
        createdAt: user.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }
}
