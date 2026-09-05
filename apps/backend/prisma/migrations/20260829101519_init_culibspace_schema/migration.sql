-- CreateEnum
CREATE TYPE "user_type_enum" AS ENUM ('UNIVERSITY', 'THAI', 'FOREIGN');

-- CreateEnum
CREATE TYPE "table_status_enum" AS ENUM ('Available', 'Reserved', 'Occupied', 'Closed');

-- CreateEnum
CREATE TYPE "booking_status_enum" AS ENUM ('Pending', 'Active', 'Completed', 'Cancelled', 'No-show');

-- CreateEnum
CREATE TYPE "ticket_status_enum" AS ENUM ('Paid', 'Unpaid');

-- CreateEnum
CREATE TYPE "zone_type_enum" AS ENUM ('Silent', 'Group', 'Common');

-- CreateTable
CREATE TABLE "user" (
    "uid" SERIAL NOT NULL,
    "phone" VARCHAR(10) NOT NULL,
    "behaviour_score" DECIMAL(4,1) NOT NULL DEFAULT 100.0,
    "email" VARCHAR(100) NOT NULL,
    "firstname" VARCHAR(50) NOT NULL,
    "lastname" VARCHAR(50) NOT NULL,
    "user_type" "user_type_enum" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "university_user" (
    "uid" INTEGER NOT NULL,
    "studentid" VARCHAR(10) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "university_user_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "outside_user" (
    "uid" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outside_user_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "thai_user" (
    "uid" INTEGER NOT NULL,
    "citizenid" VARCHAR(13) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "thai_user_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "foreign_user" (
    "uid" INTEGER NOT NULL,
    "passportid" VARCHAR(9) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "foreign_user_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "admin" (
    "adminid" SERIAL NOT NULL,
    "email" VARCHAR(100) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "firstname" VARCHAR(50) NOT NULL,
    "lastname" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_pkey" PRIMARY KEY ("adminid")
);

-- CreateTable
CREATE TABLE "zone" (
    "zoneid" SERIAL NOT NULL,
    "zone_type" "zone_type_enum" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zone_pkey" PRIMARY KEY ("zoneid")
);

-- CreateTable
CREATE TABLE "table" (
    "tableid" SERIAL NOT NULL,
    "zoneid" INTEGER NOT NULL,
    "status" "table_status_enum" NOT NULL DEFAULT 'Available',
    "number_of_seat" INTEGER NOT NULL,
    "plug_cap" INTEGER,
    "has_tv_screen" BOOLEAN NOT NULL DEFAULT false,
    "lock_token" TEXT,
    "locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "table_pkey" PRIMARY KEY ("tableid")
);

-- CreateTable
CREATE TABLE "booking" (
    "bookingid" SERIAL NOT NULL,
    "uid" INTEGER NOT NULL,
    "tableid" INTEGER NOT NULL,
    "startdatetime" TIMESTAMP(3) NOT NULL,
    "enddatetime" TIMESTAMP(3) NOT NULL,
    "arrive_time" TIMESTAMP(3),
    "status" "booking_status_enum" NOT NULL DEFAULT 'Pending',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_pkey" PRIMARY KEY ("bookingid")
);

-- CreateTable
CREATE TABLE "ticket" (
    "ticketid" SERIAL NOT NULL,
    "uid" INTEGER NOT NULL,
    "payment_detail" VARCHAR(255),
    "status" "ticket_status_enum" NOT NULL DEFAULT 'Unpaid',
    "startdatetime" TIMESTAMP(3) NOT NULL,
    "enddatetime" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_pkey" PRIMARY KEY ("ticketid")
);

-- CreateTable
CREATE TABLE "issue_report" (
    "issueid" SERIAL NOT NULL,
    "uid" INTEGER NOT NULL,
    "time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tableid" INTEGER NOT NULL,
    "issue_information" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issue_report_pkey" PRIMARY KEY ("issueid")
);

-- CreateTable
CREATE TABLE "manage_issue" (
    "issueid" INTEGER NOT NULL,
    "adminid" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "info" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manage_issue_pkey" PRIMARY KEY ("issueid","adminid","timestamp")
);

-- CreateTable
CREATE TABLE "manage_score" (
    "uid" INTEGER NOT NULL,
    "adminid" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "score_change" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manage_score_pkey" PRIMARY KEY ("uid","adminid","timestamp")
);

-- CreateTable
CREATE TABLE "operating_schedule" (
    "schedule_id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "open_time" VARCHAR(5) NOT NULL DEFAULT '08:00',
    "close_time" VARCHAR(5) NOT NULL DEFAULT '21:00',
    "is_24h" BOOLEAN NOT NULL DEFAULT false,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operating_schedule_pkey" PRIMARY KEY ("schedule_id")
);

-- CreateTable
CREATE TABLE "system_config" (
    "configid" SERIAL NOT NULL,
    "max_booking_duration_minutes" INTEGER NOT NULL DEFAULT 120,
    "late_threshold_minutes" INTEGER NOT NULL DEFAULT 15,
    "early_checkin_minutes" INTEGER NOT NULL DEFAULT 15,
    "min_score_to_book" DECIMAL(4,1) NOT NULL DEFAULT 50.0,
    "max_advance_booking_days" INTEGER NOT NULL DEFAULT 7,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("configid")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_phone_key" ON "user"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "idx_user_name_search" ON "user"("firstname", "lastname");

-- CreateIndex
CREATE INDEX "idx_user_type" ON "user"("user_type");

-- CreateIndex
CREATE UNIQUE INDEX "university_user_studentid_key" ON "university_user"("studentid");

-- CreateIndex
CREATE UNIQUE INDEX "thai_citizenid_key" ON "thai_user"("citizenid");

-- CreateIndex
CREATE UNIQUE INDEX "foreign_user_passportid_key" ON "foreign_user"("passportid");

-- CreateIndex
CREATE UNIQUE INDEX "admin_email_key" ON "admin"("email");

-- CreateIndex
CREATE INDEX "idx_table_zone_status" ON "table"("zoneid", "status");

-- CreateIndex
CREATE INDEX "idx_table_amenity_filter" ON "table"("status", "plug_cap", "has_tv_screen");

-- CreateIndex
CREATE INDEX "idx_table_locked_until" ON "table"("locked_until");

-- CreateIndex
CREATE INDEX "idx_booking_table_overlap" ON "booking"("tableid", "status", "startdatetime", "enddatetime");

-- CreateIndex
CREATE INDEX "idx_booking_user_overlap" ON "booking"("uid", "status", "startdatetime", "enddatetime");

-- CreateIndex
CREATE INDEX "idx_booking_user_history" ON "booking"("uid", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "idx_booking_noshow_worker" ON "booking"("status", "startdatetime");

-- CreateIndex
CREATE INDEX "idx_ticket_active_coverage" ON "ticket"("uid", "status", "startdatetime", "enddatetime");

-- CreateIndex
CREATE INDEX "idx_issue_table" ON "issue_report"("tableid");

-- CreateIndex
CREATE INDEX "idx_issue_user" ON "issue_report"("uid");

-- CreateIndex
CREATE INDEX "idx_schedule_lookup" ON "operating_schedule"("start_date", "end_date", "priority");

-- AddForeignKey
ALTER TABLE "university_user" ADD CONSTRAINT "university_user_uid_fkey" FOREIGN KEY ("uid") REFERENCES "user"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outside_user" ADD CONSTRAINT "outside_user_uid_fkey" FOREIGN KEY ("uid") REFERENCES "user"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thai_user" ADD CONSTRAINT "thai_uid_fkey" FOREIGN KEY ("uid") REFERENCES "outside_user"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foreign_user" ADD CONSTRAINT "foreign_user_uid_fkey" FOREIGN KEY ("uid") REFERENCES "outside_user"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table" ADD CONSTRAINT "table_zoneid_fkey" FOREIGN KEY ("zoneid") REFERENCES "zone"("zoneid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_uid_fkey" FOREIGN KEY ("uid") REFERENCES "user"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_tableid_fkey" FOREIGN KEY ("tableid") REFERENCES "table"("tableid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_uid_fkey" FOREIGN KEY ("uid") REFERENCES "outside_user"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_report" ADD CONSTRAINT "issue_report_uid_fkey" FOREIGN KEY ("uid") REFERENCES "user"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_report" ADD CONSTRAINT "issue_report_tableid_fkey" FOREIGN KEY ("tableid") REFERENCES "table"("tableid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manage_issue" ADD CONSTRAINT "manage_issue_issueid_fkey" FOREIGN KEY ("issueid") REFERENCES "issue_report"("issueid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manage_issue" ADD CONSTRAINT "manage_issue_adminid_fkey" FOREIGN KEY ("adminid") REFERENCES "admin"("adminid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manage_score" ADD CONSTRAINT "manage_score_uid_fkey" FOREIGN KEY ("uid") REFERENCES "user"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manage_score" ADD CONSTRAINT "manage_score_adminid_fkey" FOREIGN KEY ("adminid") REFERENCES "admin"("adminid") ON DELETE RESTRICT ON UPDATE CASCADE;
