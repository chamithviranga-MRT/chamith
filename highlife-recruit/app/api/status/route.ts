import { NextResponse } from "next/server";
import { hasClaude, hasExa, MODEL } from "@/lib/ai";

export async function GET() {
  return NextResponse.json({ exa: hasExa(), claude: hasClaude(), model: MODEL });
}
