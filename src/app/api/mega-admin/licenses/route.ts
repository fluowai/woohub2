import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isMegaAdmin } from "@/lib/api-auth";
import { createLicense, listLicenses, getLicenseStats } from "@/lib/license";
import { z } from "zod";

const createLicenseSchema = z.object({
  type: z.enum(["TRIAL", "STANDARD", "PROFESSIONAL", "ENTERPRISE", "RESELLER"]).default("TRIAL"),
  issuedTo: z.string().min(2),
  issuedToEmail: z.string().email(),
  maxInstances: z.number().int().positive().optional(),
  maxTenants: z.number().int().positive().optional(),
  maxUsers: z.number().int().positive().optional(),
  maxResellers: z.number().int().nonnegative().optional(),
  expiresAt: z.string().datetime().optional().nullable(),
  features: z.array(z.string()).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);

  if (!user || !isMegaAdmin(user.role)) {
    return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const status = searchParams.get("status");
  const type = searchParams.get("type");
  const stats = searchParams.get("stats") === "true";

  const skip = (page - 1) * limit;

  try {
    if (stats) {
      const statistics = await getLicenseStats();
      return NextResponse.json({ status: true, message: "Stats fetched", data: statistics });
    }

    const where: any = {};
    if (status) where.status = status;
    if (type) where.type = type;

    const [licenses, total] = await Promise.all([
      prisma.license.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          _count: { select: { validations: true } },
        },
      }),
      prisma.license.count({ where }),
    ]);

    return NextResponse.json({
      status: true,
      message: "Licenses fetched successfully",
      data: licenses,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Fetch licenses error:", error);
    return NextResponse.json({ status: false, message: "Failed to fetch licenses", error: "Failed to fetch licenses" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);

  if (!user || !isMegaAdmin(user.role)) {
    return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parseResult = createLicenseSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json({ status: false, message: "Validation error", error: parseResult.error.flatten() }, { status: 400 });
    }

    const license = await createLicense(parseResult.data);

    return NextResponse.json({ status: true, message: "License created successfully", data: license }, { status: 201 });

  } catch (error) {
    console.error("Create license error:", error);
    return NextResponse.json({ status: false, message: "Failed to create license", error: "Failed to create license" }, { status: 500 });
  }
}