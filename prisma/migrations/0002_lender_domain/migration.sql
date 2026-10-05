-- AlterTable
ALTER TABLE "Lender" DROP COLUMN "group",
DROP COLUMN "homepage",
DROP COLUMN "seedUrls",
ADD COLUMN     "domain" TEXT,
ADD COLUMN     "groups" TEXT[],
ADD COLUMN     "hints" TEXT[],
ADD COLUMN     "searchQuery" TEXT;

