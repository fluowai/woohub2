import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isMegaAdmin } from "@/lib/api-auth";
import { updateLicense, revokeLicense, suspendLicense, activateLicense, getLicense } from "@/lib/license";
import { z } from "zod";

const updateLicenseSchema = z.object({
  status: z.enum(["ACTIVE", "EXPIRED", "SUSPENDED", "REVOKED", "PENDING"]).optional(),
  type: z.enum(["TRIAL", "STANDARD", "PROFESSIONAL", "ENTERPRISE", "RESELLER"]).optional(),
  issuedTo: z.string().min(2).optional(),
  issuedToEmail: z.string().email().optional(),
  maxInstances: z.number().int().positive().optional(),
  maxTenants: z.number().int().positive().optional(),
  maxUsers: z.number().int().positive().optional(),
  maxResellers: z.number().int().nonnegative().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  features: z.array(z.string()).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser(request);

  if (!user || !isMegaAdmin(user.role)) {
    return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const license = await prisma.license.findUnique({
      where: { id },
      include: {
        validations: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
        _count: { select: { validations: true } },
      },
    });

    if (!license) {
      return NextResponse.json({ status: false, message: "License not found", error: "License not found" }, { status: 404 });
    }

    return NextResponse.json({ status: true, message: "License fetched", data: license });
  } catch (error) {
    console.error("Fetch license error:", error);
    return NextResponse.json({ status: false, message: "Failed to fetch license", error: "Failed to fetch license" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser(request);

  if (!user || !isMegaAdmin(user.role)) {
    return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const parseResult = updateLicenseSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json({ status: false, message: "Validation error", error: parseResult.error.flatten() }, { status: 400 });
    }

    const license = await prisma.license.findUnique({ where: { id } });
    if (!license) {
      return NextResponse.json({ status: false, message: "License not found", error: "License not found" }, { status: 404 });
    }

    const updateData: any = { ...parseResult.data };
    if (updateData.expiresAt) updateData.expiresAt = new Date(updateData.expiresAt);

    const updatedLicense = await updateLicense(license.licenseKey, updateData);

    return NextResponse.json({ status: true, message: "License updated successfully", data: updatedLicense });
  } catch (error) {
    console.error("Update license error:", error);
    return NextResponse.json({ status: false, message: "Failed to update license", error: "Failed to update license" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser(request);

  if (!user || !isMegaAdmin(user.role)) {
    return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const license = await prisma.license.findUnique({ where: { id } });
    if (!license) {
      return NextResponse.json({ status: false, message: "License not found", error: "License not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const reason = searchParams.get("reason") || "Deleted by admin";

    await revokeLicense(license.licenseKey, reason);

    return NextResponse.json({ status: true, message: "License revoked successfully" });
  } catch (error) {
    console.error("Delete license error:", error);
    return NextResponse.json({ status: false, message: "Failed to revoke license", error: "Failed to revoke license" }, { status: 500 });
  }
}