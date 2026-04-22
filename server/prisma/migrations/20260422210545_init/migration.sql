/*
  Warnings:

  - You are about to drop the column `transports` on the `Authenticator` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN "otp" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Authenticator" (
    "credentialID" BLOB NOT NULL,
    "credentialPublicKey" BLOB NOT NULL,
    "counter" BIGINT NOT NULL,
    "credentialDeviceType" TEXT NOT NULL,
    "credentialBackedUp" BOOLEAN NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "Authenticator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Authenticator" ("counter", "credentialBackedUp", "credentialDeviceType", "credentialID", "credentialPublicKey", "userId") SELECT "counter", "credentialBackedUp", "credentialDeviceType", "credentialID", "credentialPublicKey", "userId" FROM "Authenticator";
DROP TABLE "Authenticator";
ALTER TABLE "new_Authenticator" RENAME TO "Authenticator";
CREATE UNIQUE INDEX "Authenticator_credentialID_key" ON "Authenticator"("credentialID");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
