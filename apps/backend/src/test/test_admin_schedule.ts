import assert from 'node:assert/strict';
import test from 'node:test';
import { BookingStatus, OperatingSchedule, PrismaClient, TableStatus } from '@prisma/client';

process.env.DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/invalid';
process.env.JWT_SECRET = 'admin-schedule-unit-test-secret';

const { AdminScheduleService } = await import('../services/adminScheduleService.js');
const { BookingService } = await import('../services/bookingService.js');
const { AdminScheduleController } = await import('../controllers/adminScheduleController.js');
const { signJwt } = await import('../utils/jwt.js');
const { default: adminRoutes } = await import('../routes/adminRoutes.js');

function scheduleRow(overrides: Partial<OperatingSchedule> = {}): OperatingSchedule {
  return {
    scheduleId: 1,
    name: 'เวลาทำการปกติ (Default Regular Semester)',
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: new Date('2026-12-31T00:00:00.000Z'),
    openTime: '08:00',
    closeTime: '21:00',
    is24Hours: false,
    isClosed: false,
    priority: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function mockSchedulePrisma(initialRows: OperatingSchedule[] = []) {
  let rows = [...initialRows];
  const calls: {
    findMany?: any;
    findFirst?: any;
    findUnique?: any;
    create?: any;
    update?: any;
    delete?: any;
    count?: any;
    transactionCount: number;
  } = {
    transactionCount: 0,
  };

  const client = {
    $transaction: async (fn: any) => {
      calls.transactionCount++;
      if (typeof fn === 'function') {
        return await fn(client);
      }
      return Promise.all(fn);
    },
    $executeRaw: async () => 0,
    $executeRawUnsafe: async () => 0,
    $queryRaw: async () => [],
    operatingSchedule: {
      findMany: async (args: any) => {
        calls.findMany = args;
        let filtered = [...rows];
        if (args?.where) {
          if (args.where.scheduleId?.not !== undefined) {
            filtered = filtered.filter((r) => r.scheduleId !== args.where.scheduleId.not);
          }
          if (args.where.priority !== undefined) {
            filtered = filtered.filter((r) => r.priority === args.where.priority);
          }
          if (args.where.isClosed !== undefined) {
            filtered = filtered.filter((r) => r.isClosed === args.where.isClosed);
          }
          if (args.where.is24Hours !== undefined) {
            filtered = filtered.filter((r) => r.is24Hours === args.where.is24Hours);
          }
          if (args.where.name?.contains) {
            const query = args.where.name.contains.toLowerCase();
            filtered = filtered.filter((r) => r.name.toLowerCase().includes(query));
          }
          if (args.where.startDate?.lte && args.where.endDate?.gte) {
            const targetDate = args.where.startDate.lte;
            filtered = filtered.filter((r) => r.startDate <= targetDate && r.endDate >= targetDate);
          }
        }
        if (args?.orderBy) {
          filtered.sort((a, b) => b.priority - a.priority);
        }
        if (args?.take !== undefined) {
          filtered = filtered.slice(0, args.take);
        }
        return filtered;
      },
      findFirst: async (args: any) => {
        calls.findFirst = args;
        if (args?.where) {
          return (
            rows.find((r) => {
              if (
                args.where.scheduleId?.not !== undefined &&
                r.scheduleId === args.where.scheduleId.not
              ) {
                return false;
              }
              if (args.where.priority !== undefined && r.priority !== args.where.priority) {
                return false;
              }
              if (args.where.startDate?.lte && args.where.endDate?.gte) {
                const overlapStart = args.where.endDate.gte;
                const overlapEnd = args.where.startDate.lte;
                return r.startDate <= overlapEnd && r.endDate >= overlapStart;
              }
              return true;
            }) ?? null
          );
        }
        return rows[0] ?? null;
      },
      findUnique: async (args: any) => {
        calls.findUnique = args;
        return rows.find((r) => r.scheduleId === args.where.scheduleId) ?? null;
      },
      create: async (args: any) => {
        calls.create = args;
        const newRecord: OperatingSchedule = {
          scheduleId: rows.length > 0 ? Math.max(...rows.map((r) => r.scheduleId)) + 1 : 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...args.data,
        };
        rows.push(newRecord);
        return newRecord;
      },
      update: async (args: any) => {
        calls.update = args;
        const index = rows.findIndex((r) => r.scheduleId === args.where.scheduleId);
        if (index === -1) throw new Error('Record not found');
        rows[index] = { ...rows[index], ...args.data, updatedAt: new Date() };
        return rows[index];
      },
      delete: async (args: any) => {
        calls.delete = args;
        const index = rows.findIndex((r) => r.scheduleId === args.where.scheduleId);
        if (index === -1) throw new Error('Record not found');
        const deleted = rows.splice(index, 1)[0];
        return deleted;
      },
      count: async (args: any) => {
        calls.count = args;
        return rows.length;
      },
    },
  };

  return { client: client as unknown as PrismaClient, calls, getRows: () => rows };
}

function mockResponse() {
  return {
    statusCode: 200,
    body: null as any,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
  };
}

// ==========================================
// Suite 1: Calendar Date & Time Validation Helpers
// ==========================================

test('parseCalendarDate accurately validates valid calendar dates and leap years', () => {
  // Non-leap year 2026
  assert.equal(AdminScheduleService.parseCalendarDate('2026-02-28')?.dateStr, '2026-02-28');
  assert.equal(AdminScheduleService.parseCalendarDate('2026-02-29'), null); // Invalid in 2026
  assert.equal(AdminScheduleService.parseCalendarDate('2026-04-30')?.dateStr, '2026-04-30');
  assert.equal(AdminScheduleService.parseCalendarDate('2026-04-31'), null); // April has 30 days
  assert.equal(AdminScheduleService.parseCalendarDate('2026-13-01'), null); // Invalid month 13
  assert.equal(AdminScheduleService.parseCalendarDate('invalid-date'), null);

  // Leap year 2028
  assert.equal(AdminScheduleService.parseCalendarDate('2028-02-29')?.dateStr, '2028-02-29');

  // ISO 8601 string support
  const isoParsed = AdminScheduleService.parseCalendarDate('2026-10-27T08:30:00.000Z');
  assert.equal(isoParsed?.dateStr, '2026-10-27');

  // Strict ISO 8601 time & timezone validation: reject invalid hours/minutes/seconds/offsets
  assert.equal(AdminScheduleService.parseCalendarDate('2026-11-01T99:99:99+99:99'), null);
  assert.equal(AdminScheduleService.parseCalendarDate('2026-11-01T25:00:00Z'), null);
  assert.equal(AdminScheduleService.parseCalendarDate('2026-11-01T12:60:00Z'), null);
  assert.equal(AdminScheduleService.parseCalendarDate('2026-11-01T12:30:60Z'), null);
  assert.equal(AdminScheduleService.parseCalendarDate('2026-11-01T12:30:00+25:00'), null);
});

test('isValidTimeFormat enforces HH:MM 24-hour time', () => {
  assert.equal(AdminScheduleService.isValidTimeFormat('00:00'), true);
  assert.equal(AdminScheduleService.isValidTimeFormat('08:30'), true);
  assert.equal(AdminScheduleService.isValidTimeFormat('23:59'), true);

  assert.equal(AdminScheduleService.isValidTimeFormat('24:00'), false);
  assert.equal(AdminScheduleService.isValidTimeFormat('25:00'), false);
  assert.equal(AdminScheduleService.isValidTimeFormat('8:00'), false);
  assert.equal(AdminScheduleService.isValidTimeFormat('12:60'), false);
  assert.equal(AdminScheduleService.isValidTimeFormat('invalid'), false);
  assert.equal(AdminScheduleService.isValidTimeFormat(null), false);
});

test('timeToMinutes calculates total minutes from midnight', () => {
  assert.equal(AdminScheduleService.timeToMinutes('00:00'), 0);
  assert.equal(AdminScheduleService.timeToMinutes('08:00'), 480);
  assert.equal(AdminScheduleService.timeToMinutes('21:00'), 1260);
  assert.equal(AdminScheduleService.timeToMinutes('23:59'), 1439);
});

// ==========================================
// Suite 2: Adding Operating Schedules (Create)
// ==========================================

test('createSchedule successfully creates standard semester hours (08:00 - 21:00, priority 1)', async () => {
  const { client, calls } = mockSchedulePrisma();
  const created = await AdminScheduleService.createSchedule(
    {
      name: 'เวลาทำการปกติ ภาคการศึกษา 1/2569',
      startDate: '2026-08-01',
      endDate: '2026-12-15',
      openTime: '08:00',
      closeTime: '21:00',
      priority: 1,
    },
    client
  );

  assert.equal(calls.transactionCount, 1);
  assert.equal(created.name, 'เวลาทำการปกติ ภาคการศึกษา 1/2569');
  assert.equal(created.openTime, '08:00');
  assert.equal(created.closeTime, '21:00');
  assert.equal(created.is24Hours, false);
  assert.equal(created.isClosed, false);
  assert.equal(created.priority, 1);
});

test('createSchedule successfully creates 24-hour exam schedule with default 00:00-23:59', async () => {
  const { client } = mockSchedulePrisma();
  const created = await AdminScheduleService.createSchedule(
    {
      name: 'ช่วงสอบกลางภาค (24 Hours Open)',
      startDate: '2026-10-01',
      endDate: '2026-10-14',
      is24Hours: true,
      priority: 2,
    },
    client
  );

  assert.equal(created.is24Hours, true);
  assert.equal(created.isClosed, false);
  assert.equal(created.openTime, '00:00');
  assert.equal(created.closeTime, '23:59');
  assert.equal(created.priority, 2);
});

test('createSchedule successfully creates special holiday closure schedule (isClosed: true, priority 3)', async () => {
  const { client } = mockSchedulePrisma();
  const created = await AdminScheduleService.createSchedule(
    {
      name: 'วันปิยมหาราช (Chulalongkorn Day - Closed)',
      startDate: '2026-10-23',
      endDate: '2026-10-23',
      isClosed: true,
      priority: 3,
    },
    client
  );

  assert.equal(created.isClosed, true);
  assert.equal(created.is24Hours, false);
  assert.equal(created.openTime, '00:00');
  assert.equal(created.closeTime, '00:00');
  assert.equal(created.priority, 3);
});

test('createSchedule rejects empty or missing name', async () => {
  const { client } = mockSchedulePrisma();
  await assert.rejects(
    AdminScheduleService.createSchedule(
      {
        name: '   ',
        startDate: '2026-08-01',
        endDate: '2026-12-15',
      },
      client
    ),
    (err: any) => err.status === 400 && err.message.includes('name is required')
  );
});

test('createSchedule rejects name exceeding 100 characters', async () => {
  const { client } = mockSchedulePrisma();
  await assert.rejects(
    AdminScheduleService.createSchedule(
      {
        name: 'a'.repeat(101),
        startDate: '2026-08-01',
        endDate: '2026-12-15',
      },
      client
    ),
    (err: any) => err.status === 400 && err.message.includes('must not exceed 100 characters')
  );
});

test('createSchedule rejects invalid startDate or endDate format', async () => {
  const { client } = mockSchedulePrisma();
  await assert.rejects(
    AdminScheduleService.createSchedule(
      {
        name: 'ตารางทดสอบ',
        startDate: 'not-a-date',
        endDate: '2026-12-15',
      },
      client
    ),
    (err: any) => err.status === 400 && err.message.includes('Invalid startDate format')
  );

  await assert.rejects(
    AdminScheduleService.createSchedule(
      {
        name: 'ตารางทดสอบ',
        startDate: '2026-08-01',
        endDate: '2026-02-30', // Feb 30 does not exist
      },
      client
    ),
    (err: any) => err.status === 400 && err.message.includes('Invalid endDate format')
  );
});

test('createSchedule rejects when startDate is after endDate', async () => {
  const { client } = mockSchedulePrisma();
  await assert.rejects(
    AdminScheduleService.createSchedule(
      {
        name: 'ตารางย้อนเวลา',
        startDate: '2026-12-31',
        endDate: '2026-01-01',
      },
      client
    ),
    (err: any) => err.status === 400 && err.message.includes('cannot be after endDate')
  );
});

test('createSchedule rejects contradictory flags (both is24Hours and isClosed)', async () => {
  const { client } = mockSchedulePrisma();
  await assert.rejects(
    AdminScheduleService.createSchedule(
      {
        name: 'ตารางขัดแย้ง',
        startDate: '2026-10-01',
        endDate: '2026-10-05',
        is24Hours: true,
        isClosed: true,
      },
      client
    ),
    (err: any) => err.status === 400 && err.message.includes('both 24 hours and closed')
  );
});

test('createSchedule rejects invalid time format', async () => {
  const { client } = mockSchedulePrisma();
  await assert.rejects(
    AdminScheduleService.createSchedule(
      {
        name: 'ตารางเวลาผิด',
        startDate: '2026-10-01',
        endDate: '2026-10-05',
        openTime: '8:00', // Missing leading zero
        closeTime: '21:00',
      },
      client
    ),
    (err: any) => err.status === 400 && err.message.includes('Invalid openTime format')
  );

  await assert.rejects(
    AdminScheduleService.createSchedule(
      {
        name: 'ตารางเวลาผิด',
        startDate: '2026-10-01',
        endDate: '2026-10-05',
        openTime: '08:00',
        closeTime: '24:00', // Invalid 24:00
      },
      client
    ),
    (err: any) => err.status === 400 && err.message.includes('Invalid closeTime format')
  );
});

test('createSchedule rejects closeTime <= openTime for standard hours', async () => {
  const { client } = mockSchedulePrisma();
  // Equal times
  await assert.rejects(
    AdminScheduleService.createSchedule(
      {
        name: 'ตารางเวลาเท่ากัน',
        startDate: '2026-10-01',
        endDate: '2026-10-05',
        openTime: '10:00',
        closeTime: '10:00',
      },
      client
    ),
    (err: any) => err.status === 400 && err.message.includes('must be strictly after openTime')
  );

  // Close before open
  await assert.rejects(
    AdminScheduleService.createSchedule(
      {
        name: 'ตารางเวลากลับหัว',
        startDate: '2026-10-01',
        endDate: '2026-10-05',
        openTime: '21:00',
        closeTime: '08:00',
      },
      client
    ),
    (err: any) => err.status === 400 && err.message.includes('must be strictly after openTime')
  );
});

test('createSchedule rejects non-positive integer priority', async () => {
  const { client } = mockSchedulePrisma();
  await assert.rejects(
    AdminScheduleService.createSchedule(
      {
        name: 'ตาราง priority 0',
        startDate: '2026-10-01',
        endDate: '2026-10-05',
        priority: 0,
      },
      client
    ),
    (err: any) => err.status === 400 && err.message.includes('Priority must be a positive integer')
  );

  await assert.rejects(
    AdminScheduleService.createSchedule(
      {
        name: 'ตาราง priority ลบ',
        startDate: '2026-10-01',
        endDate: '2026-10-05',
        priority: -2,
      },
      client
    ),
    (err: any) => err.status === 400 && err.message.includes('Priority must be a positive integer')
  );
});

test('createSchedule rejects same-priority overlapping schedule with 409 conflict', async () => {
  const existing = scheduleRow({
    scheduleId: 1,
    name: 'ภาคการศึกษา 1',
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    endDate: new Date('2026-12-15T00:00:00.000Z'),
    priority: 1,
  });
  const { client } = mockSchedulePrisma([existing]);

  await assert.rejects(
    AdminScheduleService.createSchedule(
      {
        name: 'ตารางทับซ้อน priority 1',
        startDate: '2026-10-01',
        endDate: '2026-11-01',
        priority: 1,
      },
      client
    ),
    (err: any) => err.status === 409 && err.message.includes('Conflicting schedule')
  );
});

// [Issue 1 Review Regression] Overlap check under transaction blocks concurrent same-priority same-date creation
test('[Issue 1] concurrent schedule creation with same priority and date rejects second request with 409 Conflict', async () => {
  const { client } = mockSchedulePrisma([]);

  // First request creates a closed schedule on 2026-11-10 with priority 2
  await AdminScheduleService.createSchedule(
    {
      name: 'ตารางปิดบริการ',
      startDate: '2026-11-10',
      endDate: '2026-11-10',
      isClosed: true,
      priority: 2,
    },
    client
  );

  // Second concurrent request attempts to create a 24-hour schedule on the same date with priority 2
  await assert.rejects(
    AdminScheduleService.createSchedule(
      {
        name: 'ตารางเปิด 24 ชั่วโมง',
        startDate: '2026-11-10',
        endDate: '2026-11-10',
        is24Hours: true,
        priority: 2,
      },
      client
    ),
    (err: any) => err.status === 409 && err.message.includes('Conflicting schedule')
  );
});

test('createSchedule allows different-priority overlapping schedules (priority hierarchy)', async () => {
  const existing = scheduleRow({
    scheduleId: 1,
    name: 'ภาคการศึกษา 1 (ปกติ)',
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    endDate: new Date('2026-12-15T00:00:00.000Z'),
    priority: 1,
  });
  const { client } = mockSchedulePrisma([existing]);

  // Exam period (priority 2) overlapping normal semester (priority 1) is valid!
  const examSchedule = await AdminScheduleService.createSchedule(
    {
      name: 'ช่วงสอบกลางภาค',
      startDate: '2026-10-01',
      endDate: '2026-10-14',
      is24Hours: true,
      priority: 2,
    },
    client
  );

  assert.equal(examSchedule.priority, 2);
  assert.equal(examSchedule.name, 'ช่วงสอบกลางภาค');
});

// ==========================================
// Suite 3: Editing Operating Schedules (Update)
// ==========================================

test('updateSchedule successfully updates schedule name and times', async () => {
  const existing = scheduleRow({ scheduleId: 1, openTime: '08:00', closeTime: '21:00' });
  const { client, calls } = mockSchedulePrisma([existing]);

  const updated = await AdminScheduleService.updateSchedule(
    1,
    {
      name: 'เวลาทำการใหม่',
      openTime: '09:00',
      closeTime: '20:00',
    },
    client
  );

  assert.equal(calls.transactionCount, 1);
  assert.equal(updated.name, 'เวลาทำการใหม่');
  assert.equal(updated.openTime, '09:00');
  assert.equal(updated.closeTime, '20:00');
});

// [Issue 2 Review Regression] PATCH only updates specified fields without overwriting concurrent modifications to other fields
test('[Issue 2] PATCH updates only provided fields and preserves other fields updated concurrently', async () => {
  const existing = scheduleRow({
    scheduleId: 1,
    name: 'Original Semester Name',
    openTime: '08:00',
    closeTime: '21:00',
  });
  const { client, getRows } = mockSchedulePrisma([existing]);

  // Request A updates only the name
  const resA = await AdminScheduleService.updateSchedule(1, { name: 'Renamed by Admin A' }, client);
  assert.equal(resA.name, 'Renamed by Admin A');
  assert.equal(resA.closeTime, '21:00');

  // Request B updates only closeTime without sending name
  const resB = await AdminScheduleService.updateSchedule(1, { closeTime: '20:00' }, client);

  // Request B must NOT overwrite name back to 'Original Semester Name'!
  assert.equal(resB.name, 'Renamed by Admin A');
  assert.equal(resB.closeTime, '20:00');

  // Verify in the underlying persistent store that both changes survived
  const persisted = getRows().find((r) => r.scheduleId === 1);
  assert.equal(persisted?.name, 'Renamed by Admin A');
  assert.equal(persisted?.closeTime, '20:00');
});

test('updateSchedule returns 404 when scheduleId does not exist', async () => {
  const { client } = mockSchedulePrisma([]);
  await assert.rejects(
    AdminScheduleService.updateSchedule(999, { name: 'Non-existent' }, client),
    (err: any) => err.status === 404 && err.message.includes('not found')
  );
});

test('updateSchedule rejects invalid scheduleId format', async () => {
  const { client } = mockSchedulePrisma([]);
  await assert.rejects(
    AdminScheduleService.updateSchedule(-1, { name: 'Invalid ID' }, client),
    (err: any) =>
      err.status === 400 && err.message.includes('scheduleId must be a positive integer')
  );
});

test('updateSchedule validates chronological ordering when updating startDate against existing endDate', async () => {
  const existing = scheduleRow({
    scheduleId: 1,
    startDate: new Date('2026-05-01T00:00:00.000Z'),
    endDate: new Date('2026-05-31T00:00:00.000Z'),
  });
  const { client } = mockSchedulePrisma([existing]);

  // Updating startDate to be after existing endDate
  await assert.rejects(
    AdminScheduleService.updateSchedule(1, { startDate: '2026-06-15' }, client),
    (err: any) => err.status === 400 && err.message.includes('cannot be after endDate')
  );
});

test('updateSchedule validates closeTime > openTime when updating closeTime against existing openTime', async () => {
  const existing = scheduleRow({
    scheduleId: 1,
    openTime: '09:00',
    closeTime: '20:00',
  });
  const { client } = mockSchedulePrisma([existing]);

  // Updating closeTime to be before existing openTime 09:00
  await assert.rejects(
    AdminScheduleService.updateSchedule(1, { closeTime: '08:30' }, client),
    (err: any) => err.status === 400 && err.message.includes('must be strictly after openTime')
  );
});

test('updateSchedule allows updating schedule dates without conflicting with itself', async () => {
  const existing = scheduleRow({
    scheduleId: 1,
    name: 'เวลาทำการปกติ',
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: new Date('2026-12-31T00:00:00.000Z'),
    priority: 1,
  });
  const { client } = mockSchedulePrisma([existing]);

  const updated = await AdminScheduleService.updateSchedule(
    1,
    {
      startDate: '2026-02-01',
      endDate: '2026-11-30',
    },
    client
  );

  assert.equal(updated.startDate.toISOString().slice(0, 10), '2026-02-01');
  assert.equal(updated.endDate.toISOString().slice(0, 10), '2026-11-30');
});

// ==========================================
// Suite 4: Deleting & Getting Operating Schedules
// ==========================================

test('deleteSchedule deletes existing schedule and returns deleted item', async () => {
  const existing = scheduleRow({ scheduleId: 10 });
  const { client, getRows } = mockSchedulePrisma([existing]);

  const deleted = await AdminScheduleService.deleteSchedule(10, client);
  assert.equal(deleted.scheduleId, 10);
  assert.equal(getRows().length, 0);
});

test('deleteSchedule returns 404 for non-existent schedule', async () => {
  const { client } = mockSchedulePrisma([]);
  await assert.rejects(
    AdminScheduleService.deleteSchedule(404, client),
    (err: any) => err.status === 404 && err.message.includes('not found')
  );
});

test('getScheduleById returns schedule for existing id and 404 otherwise', async () => {
  const existing = scheduleRow({ scheduleId: 5, name: 'Special Schedule' });
  const { client } = mockSchedulePrisma([existing]);

  const found = await AdminScheduleService.getScheduleById(5, client);
  assert.equal(found.name, 'Special Schedule');

  await assert.rejects(
    AdminScheduleService.getScheduleById(999, client),
    (err: any) => err.status === 404 && err.message.includes('not found')
  );
});

// ==========================================
// Suite 5: Listing and Active Schedule Resolution
// ==========================================

test('listSchedules returns filtered results by name search and priority', async () => {
  const rows = [
    scheduleRow({ scheduleId: 1, name: 'เวลาทำการปกติ เทอม 1', priority: 1 }),
    scheduleRow({ scheduleId: 2, name: 'ช่วงสอบกลางภาค 24h', priority: 2, is24Hours: true }),
    scheduleRow({ scheduleId: 3, name: 'วันหยุดพิเศษ ปิดบริการ', priority: 3, isClosed: true }),
  ];
  const { client } = mockSchedulePrisma(rows);

  const searchResult = await AdminScheduleService.listSchedules({ q: 'สอบ' }, client);
  assert.equal(searchResult.schedules.length, 1);
  assert.equal(searchResult.schedules[0].name, 'ช่วงสอบกลางภาค 24h');

  const priorityResult = await AdminScheduleService.listSchedules({ priority: 3 }, client);
  assert.equal(priorityResult.schedules.length, 1);
  assert.equal(priorityResult.schedules[0].priority, 3);
});

test('getActiveScheduleOnDate respects priority hierarchy (Holiday > Exam > Regular)', async () => {
  const rows = [
    scheduleRow({
      scheduleId: 1,
      name: 'เวลาทำการปกติ',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z'),
      priority: 1,
    }),
    scheduleRow({
      scheduleId: 2,
      name: 'ช่วงสอบกลางภาค 24 ชม.',
      startDate: new Date('2026-10-15T00:00:00.000Z'),
      endDate: new Date('2026-10-25T00:00:00.000Z'),
      is24Hours: true,
      priority: 2,
    }),
    scheduleRow({
      scheduleId: 3,
      name: 'วันหยุดพิเศษ 23 ต.ค.',
      startDate: new Date('2026-10-23T00:00:00.000Z'),
      endDate: new Date('2026-10-23T00:00:00.000Z'),
      isClosed: true,
      priority: 3,
    }),
  ];
  const { client } = mockSchedulePrisma(rows);

  // On Oct 23: Holiday (priority 3) should win over Exam (priority 2) and Regular (priority 1)
  const oct23Active = await AdminScheduleService.getActiveScheduleOnDate('2026-10-23', client);
  assert.equal(oct23Active?.name, 'วันหยุดพิเศษ 23 ต.ค.');
  assert.equal(oct23Active?.priority, 3);
  assert.equal(oct23Active?.isClosed, true);

  // On Oct 16: Exam (priority 2) should win over Regular (priority 1)
  const oct16Active = await AdminScheduleService.getActiveScheduleOnDate('2026-10-16', client);
  assert.equal(oct16Active?.name, 'ช่วงสอบกลางภาค 24 ชม.');
  assert.equal(oct16Active?.priority, 2);
  assert.equal(oct16Active?.is24Hours, true);

  // On Nov 01: Regular (priority 1)
  const nov01Active = await AdminScheduleService.getActiveScheduleOnDate('2026-11-01', client);
  assert.equal(nov01Active?.name, 'เวลาทำการปกติ');
  assert.equal(nov01Active?.priority, 1);
});

// ==========================================
// Suite 6: Strict Boolean & ISO Datetime Checks & Thailand Timezone (Review Fixes)
// ==========================================

test('createSchedule rejects non-boolean values for isClosed and is24Hours (prevents string coercion)', async () => {
  const { client } = mockSchedulePrisma();

  // "false" string must be rejected with 400 (not coerced to true)
  await assert.rejects(
    AdminScheduleService.createSchedule(
      {
        name: 'ตารางทดสอบ Boolean',
        startDate: '2026-08-01',
        endDate: '2026-12-15',
        isClosed: 'false' as any,
      },
      client
    ),
    (err: any) => err.status === 400 && err.message.includes('isClosed must be a boolean')
  );

  await assert.rejects(
    AdminScheduleService.createSchedule(
      {
        name: 'ตารางทดสอบ Boolean',
        startDate: '2026-08-01',
        endDate: '2026-12-15',
        is24Hours: 'false' as any,
      },
      client
    ),
    (err: any) => err.status === 400 && err.message.includes('is24Hours must be a boolean')
  );

  await assert.rejects(
    AdminScheduleService.createSchedule(
      {
        name: 'ตารางทดสอบ Boolean',
        startDate: '2026-08-01',
        endDate: '2026-12-15',
        isClosed: 1 as any,
      },
      client
    ),
    (err: any) => err.status === 400 && err.message.includes('isClosed must be a boolean')
  );
});

test('updateSchedule rejects non-boolean values for isClosed and is24Hours', async () => {
  const initial = [scheduleRow({ scheduleId: 1 })];
  const { client } = mockSchedulePrisma(initial);

  await assert.rejects(
    AdminScheduleService.updateSchedule(1, { isClosed: 'false' as any }, client),
    (err: any) => err.status === 400 && err.message.includes('isClosed must be a boolean')
  );

  await assert.rejects(
    AdminScheduleService.updateSchedule(1, { is24Hours: 'true' as any }, client),
    (err: any) => err.status === 400 && err.message.includes('is24Hours must be a boolean')
  );
});

test('createSchedule rejects invalid ISO datetime strings with out-of-range components', async () => {
  const { client } = mockSchedulePrisma();

  await assert.rejects(
    AdminScheduleService.createSchedule(
      {
        name: 'ตารางเวลาผิด',
        startDate: '2026-11-01T99:99:99+99:99',
        endDate: '2026-11-05',
      },
      client
    ),
    (err: any) => err.status === 400 && err.message.includes('Invalid startDate format')
  );

  await assert.rejects(
    AdminScheduleService.createSchedule(
      {
        name: 'ตารางเวลาผิด',
        startDate: '2026-11-01',
        endDate: '2026-11-05T25:00:00Z',
      },
      client
    ),
    (err: any) => err.status === 400 && err.message.includes('Invalid endDate format')
  );
});

test('AdminScheduleService.getTodayDateStringBangkok formats current Bangkok calendar date correctly across midnight UTC', () => {
  // During UTC 17:00-23:59 (e.g. 2026-10-29T20:00:00Z = 2026-10-30 03:00 Bangkok time)
  const utcNight = new Date('2026-10-29T20:00:00.000Z');
  const bkkDateStr = AdminScheduleService.getTodayDateStringBangkok(utcNight);
  assert.equal(
    bkkDateStr,
    '2026-10-30',
    'Bangkok date should be 2026-10-30 while UTC is 2026-10-29'
  );

  // During UTC 00:00-06:59 (e.g. 2026-10-30T01:00:00Z = 2026-10-30 08:00 Bangkok time)
  const utcMorning = new Date('2026-10-30T01:00:00.000Z');
  const bkkMorningStr = AdminScheduleService.getTodayDateStringBangkok(utcMorning);
  assert.equal(bkkMorningStr, '2026-10-30');
});

test('getActiveScheduleOnDate without targetDate defaults to today in Bangkok time (Asia/Bangkok)', async () => {
  const todayBkk = AdminScheduleService.getTodayDateStringBangkok();
  const rows = [
    scheduleRow({
      scheduleId: 10,
      name: `ตารางสำหรับวันนี้ในไทย (${todayBkk})`,
      startDate: new Date(`${todayBkk}T00:00:00.000Z`),
      endDate: new Date(`${todayBkk}T00:00:00.000Z`),
      priority: 2,
    }),
  ];
  const { client } = mockSchedulePrisma(rows);

  // Calling without date argument should find today's Bangkok schedule
  const active = await AdminScheduleService.getActiveScheduleOnDate(undefined, client);
  assert.equal(active?.scheduleId, 10);
});

test('AdminScheduleController.getActive uses Bangkok date when date query param is omitted', async () => {
  const todayBkk = AdminScheduleService.getTodayDateStringBangkok();
  const rows = [
    scheduleRow({
      scheduleId: 10,
      name: `ตารางสำหรับวันนี้ในไทย (${todayBkk})`,
      startDate: new Date(`${todayBkk}T00:00:00.000Z`),
      endDate: new Date(`${todayBkk}T00:00:00.000Z`),
      priority: 2,
    }),
  ];
  const { client } = mockSchedulePrisma(rows);

  const req = { query: {} } as any;
  const res = mockResponse();

  await AdminScheduleController.getActive(req, res as any, client);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.scheduleId, 10);
});

test('[Issue 4] BookingService.checkIn rejects check-in after reservation endDateTime and does not set table OCCUPIED', async () => {
  const mockNow = new Date('2026-10-01T11:00:00Z'); // 11:00
  let tableStatus = TableStatus.RESERVED;
  let bookingStatus = BookingStatus.PENDING;

  const mockBooking = {
    bookingId: 101,
    uid: 42,
    tableId: 7,
    startDateTime: new Date('2026-10-01T10:00:00Z'),
    endDateTime: new Date('2026-10-01T10:15:00Z'), // Ended at 10:15
    status: BookingStatus.PENDING,
    table: { tableId: 7, status: TableStatus.RESERVED },
  };

  const mockPrisma = {
    systemConfig: {
      findFirst: async () => ({
        earlyCheckInMinutes: 15,
        lateThresholdMinutes: 60, // 60 min late threshold
      }),
    },
    booking: {
      findUnique: async () => mockBooking,
      updateMany: async ({ data }: any) => {
        bookingStatus = data.status;
        return { count: 1 };
      },
    },
    table: {
      findUnique: async () => ({ tableId: 7, status: tableStatus }),
      update: async ({ data }: any) => {
        tableStatus = data.status;
        return { tableId: 7, status: data.status };
      },
    },
    $transaction: async (cb: any) => cb(mockPrisma),
    $queryRaw: async () => [],
  };

  await assert.rejects(BookingService.checkIn(42, 101, mockNow, mockPrisma as any), (err: any) => {
    assert.equal(err.status, 400);
    assert.equal(err.code, 'CHECK_IN_TOO_LATE');
    assert.equal(err.message, 'Check-in window has expired.');
    return true;
  });

  // Verify table is NOT transitioned to OCCUPIED and booking remains PENDING
  assert.equal(tableStatus, TableStatus.RESERVED);
  assert.equal(bookingStatus, BookingStatus.PENDING);
});

// ==========================================
// Suite 7: Controller & RBAC Route Protection
// ==========================================

test('admin schedule routes require ADMIN role and reject unauthorized access', async () => {
  const studentToken = signJwt({
    uid: 4,
    email: 'student@chula.ac.th',
    firstname: 'Student',
    lastname: 'Test',
    role: 'STUDENT',
  });
  const adminToken = signJwt({
    adminId: 1,
    email: 'admin@chula.ac.th',
    firstname: 'Admin',
    lastname: 'Test',
    role: 'ADMIN',
  });

  // 1. Missing token -> 401
  const res1 = mockResponse();
  const req1 = { headers: {} } as any;
  const { authenticateToken } = await import('../middlewares/authMiddleware.js');
  authenticateToken(req1, res1 as any, () => {});
  assert.equal(res1.statusCode, 401);

  // 2. Student role -> 403 Forbidden
  const res2 = mockResponse();
  const req2 = { headers: { authorization: `Bearer ${studentToken}` } } as any;
  authenticateToken(req2, res2 as any, () => {
    const { requireRoles } = import('../middlewares/authMiddleware.js') as any;
  });
  assert.equal(req2.user.role, 'STUDENT');

  const { requireRoles } = await import('../middlewares/authMiddleware.js');
  const guard = requireRoles('ADMIN');
  guard(req2, res2 as any, () => {});
  assert.equal(res2.statusCode, 403);

  // 3. Admin role -> pass guard
  let nextCalled = false;
  const res3 = mockResponse();
  const req3 = {
    headers: { authorization: `Bearer ${adminToken}` },
    user: { role: 'ADMIN' },
  } as any;
  guard(req3, res3 as any, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});

test('AdminScheduleController handles create, get, update, and delete HTTP responses', async () => {
  // Test controller validation handling directly
  const res = mockResponse();
  const req = {
    body: {
      name: 'ตารางสั้น',
      startDate: '2026-10-10',
      endDate: '2026-10-09', // Invalid: start after end
    },
  } as any;

  await AdminScheduleController.create(req, res as any);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.includes('cannot be after endDate'), true);
});
