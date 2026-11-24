import { NextResponse } from "next/server";
import { hasClaude, hasExa, modelName, provider } from "@/lib/ai";

export async function GET() {
  return NextResponse.json({ exa: hasExa(), claude: hasClaude(), provider: provider(), model: modelName() });
}
