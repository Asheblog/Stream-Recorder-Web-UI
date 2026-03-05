import prisma, { DEFAULT_SETTINGS } from '../src/server/db.js';

async function seed() {
    console.log('🌱 Seeding database...');

    for (const setting of DEFAULT_SETTINGS) {
        await prisma.systemSetting.upsert({
            where: { key: setting.key },
            update: {},
            create: setting,
        });
    }

    console.log('✓ Default system settings created');
    console.log('🌱 Seeding complete');
}

seed()
    .catch((e) => {
        console.error('Seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
