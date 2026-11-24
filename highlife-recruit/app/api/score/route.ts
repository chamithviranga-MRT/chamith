import { NextResponse } from "next/server";
import type { Role, SourcedProfile } from "@/lib/types";
import { scoreProfile } from "@/lib/scoring";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { role, profile } = (await req.json()) as { role: Role; profile: SourcedProfile };
  return NextResponse.json(await scoreProfile(role, profile));
}
