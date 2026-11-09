import 'dotenv/config';
import { createApp } from './app.js';
import { LockService } from './services/lockService.js';
import { NoShowService } from './services/noShowService.js';
import { BookingService } from './services/bookingService.js';

const app = createApp();
const PORT = process.env.PORT || 8080;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

app.listen(PORT, () => {
  console.log(`🚀 Backend running on ${BASE_URL}`);

  // 2. สั่งเริ่มการทำงานของ Lock Expiration Worker
  LockService.startExpirationWorker();

  // 3. สั่งเริ่มการทำงานของ No-show Detection Cron Worker (ทุก 1 นาที)
  NoShowService.startNoShowWorker();

  // 4. สั่งเริ่มการทำงานของ Booking Completion Worker (ทุก 30 วินาที เมื่อหมดเวลาจอง เปลี่ยน ACTIVE -> COMPLETED และคืนโต๊ะ)
  BookingService.startCompletionWorker();
});
