import { prisma } from "../src/lib/prisma";

/**
 * Migration & seeding script for Commercial Hierarchy in Woohub.
 * 
 * Rules:
 * - MEGA_ADMIN is the global platform owner.
 * - SUPERADMIN / SUPER_ADMIN users become white label Resellers (owning a Reseller entity & Branding).
 * - Existing direct clients of Mega Admin remain direct clients (tenant.resellerId = null).
 * - Creates default PlatformConfig if not present.
 */
export async function migrateCommercialHierarchy() {
    console.log("==> Starting commercial hierarchy migration...");

    // 1. Ensure PlatformConfig exists
    const platformConfig = await prisma.platformConfig.upsert({
        where: { id: "default" },
        update: {},
        create: {
            id: "default",
            platformName: "Woohub",
            primaryDomain: "woohub.local",
            supportEmail: "suporte@woohub.local",
            enableRegistration: true,
            maxResellers: 100,
            defaultFeatures: {
                chat: true,
                broadcast: true,
                webhooks: true,
                bot: true,
                scheduler: true,
                customDomain: true,
            }
        }
    });
    console.log("PlatformConfig checked:", platformConfig.platformName);

    // 2. Identify existing SUPERADMIN / SUPER_ADMIN users
    const superAdmins = await prisma.user.findMany({
        where: {
            role: { in: ["SUPERADMIN", "SUPER_ADMIN"] }
        }
    });
    console.log(`Found ${superAdmins.length} Super Admin(s)`);

    for (const sa of superAdmins) {
        // Check if reseller exists
        let reseller = await prisma.reseller.findFirst({
            where: { ownerId: sa.id }
        });

        if (!reseller) {
            const baseSlug = (sa.email.split("@")[0] || "revenda")
                .toLowerCase()
                .replace(/[^a-z0-9]/g, "-")
                .slice(0, 30);
            const slug = `${baseSlug}-${sa.id.slice(-4)}`;

            reseller = await prisma.reseller.create({
                data: {
                    name: sa.name ? `Operação ${sa.name}` : `Revenda ${baseSlug}`,
                    slug,
                    ownerId: sa.id,
                    status: "ACTIVE",
                    maxInstances: 30,
                    maxTenants: 20,
                    maxUsers: 50,
                    customDomainAllowed: true,
                    features: {
                        chat: true,
                        broadcast: true,
                        webhooks: true,
                        bot: true,
                        scheduler: true,
                        customDomain: true,
                    },
                    branding: {
                        create: {
                            name: sa.name || `Revenda ${baseSlug}`,
                            primaryColor: "#ff5a00",
                            secondaryColor: "#0f172a",
                            accentColor: "#f97316",
                            supportEmail: sa.email,
                            docBrandName: sa.name || "Woohub Partner"
                        }
                    }
                }
            });
            console.log(`Created Reseller ${reseller.name} (${reseller.slug}) for user ${sa.email}`);
        } else {
            console.log(`Reseller already exists for ${sa.email}: ${reseller.name}`);
        }
    }

    // 3. Check direct tenants of Mega Admin
    const directTenants = await prisma.tenant.findMany({
        where: { resellerId: null }
    });
    console.log(`Direct Mega Admin tenants count: ${directTenants.length}`);

    console.log("==> Commercial hierarchy migration finished successfully.");
}

if (require.main === module || process.argv[1]?.endsWith("migrate-commercial-hierarchy.ts")) {
    migrateCommercialHierarchy()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error("Migration error:", err);
            process.exit(1);
        });
}
