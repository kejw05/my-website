/**
 * Admin photo upload endpoint: POST /admin/photos/upload
 * Multipart upload → process image → upload to R2 (full, thumb, blur) → insert to D1
 * 
 * Orphaned File Handling:
 * If cleanup fails after a D1 error, orphaned files remain in R2.
 * See functions/cron/cleanup-orphaned-photos.ts for a scheduled cleanup worker
 * that scans R2 and removes files without matching D1 records (older than 1 hour).
 * 
 * To deploy the cleanup worker:
 * 1. Copy cleanup-orphaned-photos.ts to a separate Worker project
 * 2. Configure cron trigger in wrangler.toml: crons = ["0 2 * * *"]
 * 3. Deploy as a separate Worker (Pages Functions don't support cron triggers)
 */

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Generate a simple blur placeholder (10x10 px base64-encoded image)
 * In production, use a proper image processing library
 */
function generateBlurPlaceholder(): string {
  // Simple 10x10 gray square as blur placeholder
  // In real implementation: downscale image to 10x10 and encode
  return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjY2NjIi8+PC9zdmc+';
}

/**
 * Process image - placeholder for actual image processing
 * Note: Cloudflare Workers don't have built-in image processing
 * Options:
 * 1. Use Cloudflare Images API (paid service)
 * 2. Use third-party service (sharp via wasm, etc.)
 * 3. Upload original and process client-side or in a separate worker
 * 
 * For now: we'll accept pre-processed images or process with basic canvas resizing
 */
async function processImage(
  imageData: ArrayBuffer
): Promise<{
  full: ArrayBuffer;
  thumb: ArrayBuffer;
  blur: string;
}> {
  // TODO: Implement actual image processing
  // For MVP: just use the original image for all variants
  // In production: use sharp.wasm or Cloudflare Images
  
  return {
    full: imageData,
    thumb: imageData, // Should be resized to ~400px width
    blur: generateBlurPlaceholder(),
  };
}

/**
 * Parse multipart form data with size limit
 * Returns files and fields
 */
async function parseMultipartForm(
  request: Request,
  maxSize: number
): Promise<{
  files: Map<string, { name: string; data: ArrayBuffer; type: string }>;
  fields: Map<string, string>;
}> {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    throw new Error('Content-Type must be multipart/form-data');
  }

  // CRITICAL: Check Content-Length header BEFORE calling request.formData()
  // This prevents memory exhaustion from malicious uploads.
  // 
  // Without this check: A 50MB upload would call formData(), which loads the entire
  // request body into memory BEFORE we can validate size. Workers have a 128MB memory limit,
  // so large uploads could exhaust memory and crash the Worker.
  // 
  // With this check: We reject oversized requests before parsing, preventing memory exhaustion.
  // 
  // Note: Content-Length is set by HTTP clients and can be trusted for size validation.
  // However, it can be missing for chunked transfers (rare for file uploads).
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (size > maxSize) {
      throw new Error(`Request size ${size} bytes exceeds maximum allowed size of ${maxSize / 1024 / 1024}MB`);
    }
  } else {
    // No Content-Length header (rare for file uploads, but possible)
    // Proceed with parsing but will validate file size after formData parsing
    console.warn('Content-Length header missing, cannot pre-validate request size');
  }

  const formData = await request.formData();
  const files = new Map<string, { name: string; data: ArrayBuffer; type: string }>();
  const fields = new Map<string, string>();

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      // Secondary size check after parsing (backup if Content-Length was missing)
      // NOTE: At this point, the file is already in memory, so this is a fallback defense.
      // The Content-Length check above is the primary protection.
      if (value.size > maxSize) {
        throw new Error(`File size exceeds maximum allowed size of ${maxSize / 1024 / 1024}MB`);
      }
      
      files.set(key, {
        name: value.name,
        data: await value.arrayBuffer(),
        type: value.type,
      });
    } else {
      fields.set(key, value);
    }
  }

  return { files, fields };
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let uploadedKeys: string[] = [];
  
  try {
    // Parse multipart form with size limit
    const { files, fields } = await parseMultipartForm(request, MAX_FILE_SIZE);

    // Validate required fields
    const destination_id = fields.get('destination_id');
    if (!destination_id) {
      return Response.json(
        { error: 'destination_id is required' },
        { status: 400 }
      );
    }

    // Check if destination exists
    const destination = await env.DB.prepare(
      'SELECT id FROM destinations WHERE id = ?'
    )
      .bind(destination_id)
      .first();

    if (!destination) {
      return Response.json(
        { error: 'Destination not found' },
        { status: 404 }
      );
    }

    // Get image file
    const imageFile = files.get('image');
    if (!imageFile) {
      return Response.json(
        { error: 'image file is required' },
        { status: 400 }
      );
    }

    // Validate image type
    if (!imageFile.type.startsWith('image/')) {
      return Response.json(
        { error: 'File must be an image' },
        { status: 400 }
      );
    }

    // Generate unique ID using crypto.randomUUID() to prevent race conditions
    // Note: crypto.randomUUID() is cryptographically secure and prevents race conditions
    // that could occur with sequential ID generation or timestamp-based IDs
    const photoId = crypto.randomUUID();
    const ext = imageFile.name.split('.').pop() || 'jpg';

    // Process image (generate full, thumb, blur variants)
    const processed = await processImage(imageFile.data);

    // Generate R2 keys WITHOUT leading slash (to match /api/images/[key].ts route)
    const fullKey = `${destination_id}/${photoId}.${ext}`;
    const thumbKey = `${destination_id}/${photoId}-thumb.${ext}`;

    // Upload to R2
    try {
      await Promise.all([
        env.PHOTOS.put(fullKey, processed.full, {
          httpMetadata: {
            contentType: imageFile.type,
          },
        }),
        env.PHOTOS.put(thumbKey, processed.thumb, {
          httpMetadata: {
            contentType: imageFile.type,
          },
        }),
      ]);
      
      uploadedKeys = [fullKey, thumbKey];
    } catch (r2Error) {
      console.error('R2 upload failed:', r2Error);
      throw new Error('Failed to upload images to storage');
    }

    // Parse optional fields with validation
    const caption_en = fields.get('caption_en') || null;
    const caption_cs = fields.get('caption_cs') || null;
    
    const sortOrderStr = fields.get('sort_order') || '0';
    const sort_order = parseInt(sortOrderStr, 10);
    if (isNaN(sort_order)) {
      return Response.json(
        { error: 'sort_order must be a valid integer' },
        { status: 400 }
      );
    }
    
    const is_visible = fields.get('is_visible') === 'false' ? 0 : 1;

    // Insert to D1 (with cleanup on failure)
    const now = new Date().toISOString();
    try {
      await env.DB.prepare(`
        INSERT INTO photos (
          id, destination_id, full_url, thumb_url, blur_url,
          caption_en, caption_cs, sort_order, is_visible, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(
          photoId,
          destination_id,
          fullKey,
          thumbKey,
          processed.blur, // Store blur as data URL
          caption_en,
          caption_cs,
          sort_order,
          is_visible,
          now
        )
        .run();
    } catch (dbError) {
      console.error('D1 insert failed after R2 upload:', dbError);
      
      // Cleanup orphaned R2 files
      // If this fails, files remain in R2 forever without matching D1 records
      try {
        await Promise.all(
          uploadedKeys.map(key => env.PHOTOS.delete(key).catch(err => {
            console.error(`CRITICAL: Failed to cleanup R2 object ${key}:`, err);
            // Orphaned file alert - needs manual intervention or scheduled cleanup
          }))
        );
        console.log('Cleaned up orphaned R2 files after DB failure:', uploadedKeys);
      } catch (cleanupError) {
        console.error('CRITICAL: Cleanup failed, orphaned files in R2:', uploadedKeys, cleanupError);
      }
      
      throw new Error('Failed to save photo metadata');
    }

    // Fetch created photo
    const created = await env.DB.prepare(
      'SELECT * FROM photos WHERE id = ?'
    )
      .bind(photoId)
      .first();

    return Response.json(
      { data: created },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error uploading photo:', error);
    
    const isDevelopment = env.ENVIRONMENT === 'development' || !env.ENVIRONMENT;
    
    return Response.json(
      {
        error: 'Internal server error',
        ...(isDevelopment && {
          message: error instanceof Error ? error.message : 'Unknown error',
        }),
      },
      { status: 500 }
    );
  }
};
