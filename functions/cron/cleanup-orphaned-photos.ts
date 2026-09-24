/**
 * Scheduled Worker: Cleanup orphaned R2 photos
 * 
 * Trigger: Cloudflare Pages doesn't support cron triggers directly.
 * For production, implement this as a separate Cloudflare Worker with cron trigger:
 * 
 * wrangler.toml:
 * ```
 * [triggers]
 * crons = ["0 2 * * *"]  # Run daily at 2 AM UTC
 * ```
 * 
 * Purpose: Clean up R2 objects that have no matching D1 record
 * This handles cases where:
 * - R2 upload succeeded but D1 insert failed
 * - Cleanup failure after D1 failure
 * - Worker crash mid-operation
 * 
 * Process:
 * 1. List all objects in PHOTOS R2 bucket
 * 2. For each object, query D1 for matching photo record
 * 3. If no record exists AND object is > 1 hour old, delete it
 * 
 * Safety: Only delete objects older than 1 hour to avoid race conditions
 * with in-progress uploads.
 */

interface Env {
  PHOTOS: R2Bucket;
  DB: D1Database;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    console.log('Starting orphaned photos cleanup job');
    
    const ONE_HOUR_MS = 60 * 60 * 1000;
    const now = Date.now();
    let deletedCount = 0;
    let checkedCount = 0;
    let errorCount = 0;
    
    try {
      // List all objects in R2 bucket
      const listed = await env.PHOTOS.list();
      
      for (const object of listed.objects) {
        checkedCount++;
        
        try {
          // Extract photo ID from key (format: destination_id/photo_id.ext or destination_id/photo_id-thumb.ext)
          // Example: "prague/123e4567-e89b-12d3-a456-426614174000.jpg"
          const parts = object.key.split('/');
          if (parts.length !== 2) {
            console.warn(`Skipping malformed key: ${object.key}`);
            continue;
          }
          
          const filename = parts[1];
          // Remove -thumb suffix and extension to get photo ID
          const photoId = filename
            .replace(/-thumb/, '')
            .replace(/\.[^.]+$/, '');
          
          // Check if photo exists in D1
          const photo = await env.DB.prepare(
            'SELECT id FROM photos WHERE id = ?'
          )
            .bind(photoId)
            .first();
          
          // If no matching record and object is old enough, delete it
          if (!photo && object.uploaded && (now - object.uploaded.getTime()) > ONE_HOUR_MS) {
            console.log(`Deleting orphaned object: ${object.key} (uploaded: ${object.uploaded.toISOString()})`);
            await env.PHOTOS.delete(object.key);
            deletedCount++;
          }
        } catch (err) {
          console.error(`Error processing object ${object.key}:`, err);
          errorCount++;
        }
      }
      
      console.log(
        `Cleanup job completed. Checked: ${checkedCount}, Deleted: ${deletedCount}, Errors: ${errorCount}`
      );
    } catch (err) {
      console.error('Cleanup job failed:', err);
      throw err;
    }
  },
};
