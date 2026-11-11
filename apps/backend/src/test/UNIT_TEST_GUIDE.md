# Jest Unit Test Guide — `ScoreGuard.enforceMinScore` (US5-3)

เอกสารสรุปการทำ Unit Testing ตามโจทย์ **Project Demonstration ข้อที่ 3**:

> _"Test **one backend function** using test cases with a **unit testing tool (such as JEST)**, ensuring the function meets the **100% statement coverage** criterion."_

---

## 1. ฟังก์ชันที่เลือกทดสอบ

- **ฟังก์ชัน:** `ScoreGuard.enforceMinScore(uid, prisma, user?, policy?)`
- **ไฟล์เป้าหมาย:** `apps/backend/src/services/scoreGuard.ts`
- **ไฟล์ Unit Test:** `apps/backend/src/test/scoreGuard.unit.test.ts`
- **ไฟล์ตั้งค่า Jest:** `apps/backend/jest.config.cjs`
- **หน้าที่ของฟังก์ชัน:** ตรวจสอบคะแนนความประพฤติ (`behaviourScore`) ของผู้ใช้เทียบกับเกณฑ์ขั้นต่ำของระบบ (`minScoreToBook` ใน `SystemConfig`) ก่อนอนุญาตให้ล็อกโต๊ะหรือสร้างการจอง (US5-3)

---

## 2. วิธีการรัน Unit Test และดูตาราง Coverage 100%

### วิธีที่ 1: รันจาก Root ของโปรเจกต์ (`CULibSpace`)

```bash
npm run test:jest
```

### วิธีที่ 2: รันจากโฟลเดอร์ `apps/backend`

```bash
cd apps/backend
npm run test:jest
```

### วิธีที่ 3: เปิดดูรายงาน HTML Coverage แบบละเอียด (แสดงบรรทัดสีเขียวครบ 100%)

หลังจากรัน `npm run test:jest` แล้ว ระบบจะสร้างรายงาน HTML ไว้ที่:

```text
apps/backend/coverage/lcov-report/index.html
```

สามารถดับเบิลคลิกเปิดไฟล์นี้ในเบราว์เซอร์เพื่อโชว์อาจารย์ได้ว่าทุกบรรทัด (Statements, Branches, Functions, Lines) ถูกทดสอบครบ **100%**

---

## 3. รายละเอียด Test Cases ทั้ง 4 ข้อ (ครอบคลุม 100% Statement & Branch Coverage)

| รหัส      | ชื่อ Test Case                                                                                    | เทคนิคที่ใช้                                  | Input / Mock                                                                    | ผลลัพธ์ที่คาดหวัง (Expected Result)                                                       |
| :-------- | :------------------------------------------------------------------------------------------------ | :-------------------------------------------- | :------------------------------------------------------------------------------ | :---------------------------------------------------------------------------------------- |
| **TC-01** | ผู้ใช้มีคะแนนสูงกว่าเกณฑ์ขั้นต่ำ (`75 >= 50`)                                                     | Equivalence Partitioning (Valid) + DB Mocking | `uid = 101`, Mock DB คืนค่า `minScoreToBook = 50`, `behaviourScore = 75`        | ผ่านการตรวจสอบ (`resolves.toBeUndefined()`) และเรียก `prisma.user.findUnique` ถูกต้อง     |
| **TC-02** | ผู้ใช้มีคะแนนเท่ากับเกณฑ์ขั้นต่ำพอดี (`50 == 50`) พร้อมส่งข้อมูล `user` และ `policy` ที่ดึงมาแล้ว | Boundary Value Analysis (On-Boundary)         | `uid = 102`, `user = { behaviourScore: 50 }`, `policy = { minScoreToBook: 50 }` | ผ่านการตรวจสอบโดยไม่ต้อง Query DB ซ้ำ (`resolves.toBeUndefined()`)                        |
| **TC-03** | ผู้ใช้มีคะแนนต่ำกว่าเกณฑ์ขั้นต่ำ (`49 < 50`)                                                      | Boundary Value Analysis (Below-Boundary)      | `uid = 103`, Mock DB คืนค่า `minScoreToBook = 50`, `behaviourScore = 49`        | โยน Error `403 INSUFFICIENT_BEHAVIOUR_SCORE` พร้อมข้อความแจ้งคะแนนปัจจุบันและเกณฑ์ขั้นต่ำ |
| **TC-04** | ไม่พบข้อมูลผู้ใช้ในฐานข้อมูล (`null`)                                                             | Error / Exception Handling                    | `uid = 999`, Mock DB คืนค่า `user = null`                                       | โยน Error `404 USER_NOT_FOUND` (`User 999 not found`)                                     |

---

## 4. ผลลัพธ์ Coverage ที่ได้จากการรัน

```text
 PASS  src/test/scoreGuard.unit.test.ts
  Unit Test: ScoreGuard.enforceMinScore (US5-3)
    ✓ TC-01: should allow reservation when fetched user score is above minScoreToBook (75 >= 50)
    ✓ TC-02: should allow reservation when pre-fetched user score is at boundary threshold (50 == 50)
    ✓ TC-03: should throw 403 INSUFFICIENT_BEHAVIOUR_SCORE when user score is below minScoreToBook (49 < 50)
    ✓ TC-04: should throw 404 USER_NOT_FOUND when user ID does not exist in database

---------------|---------|----------|---------|---------|-------------------
File           | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
---------------|---------|----------|---------|---------|-------------------
All files      |     100 |      100 |     100 |     100 |
 scoreGuard.ts |     100 |      100 |     100 |     100 |
---------------|---------|----------|---------|---------|-------------------
Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
```
