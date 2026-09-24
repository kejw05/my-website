/**
 * Single destination endpoint: GET /api/destinations/:id
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Valid ID format: lowercase letters, numbers, and hyphens
const ID_REGEX = /^[a-z0-9-]+$/;

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
};

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  try {
    const { id } = params;

    // Validate ID format
    if (!id || typeof id !== 'string' || !ID_REGEX.test(id)) {
      return Response.json(
        { error: 'Invalid destination ID format. Must contain only lowercase letters, numbers, and hyphens.' },
        { 
          status: 400,
          headers: CORS_HEADERS,
        }
      );
    }

    const destination = await env.DB.prepare(
      'SELECT * FROM destinations WHERE id = ?'
    )
      .bind(id)
      .first();

    if (!destination) {
      return Response.json(
        { error: 'Destination not found' },
        { 
          status: 404,
          headers: CORS_HEADERS,
        }
      );
    }

    const photos = await env.DB.prepare(
      'SELECT * FROM photos WHERE destination_id = ? AND is_visible = 1 ORDER BY sort_order'
    )
      .bind(id)
      .all();

    // Convert R2 keys to full URLs
    interface PhotoRecord {
      id: string;
      destination_id: string;
      full_url: string;
      thumb_url: string;
      blur_url: string | null;
      caption_en: string | null;
      caption_cs: string | null;
      sort_order: number;
      is_visible: number;
      created_at: string;
    }
    const photosWithUrls = (photos.results as PhotoRecord[]).map((photo) => ({
      ...photo,
      full_url: `/api/images/${photo.full_url}`,
      thumb_url: `/api/images/${photo.thumb_url}`,
      blur_url: photo.blur_url ? `/api/images/${photo.blur_url}` : null,
    }));

    interface DestinationRecord {
      id: string;
      name_en: string;
      name_cs: string;
      description_en: string;
      description_cs: string;
      lat: number;
      lng: number;
      continent: string;
      visited_at_year: number;
      visited_from: string | null;
      visited_to: string | null;
      created_at: string;
      updated_at: string;
    }
    return Response.json(
      {
        data: {
          ...destination,
          year: (destination as DestinationRecord).visited_at_year, // Map visited_at_year to year for frontend
          photos: photosWithUrls,
        },
      },
      { headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error('Error fetching destination:', error);
    
    // Check if error is due to missing D1 binding
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('DB is not defined') || errorMessage.includes('Cannot read') || !env.DB) {
      return Response.json(
        {
          error: 'Database binding not configured',
          message: 'D1 database binding (DB) is not available. To fix this:\n\n' +
                   '1. Go to Cloudflare dashboard → Workers & Pages\n' +
                   '2. Select "my-website" project\n' +
                   '3. Go to Settings → Functions → D1 database bindings\n' +
                   '4. Add binding: Variable name = "DB", D1 database = "my-website-db"\n' +
                   '5. Do this for BOTH Production AND Preview environments\n' +
                   '6. Trigger a new deployment (push a commit)\n\n' +
                   'See README.md for detailed setup instructions.',
          docs: 'https://developers.cloudflare.com/pages/functions/bindings/#d1-databases'
        },
        { status: 503, headers: CORS_HEADERS }
      );
    }
    
    const isDevelopment = env.ENVIRONMENT === 'development' || !env.ENVIRONMENT;
    
    return Response.json(
      {
        error: 'Internal server error',
        ...(isDevelopment && {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        }),
      },
      { 
        status: 500,
        headers: CORS_HEADERS,
      }
    );
  }
};
