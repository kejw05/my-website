#!/usr/bin/env tsx
/**
 * Migration script: Upload photos to R2 and insert data into D1
 * 
 * This script:
 * 1. Uploads all photos from public/travel-map/ to R2
 * 2. Inserts destination and photo metadata into D1
 * 3. Verifies the migration
 * 
 * Prerequisites:
 * - Wrangler CLI installed and authenticated
 * - R2 bucket created (wrangler r2 bucket create my-website-photos)
 * - D1 database created and migrated
 * 
 * Usage:
 *   tsx scripts/migrate-to-d1-r2.ts --env production
 *   tsx scripts/migrate-to-d1-r2.ts --env local --dry-run
 */

import { readdirSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as readline from 'readline';

const execAsync = promisify(exec);

// ============================================================================
// Configuration
// ============================================================================

interface MigrationOptions {
  env: 'local' | 'production';
  dryRun: boolean;
  skipR2: boolean;
  skipD1: boolean;
}

const DEFAULT_OPTIONS: MigrationOptions = {
  env: 'local',
  dryRun: false,
  skipR2: false,
  skipD1: false,
};

// Configuration from environment or defaults
const CONFIG = {
  local: {
    bucketName: process.env.R2_BUCKET_LOCAL || 'my-website-photos',
    dbName: process.env.DB_NAME_LOCAL || 'my-website-db'
  },
  production: {
    bucketName: process.env.R2_BUCKET_PROD || 'my-website-photos',
    dbName: process.env.DB_NAME_PROD || 'my-website-db'
  }
};

// ============================================================================
// Travel Data (inline to avoid Vite imports)
// ============================================================================

interface TravelPlace {
  id: string;
  name: string;
  description: string;
  lat: number;
  lng: number;
  continent: string;
  year: number;
  photos: string[];
}

const travelPlaces: TravelPlace[] = [
  {
    id: 'iceland',
    name: 'Iceland',
    description: 'Land of fire and ice — volcanic landscapes, glaciers, waterfalls, and endless horizons from the drone.',
    lat: 64.75,
    lng: -17.84,
    continent: 'Europe',
    year: 2019,
    photos: ['DJI_0006', 'DJI_0027', 'DJI_0036'],
  },
  {
    id: 'canadian-rockies',
    name: 'Canadian Rockies',
    description: 'Turquoise lakes, towering peaks, and pristine wilderness across British Columbia and Alberta.',
    lat: 52.24,
    lng: -118.62,
    continent: 'North America',
    year: 2019,
    photos: ['DJI_0018', 'DJI_0022', 'DJI_0070', 'DJI_0090', 'DJI_0092', 'DJI_0111', 'DJI_0125', 'DJI_0140'],
  },
  {
    id: 'malaysia',
    name: 'Malaysia',
    description: 'Tropical beaches, Kuala Lumpur skyline, and lush jungles of Southeast Asia.',
    lat: 4.31,
    lng: 100.99,
    continent: 'Asia',
    year: 2020,
    photos: ['DJI_0022 2', 'DJI_0029'],
  },
  {
    id: 'bali',
    name: 'Bali',
    description: 'Rice terraces, temple ceremonies, dramatic cliffs, and endless sunsets over the Indian Ocean.',
    lat: -8.47,
    lng: 115.27,
    continent: 'Asia',
    year: 2022,
    photos: ['DJI_0049', 'DJI_0055', 'DJI_0118', 'DJI_0149', 'DJI_0171'],
  },
  {
    id: 'yosemite',
    name: 'Yosemite',
    description: "Granite cliffs, giant sequoias, and the breathtaking valley views of California's crown jewel.",
    lat: 37.77,
    lng: -119.81,
    continent: 'North America',
    year: 2022,
    photos: ['DJI_0154', 'DJI_0160'],
  },
  {
    id: 'silicon-valley',
    name: 'Silicon Valley',
    description: 'The tech capital of the world — aerial views over San Jose and the Bay Area.',
    lat: 37.34,
    lng: -122.01,
    continent: 'North America',
    year: 2022,
    photos: ['DJI_0169', 'DJI_0179', 'DJI_0182'],
  },
  {
    id: 'mexican-caribbean',
    name: 'Mexican Caribbean',
    description: 'Turquoise waters, ancient Mayan ruins, cenotes, and white sand beaches along the Riviera Maya.',
    lat: 20.80,
    lng: -87.19,
    continent: 'North America',
    year: 2023,
    photos: ['DJI_0194', 'DJI_0203', 'DJI_0216', 'DJI_0258', 'DJI_0265', 'DJI_0271', 'DJI_0274', 'DJI_0275', 'DJI_0346', 'DJI_0361'],
  },
  {
    id: 'yucatan',
    name: 'Yucatán',
    description: 'Pink flamingo lagoons, Mayan pyramids, and colorful colonial towns deep in the Mexican interior.',
    lat: 20.58,
    lng: -89.35,
    continent: 'North America',
    year: 2023,
    photos: ['DJI_0327', 'DJI_0336', 'DJI_0495', 'DJI_0500', 'DJI_0503', 'DJI_0521'],
  },
  {
    id: 'guatemala',
    name: 'Guatemala',
    description: 'Volcanoes, misty highlands, Lake Atitlán, and the ancient ruins of Tikal from above.',
    lat: 14.99,
    lng: -90.21,
    continent: 'North America',
    year: 2023,
    photos: ['DJI_0539', 'DJI_0559', 'DJI_0573'],
  },
  {
    id: 'ecuador',
    name: 'Ecuador',
    description: 'The equator line, Andean highlands, cloud forests, and the diversity of a tiny, mighty country.',
    lat: -0.25,
    lng: -78.38,
    continent: 'South America',
    year: 2024,
    photos: ['DJI_0596', 'DJI_0607', 'DJI_0610', 'DJI_0635'],
  },
  {
    id: 'colombia',
    name: 'Colombia',
    description: 'Caribbean coastline, colonial Cartagena, lush coffee country, and vibrant cities from the sky.',
    lat: 8.73,
    lng: -74.55,
    continent: 'South America',
    year: 2024,
    photos: ['DJI_0659', 'DJI_0701', 'DJI_0712', 'DJI_0753', 'DJI_0766', 'DJI_0802', 'DJI_0815', 'DJI_0818', 'DJI_0859'],
  },
  {
    id: 'costa-rica',
    name: 'Costa Rica',
    description: 'Pura vida — rainforests, volcanoes, wild coastlines, and incredible biodiversity.',
    lat: 9.30,
    lng: -84.16,
    continent: 'North America',
    year: 2024,
    photos: ['DJI_0805', 'DJI_0817', 'DJI_0849', 'DJI_0881'],
  },
  {
    id: 'panama',
    name: 'Panama',
    description: 'Where two oceans meet — tropical islands, misty highlands, and the famous canal from above.',
    lat: 9.63,
    lng: -82.67,
    continent: 'North America',
    year: 2024,
    photos: ['DJI_0768', 'DJI_0776'],
  },
];

const HAS_BLUR = new Set([
  'DJI_0006', 'DJI_0018', 'DJI_0022', 'DJI_0022 2', 'DJI_0027', 'DJI_0029',
  'DJI_0036', 'DJI_0049', 'DJI_0055', 'DJI_0070', 'DJI_0090', 'DJI_0092',
  'DJI_0111', 'DJI_0118', 'DJI_0125', 'DJI_0140', 'DJI_0149', 'DJI_0154',
  'DJI_0160', 'DJI_0169', 'DJI_0171', 'DJI_0179', 'DJI_0182', 'DJI_0194',
  'DJI_0203', 'DJI_0216', 'DJI_0258', 'DJI_0265', 'DJI_0271', 'DJI_0274',
  'DJI_0275', 'DJI_0327', 'DJI_0336', 'DJI_0346', 'DJI_0361', 'DJI_0495',
  'DJI_0500', 'DJI_0503', 'DJI_0521', 'DJI_0539', 'DJI_0559',
]);

// ============================================================================
// Helpers
// ============================================================================

function log(message: string, level: 'info' | 'success' | 'warn' | 'error' = 'info') {
  const colors = {
    info: '\x1b[36m',    // Cyan
    success: '\x1b[32m', // Green
    warn: '\x1b[33m',    // Yellow
    error: '\x1b[31m',   // Red
  };
  const reset = '\x1b[0m';
  console.log(`${colors[level]}${message}${reset}`);
}

async function execCommand(command: string, dryRun: boolean): Promise<string> {
  if (dryRun) {
    log(`[DRY RUN] ${command}`, 'warn');
    return '';
  }
  
  try {
    const { stdout, stderr } = await execAsync(command);
    if (stderr && !stderr.includes('Uploading')) {
      log(stderr, 'warn');
    }
    return stdout;
  } catch (error) {
    throw new Error(`Command failed: ${command}\n${error}`);
  }
}

async function askConfirmation(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// R2 Upload
// ============================================================================

async function uploadPhotosToR2(options: MigrationOptions) {
  log('\n📦 Starting R2 upload...', 'info');
  
  const photosDir = join(process.cwd(), 'public', 'travel-map');
  const bucketName = CONFIG[options.env].bucketName;
  
  try {
    const files = readdirSync(photosDir).filter(f => f.endsWith('.webp'));
    log(`Found ${files.length} photos to upload`, 'info');
    
    let uploaded = 0;
    let failed = 0;
    
    // Rate limiting: upload in batches with delays
    const BATCH_SIZE = 10;
    const DELAY_MS = 1000;
    
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      
      const uploadPromises = batch.map(async (file) => {
        const filePath = join(photosDir, file);
        const r2Key = file; // Simple filename as R2 key
        
        const stats = statSync(filePath);
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
        
        try {
          if (options.dryRun) {
            log(`[DRY RUN] Would upload: ${file} (${sizeMB} MB) → r2://${bucketName}/${r2Key}`, 'warn');
            return true;
          } else {
            // Use wrangler r2 object put
            const command = `wrangler r2 object put "${bucketName}/${r2Key}" --file="${filePath}" ${options.env === 'production' ? '--remote' : '--local'}`;
            await execCommand(command, false);
            log(`✓ Uploaded: ${file} (${sizeMB} MB)`, 'success');
            return true;
          }
        } catch (error) {
          log(`✗ Failed to upload ${file}: ${error}`, 'error');
          return false;
        }
      });
      
      const results = await Promise.all(uploadPromises);
      uploaded += results.filter(r => r).length;
      failed += results.filter(r => !r).length;
      
      // Add delay between batches (except for the last batch)
      if (i + BATCH_SIZE < files.length && !options.dryRun) {
        await sleep(DELAY_MS);
      }
    }
    
    log(`\n✓ R2 upload complete: ${uploaded} uploaded, ${failed} failed`, 'success');
  } catch (error) {
    log(`✗ R2 upload failed: ${error}`, 'error');
    throw error;
  }
}

// ============================================================================
// D1 Data Insert (with parameterized queries and transactions)
// ============================================================================

async function insertDataToD1(options: MigrationOptions) {
  log('\n💾 Starting D1 data insertion...', 'info');
  
  const dbName = CONFIG[options.env].dbName;
  
  try {
    // Generate SQL statements using parameterized queries
    const statements: Array<{ sql: string; params: (string | number | null)[] }> = [];
    
    // Clear existing data
    statements.push({ sql: 'DELETE FROM photos', params: [] });
    statements.push({ sql: 'DELETE FROM destinations', params: [] });
    
    // Insert destinations
    log(`Preparing ${travelPlaces.length} destinations...`, 'info');
    travelPlaces.forEach((place) => {
      statements.push({
        sql: 'INSERT INTO destinations (id, name_en, name_cs, description_en, description_cs, lat, lng, continent, visited_at_year) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        params: [
          place.id,
          place.name,
          place.name, // name_cs = name_en (placeholder)
          place.description,
          place.description, // description_cs (placeholder)
          place.lat,
          place.lng,
          place.continent,
          place.year,
        ]
      });
    });
    
    // Insert photos
    let photoCount = 0;
    travelPlaces.forEach((place) => {
      place.photos.forEach((photoId, index) => {
        const fullUrl = `${photoId}.webp`;
        const thumbUrl = `${photoId}-thumb.webp`;
        const blurUrl = HAS_BLUR.has(photoId) ? `${photoId}-blur.webp` : null;
        
        statements.push({
          sql: 'INSERT INTO photos (id, destination_id, full_url, thumb_url, blur_url, caption_en, caption_cs, sort_order, is_visible) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          params: [
            `${place.id}-${photoId}`,
            place.id,
            fullUrl,
            thumbUrl,
            blurUrl,
            null, // caption_en
            null, // caption_cs
            index,
            1, // is_visible
          ]
        });
        photoCount++;
      });
    });
    
    log(`Prepared ${photoCount} photos`, 'info');
    
    // Convert to SQL file format for wrangler CLI
    // 
    // ⚠️ SECURITY NOTE: wrangler CLI only accepts raw SQL files, not parameterized queries.
    // This script uses manual SQL escaping which is inherently less safe than prepared statements.
    // 
    // MITIGATION:
    // - This is a migration script for TRUSTED SOURCE DATA ONLY (hardcoded in travelPlaces array)
    // - Never use this pattern with user input or external data sources
    // - For runtime queries in Workers, ALWAYS use env.DB.prepare().bind() (see API endpoints)
    // 
    // For production use with external data, consider:
    // 1. Creating a separate Worker that uses D1 batch API with real prepared statements
    // 2. Validating all string inputs to reject suspicious patterns
    // 
    const sqlStatements = statements.map(stmt => {
      // Convert params to SQL string with proper escaping
      const escapedParams = stmt.params.map(p => {
        if (p === null) return 'NULL';
        if (typeof p === 'number') return p.toString();
        if (typeof p === 'string') {
          // Validate: no null bytes, no excessive special characters
          if (p.includes('\x00')) {
            throw new Error('Invalid parameter: contains null byte');
          }
          // Additional validation for potentially dangerous patterns
          const suspiciousPatterns = /(\b(DROP|DELETE|TRUNCATE|ALTER|EXEC|EXECUTE)\b)/i;
          if (suspiciousPatterns.test(p)) {
            throw new Error(`Invalid parameter: contains suspicious SQL keyword in "${p}"`);
          }
          // SQL standard escaping: single quotes doubled
          return `'${p.replace(/'/g, "''")}'`;
        }
        return `'${String(p)}'`;
      });
      
      // Replace ? placeholders sequentially, but safely by processing from left to right
      let sql = stmt.sql;
      let paramIndex = 0;
      sql = sql.replace(/\?/g, () => {
        if (paramIndex >= escapedParams.length) {
          throw new Error('SQL parameter count mismatch');
        }
        return escapedParams[paramIndex++];
      });
      
      if (paramIndex !== escapedParams.length) {
        throw new Error('SQL parameter count mismatch');
      }
      
      return sql;
    });
    
    // Execute via wrangler d1 execute
    // Wrap all statements in a transaction for atomicity
    const sqlFile = join(tmpdir(), 'migrate-data.sql');
    const transactionSql = [
      'BEGIN TRANSACTION;',
      ...sqlStatements,
      'COMMIT;'
    ].join('\n');
    writeFileSync(sqlFile, transactionSql);
    
    if (options.dryRun) {
      log(`[DRY RUN] Would execute ${statements.length} SQL statements`, 'warn');
      log(`SQL preview:\n${sqlStatements.slice(0, 3).join(';\n')};\n...`, 'info');
    } else {
      const command = `wrangler d1 execute ${dbName} --file="${sqlFile}" ${options.env === 'production' ? '--remote' : '--local'}`;
      await execCommand(command, false);
      log(`✓ Inserted ${travelPlaces.length} destinations and ${photoCount} photos`, 'success');
    }
    
  } catch (error) {
    log(`✗ D1 insertion failed: ${error}`, 'error');
    throw error;
  }
}

// ============================================================================
// Verification
// ============================================================================

async function verifyMigration(options: MigrationOptions) {
  log('\n🔍 Verifying migration...', 'info');
  
  const dbName = CONFIG[options.env].dbName;
  
  try {
    // Check destination count
    const destCountQuery = 'SELECT COUNT(*) as count FROM destinations;';
    const destCountCmd = `wrangler d1 execute ${dbName} --command="${destCountQuery}" ${options.env === 'production' ? '--remote' : '--local'} --json`;
    const destResult = options.dryRun ? '[]' : await execCommand(destCountCmd, false);
    
    // Check photo count
    const photoCountQuery = 'SELECT COUNT(*) as count FROM photos;';
    const photoCountCmd = `wrangler d1 execute ${dbName} --command="${photoCountQuery}" ${options.env === 'production' ? '--remote' : '--local'} --json`;
    const photoResult = options.dryRun ? '[]' : await execCommand(photoCountCmd, false);
    
    if (!options.dryRun) {
      const destCount = JSON.parse(destResult)[0]?.results?.[0]?.count || 0;
      const photoCount = JSON.parse(photoResult)[0]?.results?.[0]?.count || 0;
      
      const expectedDests = travelPlaces.length;
      const expectedPhotos = travelPlaces.reduce((sum, p) => sum + p.photos.length, 0);
      
      log(`\nDatabase verification:`, 'info');
      log(`  Destinations: ${destCount} / ${expectedDests} ${destCount === expectedDests ? '✓' : '✗'}`, destCount === expectedDests ? 'success' : 'error');
      log(`  Photos: ${photoCount} / ${expectedPhotos} ${photoCount === expectedPhotos ? '✓' : '✗'}`, photoCount === expectedPhotos ? 'success' : 'error');
      
      if (destCount !== expectedDests || photoCount !== expectedPhotos) {
        throw new Error('Verification failed: counts do not match');
      }
      
      log('\n✓ Migration verified successfully!', 'success');
    } else {
      log('[DRY RUN] Skipping verification', 'warn');
    }
  } catch (error) {
    log(`✗ Verification failed: ${error}`, 'error');
    throw error;
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  const options: MigrationOptions = { ...DEFAULT_OPTIONS };
  
  // Parse CLI arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--env' && args[i + 1]) {
      options.env = args[i + 1] as 'local' | 'production';
      i++;
    } else if (args[i] === '--dry-run') {
      options.dryRun = true;
    } else if (args[i] === '--skip-r2') {
      options.skipR2 = true;
    } else if (args[i] === '--skip-d1') {
      options.skipD1 = true;
    }
  }
  
  log('═══════════════════════════════════════════════════', 'info');
  log('  D1 + R2 Migration Script', 'info');
  log('═══════════════════════════════════════════════════', 'info');
  log(`Environment: ${options.env}`, 'info');
  log(`Dry run: ${options.dryRun ? 'YES' : 'NO'}`, options.dryRun ? 'warn' : 'info');
  log(`Skip R2: ${options.skipR2 ? 'YES' : 'NO'}`, 'info');
  log(`Skip D1: ${options.skipD1 ? 'YES' : 'NO'}`, 'info');
  
  // Add confirmation prompt for production
  if (options.env === 'production' && !options.dryRun) {
    log('\n⚠️  WARNING: This will DELETE all existing data in production!', 'error');
    const answer = await askConfirmation('Type "DELETE PRODUCTION DATA" to continue: ');
    if (answer !== 'DELETE PRODUCTION DATA') {
      log('\n✗ Migration cancelled', 'warn');
      process.exit(0);
    }
  }
  
  try {
    if (!options.skipR2) {
      await uploadPhotosToR2(options);
    } else {
      log('\n⏭️  Skipping R2 upload', 'warn');
    }
    
    if (!options.skipD1) {
      await insertDataToD1(options);
    } else {
      log('\n⏭️  Skipping D1 insertion', 'warn');
    }
    
    if (!options.skipR2 && !options.skipD1 && !options.dryRun) {
      await verifyMigration(options);
    }
    
    log('\n✓ Migration complete!', 'success');
    log('═══════════════════════════════════════════════════\n', 'info');
  } catch (error) {
    log(`\n✗ Migration failed: ${error}`, 'error');
    process.exit(1);
  }
}

// Run the migration script
main();
