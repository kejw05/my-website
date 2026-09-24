/**
 * Admin photo endpoints:
 * - PATCH /admin/photos/:id — update caption, sort_order, visibility
 * - DELETE /admin/photos/:id — delete from R2 + D1
 */

// Allowlist for updatable columns to prevent SQL injection
const ALLOWED_COLUMNS = new Set([
  'caption_en',
  'caption_cs',
  'sort_order',
  'is_visible',
]);

interface UpdatePhotoInput {
  caption_en?: string | null;
  caption_cs?: string | null;
  sort_order?: number;
  is_visible?: boolean;
}

/**
 * Check if a URL is an R2 key (not a data URL)
 */
function isR2Key(url: string | null | undefined): boolean {
  return typeof url === 'string' && url.length > 0 && !url.startsWith('data:');
}

/**
 * PATCH /admin/photos/:id
 * Update photo metadata (caption, sort, visibility)
 */
export const onRequestPatch: PagesFunction<Env> = async ({ params, request, env }) => {
  try {
    const { id } = params;

    if (!id || typeof id !== 'string') {
      return Response.json(
        { error: 'Invalid photo ID' },
        { status: 400 }
      );
    }

    // Check if photo exists
    const existing = await env.DB.prepare(
      'SELECT * FROM photos WHERE id = ?'
    )
      .bind(id)
      .first();

    if (!existing) {
      return Response.json(
        { error: 'Photo not found' },
        { status: 404 }
      );
    }

    const input: UpdatePhotoInput = await request.json();

    // Validate input
    const errors: string[] = [];
    
    if (input.sort_order !== undefined && !Number.isInteger(input.sort_order)) {
      errors.push('sort_order must be an integer');
    }
    
    if (input.is_visible !== undefined && typeof input.is_visible !== 'boolean') {
      errors.push('is_visible must be a boolean');
    }

    if (errors.length > 0) {
      return Response.json(
        { error: 'Validation failed', details: errors },
        { status: 400 }
      );
    }

    // Build dynamic UPDATE query with column allowlist
    const updates: string[] = [];
    const bindings: (string | number | null)[] = [];

    if (input.caption_en !== undefined) {
      updates.push('caption_en = ?');
      bindings.push(input.caption_en);
    }
    if (input.caption_cs !== undefined) {
      updates.push('caption_cs = ?');
      bindings.push(input.caption_cs);
    }
    if (input.sort_order !== undefined) {
      updates.push('sort_order = ?');
      bindings.push(input.sort_order);
    }
    if (input.is_visible !== undefined) {
      updates.push('is_visible = ?');
      bindings.push(input.is_visible ? 1 : 0);
    }

    if (updates.length === 0) {
      return Response.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    // Verify all column names are in allowlist (defense in depth)
    for (const update of updates) {
      const columnName = update.split(' = ')[0];
      if (!ALLOWED_COLUMNS.has(columnName)) {
        console.error(`Attempted to update non-allowlisted column: ${columnName}`);
        return Response.json(
          { error: 'Invalid field' },
          { status: 400 }
        );
      }
    }

    // Add id to bindings (for WHERE clause)
    bindings.push(id);

    const query = `UPDATE photos SET ${updates.join(', ')} WHERE id = ?`;
    await env.DB.prepare(query).bind(...bindings).run();

    // Fetch updated photo
    const updated = await env.DB.prepare(
      'SELECT * FROM photos WHERE id = ?'
    )
      .bind(id)
      .first();

    return Response.json({ data: updated });
  } catch (error) {
    console.error('Error updating photo:', error);
    
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

/**
 * DELETE /admin/photos/:id
 * Delete photo from R2 and D1
 */
export const onRequestDelete: PagesFunction<Env> = async ({ params, env }) => {
  try {
    const { id } = params;

    if (!id || typeof id !== 'string') {
      return Response.json(
        { error: 'Invalid photo ID' },
        { status: 400 }
      );
    }

    // Fetch photo to get R2 keys
    const photo = await env.DB.prepare(
      'SELECT full_url, thumb_url, blur_url FROM photos WHERE id = ?'
    )
      .bind(id)
      .first();

    if (!photo) {
      return Response.json(
        { error: 'Photo not found' },
        { status: 404 }
      );
    }

    interface PhotoRecord {
      full_url: string | null;
      thumb_url: string | null;
      blur_url: string | null;
    }
    const photoData = photo as PhotoRecord;

    // Delete from R2 (only actual R2 keys, not data URLs)
    const r2Deletions: Promise<void>[] = [];
    
    if (isR2Key(photoData.full_url)) {
      r2Deletions.push(
        env.PHOTOS.delete(photoData.full_url).catch(err => {
          console.error(`Failed to delete R2 object ${photoData.full_url}:`, err);
        })
      );
    }
    if (isR2Key(photoData.thumb_url)) {
      r2Deletions.push(
        env.PHOTOS.delete(photoData.thumb_url).catch(err => {
          console.error(`Failed to delete R2 object ${photoData.thumb_url}:`, err);
        })
      );
    }
    if (isR2Key(photoData.blur_url)) {
      r2Deletions.push(
        env.PHOTOS.delete(photoData.blur_url).catch(err => {
          console.error(`Failed to delete R2 object ${photoData.blur_url}:`, err);
        })
      );
    }

    await Promise.all(r2Deletions);

    // Delete from D1
    await env.DB.prepare('DELETE FROM photos WHERE id = ?')
      .bind(id)
      .run();

    return Response.json(
      { message: 'Photo deleted' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting photo:', error);
    
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
