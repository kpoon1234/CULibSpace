-- AlterTable
ALTER TABLE "user" ADD COLUMN     "is_profile_complete" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "phone" DROP NOT NULL;

-- RenameForeignKey
ALTER TABLE "thai_user" RENAME CONSTRAINT "thai_uid_fkey" TO "thai_user_uid_fkey";

-- RenameIndex
ALTER INDEX "thai_citizenid_key" RENAME TO "thai_user_citizenid_key";
