import {
  PrismaClient,
  UserType,
  TableStatus,
  BookingStatus,
  TicketStatus,
  ZoneType,
} from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding CU LibSpace database with comprehensive developer test dataset...');

  // 1. ล้างข้อมูลเก่าตามลำดับ Foreign Key Dependency
  await prisma.operatingSchedule.deleteMany();
  await prisma.systemConfig.deleteMany();
  await prisma.manageIssue.deleteMany();
  await prisma.manageScore.deleteMany();
  await prisma.issueReport.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.table.deleteMany();
  await prisma.zone.deleteMany();
  await prisma.thaiUser.deleteMany();
  await prisma.foreignUser.deleteMany();
  await prisma.outsideUser.deleteMany();
  await prisma.universityUser.deleteMany();
  await prisma.user.deleteMany();
  await prisma.admin.deleteMany();

  console.log('🧹 Cleaned existing records.');

  // Precomputed bcrypt hash สำหรับ Admin password: "password123"
  const defaultAdminPasswordHash = '$2a$10$vI8aWBnW3fID.ZQ4/zo1G.q1lRps.9cGLcZEiGDMVr5yUP1KUOYTa';

  // 2. Seed Operating Schedules
  const now = new Date();
  const currentYear = now.getFullYear();

  await prisma.operatingSchedule.createMany({
    data: [
      {
        scheduleId: 1,
        name: 'เวลาทำการปกติ (Default Regular Semester)',
        startDate: new Date(`${currentYear}-01-01T00:00:00Z`),
        endDate: new Date(`${currentYear}-12-31T00:00:00Z`),
        openTime: '08:00',
        closeTime: '21:00',
        is24Hours: false,
        isClosed: false,
        priority: 1,
      },
      {
        scheduleId: 2,
        name: 'ช่วงสอบกลางภาค (Midterm Exam 24 Hours)',
        startDate: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        endDate: new Date(now.getTime() + 12 * 24 * 60 * 60 * 1000),
        openTime: '00:00',
        closeTime: '23:59',
        is24Hours: true,
        isClosed: false,
        priority: 2,
      },
      {
        scheduleId: 3,
        name: 'วันแรงงานแห่งชาติ (National Labor Day - Closed)',
        startDate: new Date(`${currentYear}-05-01T00:00:00Z`),
        endDate: new Date(`${currentYear}-05-01T00:00:00Z`),
        openTime: '00:00',
        closeTime: '00:00',
        is24Hours: false,
        isClosed: true,
        priority: 3,
      },
    ],
  });
  console.log('✅ Seeded Operating Schedules');

  // 3. Seed System Configuration
  await prisma.systemConfig.create({
    data: {
      configId: 1,
      maxBookingDurationMinutes: 120,
      lateThresholdMinutes: 15,
      earlyCheckInMinutes: 15,
      minScoreToBook: 50.0,
      maxAdvanceBookingDays: 7,
    },
  });
  console.log('✅ Seeded System Configuration');

  // 4. Seed Admin Accounts
  const admin1 = await prisma.admin.create({
    data: {
      adminId: 1,
      email: 'admin1@chula.ac.th',
      password: defaultAdminPasswordHash,
      firstname: 'Library',
      lastname: 'Master',
    },
  });

  const admin2 = await prisma.admin.create({
    data: {
      adminId: 2,
      email: 'somsak@chula.ac.th',
      password: defaultAdminPasswordHash,
      firstname: 'Somsak',
      lastname: 'Jaidee',
    },
  });
  console.log(`✅ Seeded 2 Admins: ${admin1.firstname}, ${admin2.firstname}`);

  // 5. Seed Zones
  const zoneSilent = await prisma.zone.create({
    data: { zoneId: 1, zoneType: ZoneType.SILENT },
  });
  const zoneGroup = await prisma.zone.create({
    data: { zoneId: 2, zoneType: ZoneType.GROUP },
  });
  const zoneCommon = await prisma.zone.create({
    data: { zoneId: 3, zoneType: ZoneType.COMMON },
  });
  console.log('✅ Seeded 3 Zones');

  // 6. Seed Tables
  const tablesData = [
    {
      tableId: 101,
      zoneId: zoneSilent.zoneId,
      status: TableStatus.OCCUPIED,
      numberOfSeat: 1,
      plugCap: 2,
      hasTvScreen: false,
    },
    {
      tableId: 102,
      zoneId: zoneSilent.zoneId,
      status: TableStatus.AVAILABLE,
      numberOfSeat: 1,
      plugCap: 2,
      hasTvScreen: false,
    },
    {
      tableId: 201,
      zoneId: zoneGroup.zoneId,
      status: TableStatus.AVAILABLE,
      numberOfSeat: 4,
      plugCap: 4,
      hasTvScreen: true,
    },
    {
      tableId: 202,
      zoneId: zoneGroup.zoneId,
      status: TableStatus.AVAILABLE,
      numberOfSeat: 4,
      plugCap: 4,
      hasTvScreen: true,
    },
    {
      tableId: 301,
      zoneId: zoneCommon.zoneId,
      status: TableStatus.AVAILABLE,
      numberOfSeat: 6,
      plugCap: 6,
      hasTvScreen: false,
    },
    {
      tableId: 501,
      zoneId: zoneSilent.zoneId,
      status: TableStatus.CLOSED,
      numberOfSeat: 1,
      plugCap: 0,
      hasTvScreen: false,
    },
  ];

  for (const t of tablesData) {
    await prisma.table.create({ data: t });
  }
  console.log(`✅ Seeded ${tablesData.length} Tables`);

  // 7. Seed Users & Subtypes
  const user1 = await prisma.user.create({
    data: {
      uid: 1,
      phone: '0811111111',
      behaviourScore: 90.0,
      email: 'alice@student.chula.ac.th',
      firstname: 'Alice',
      lastname: 'wonderland',
      userType: UserType.UNIVERSITY,
      universityUser: { create: { studentId: '6731315721' } },
    },
  });

  const user2 = await prisma.user.create({
    data: {
      uid: 2,
      phone: '0822222222',
      behaviourScore: 100.0,
      email: 'bobby@student.chula.ac.th',
      firstname: 'Bobby',
      lastname: 'dekdee',
      userType: UserType.UNIVERSITY,
      universityUser: { create: { studentId: '6731332321' } },
    },
  });

  const user3 = await prisma.user.create({
    data: {
      uid: 3,
      phone: '0833333333',
      behaviourScore: 40.0,
      email: 'lowscore@student.chula.ac.th',
      firstname: 'Lowscore',
      lastname: 'Student',
      userType: UserType.UNIVERSITY,
      universityUser: { create: { studentId: '6700000003' } },
    },
  });

  const user4 = await prisma.user.create({
    data: {
      uid: 4,
      phone: '0844444444',
      behaviourScore: 100.0,
      email: 'thai.noticket@gmail.com',
      firstname: 'pomkonThai',
      lastname: 'NoTicket',
      userType: UserType.THAI,
      outsideUser: {
        create: {
          thai: { create: { citizenId: '1100000000004' } },
        },
      },
    },
  });

  const user5 = await prisma.user.create({
    data: {
      uid: 5,
      phone: '0855555555',
      behaviourScore: 100.0,
      email: 'foreign.hasticket@gmail.com',
      firstname: 'pomkonForeign',
      lastname: 'HasTicket',
      userType: UserType.FOREIGN,
      outsideUser: {
        create: {
          foreignUser: { create: { passportId: 'P12345678' } },
        },
      },
    },
  });

  const user6 = await prisma.user.create({
    data: {
      uid: 6,
      phone: '0866666666',
      behaviourScore: 100.0,
      email: 'cancelking@student.chula.ac.th',
      firstname: 'Cancel',
      lastname: 'King',
      userType: UserType.UNIVERSITY,
      universityUser: { create: { studentId: '6700000006' } },
    },
  });

  console.log('✅ Seeded 6 Users (University, Thai, Foreign)');

  // 8. Seed Visitor Ticket for Foreign Outside User
  await prisma.ticket.create({
    data: {
      ticketId: 1,
      uid: user5.uid,
      paymentDetail: 'Credit Card: **** 5678',
      status: TicketStatus.PAID,
      startDateTime: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      endDateTime: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  console.log('✅ Seeded Visitor Ticket');

  // 9. Seed Bookings
  const bookingsData = [
    {
      bookingId: 10,
      uid: 1,
      tableId: 101,
      startDateTime: new Date('2026-04-25T09:00:00Z'),
      endDateTime: new Date('2026-04-25T11:00:00Z'),
      arriveTime: new Date('2026-04-25T09:05:00Z'),
      status: BookingStatus.COMPLETED,
    },
    {
      bookingId: 11,
      uid: 1,
      tableId: 102,
      startDateTime: new Date('2026-04-26T13:00:00Z'),
      endDateTime: new Date('2026-04-26T15:00:00Z'),
      arriveTime: new Date('2026-04-26T12:55:00Z'),
      status: BookingStatus.COMPLETED,
    },
    {
      bookingId: 20,
      uid: 2,
      tableId: 101,
      startDateTime: new Date('2026-04-27T10:00:00Z'),
      endDateTime: new Date('2026-04-27T12:00:00Z'),
      arriveTime: new Date('2026-04-27T10:08:00Z'),
      status: BookingStatus.COMPLETED,
    },
    {
      bookingId: 61,
      uid: 6,
      tableId: 101,
      startDateTime: new Date('2026-04-21T09:00:00Z'),
      endDateTime: new Date('2026-04-21T11:00:00Z'),
      arriveTime: null,
      status: BookingStatus.NO_SHOW,
    },
    {
      bookingId: 62,
      uid: 6,
      tableId: 102,
      startDateTime: new Date('2026-04-23T09:00:00Z'),
      endDateTime: new Date('2026-04-23T11:00:00Z'),
      arriveTime: null,
      status: BookingStatus.NO_SHOW,
    },
    {
      bookingId: 63,
      uid: 6,
      tableId: 201,
      startDateTime: new Date('2026-04-25T14:00:00Z'),
      endDateTime: new Date('2026-04-25T16:00:00Z'),
      arriveTime: null,
      status: BookingStatus.CANCELLED,
    },
    {
      bookingId: 888,
      uid: 2,
      tableId: 202,
      startDateTime: new Date('2026-04-28T13:00:00Z'),
      endDateTime: new Date('2026-04-28T15:00:00Z'),
      arriveTime: null,
      status: BookingStatus.PENDING,
    },
    {
      bookingId: 777,
      uid: 1,
      tableId: 301,
      startDateTime: new Date('2026-04-29T09:00:00Z'),
      endDateTime: new Date('2026-04-29T11:00:00Z'),
      arriveTime: null,
      status: BookingStatus.PENDING,
    },
    {
      bookingId: 1,
      uid: 1,
      tableId: 301,
      startDateTime: new Date('2026-04-29T14:00:00Z'),
      endDateTime: new Date('2026-04-29T16:00:00Z'),
      arriveTime: null,
      status: BookingStatus.PENDING,
    },
    {
      bookingId: 555,
      uid: 1,
      tableId: 101,
      startDateTime: new Date('2026-04-28T16:50:21Z'),
      endDateTime: new Date('2026-04-28T18:55:21Z'),
      arriveTime: new Date('2026-04-28T16:56:19Z'),
      status: BookingStatus.ACTIVE,
    },
    {
      bookingId: 999,
      uid: 1,
      tableId: 201,
      startDateTime: new Date('2026-04-28T16:25:21Z'),
      endDateTime: new Date('2026-04-28T17:55:21Z'),
      arriveTime: new Date('2026-04-28T16:56:24Z'),
      status: BookingStatus.NO_SHOW,
    },
    {
      bookingId: 3,
      uid: 5,
      tableId: 202,
      startDateTime: new Date('2026-04-28T10:00:00Z'),
      endDateTime: new Date('2026-04-28T11:00:00Z'),
      arriveTime: null,
      status: BookingStatus.PENDING,
    },

    // Dynamic Live Upcoming Slots สำหรับทดสอบ Frontend UI
    {
      bookingId: 1001,
      uid: 1,
      tableId: 101,
      startDateTime: new Date(now.getTime() + 10 * 60 * 1000),
      endDateTime: new Date(now.getTime() + 130 * 60 * 1000),
      arriveTime: null,
      status: BookingStatus.PENDING,
    },
    {
      bookingId: 1002,
      uid: 2,
      tableId: 201,
      startDateTime: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      endDateTime: new Date(now.getTime() + 26 * 60 * 60 * 1000),
      arriveTime: null,
      status: BookingStatus.PENDING,
    },
  ];

  for (const b of bookingsData) {
    await prisma.booking.create({ data: b });
  }
  console.log(`✅ Seeded ${bookingsData.length} Bookings`);

  // 10. Seed Issue Report & Management Logs
  await prisma.issueReport.create({
    data: {
      issueId: 1,
      uid: user1.uid,
      tableId: 101,
      time: new Date('2026-04-26T00:00:00Z'),
      issueInformation: 'ปลั๊กไฟฝั่งซ้ายชำรุด ชาร์จไม่ได้',
      manageIssues: {
        create: {
          adminId: admin1.adminId,
          timestamp: new Date('2026-04-27T00:00:00Z'),
          info: 'แจ้งทีมช่างเปลี่ยนเต้ารับแล้ว คาดว่าเสร็จใน 1 วัน',
        },
      },
    },
  });
  console.log('✅ Seeded Issue Report & Manage Issue Log');

  // 11. Seed Manage Score Audit Logs
  await prisma.manageScore.createMany({
    data: [
      {
        uid: 3,
        adminId: 1,
        timestamp: new Date('2026-04-18T00:00:00Z'),
        scoreChange: -60,
      },
      {
        uid: 1,
        adminId: 1,
        timestamp: new Date('2026-04-28T16:56:24Z'),
        scoreChange: -10,
      },
    ],
  });
  console.log('✅ Seeded Manage Score Audit Logs');

  console.log('🎉 Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
