/**
 * Destinations list endpoint: GET /api/destinations
 * Query params:
 *  - year: filter by visited_at_year
 *  - continent: filter by continent
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const VALID_CONTINENTS = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania', 'Antarctica'];

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const yearParam = url.searchParams.get('year');
    const continentParam = url.searchParams.get('continent');

    let query = 'SELECT * FROM destinations WHERE 1=1';
    const bindings: (string | number)[] = [];

    // Validate and bind year parameter
    if (yearParam) {
      const year = parseInt(yearParam, 10);
      if (isNaN(year) || year < 1900 || year > 2100) {
        return Response.json(
          { error: 'Invalid year parameter. Must be a number between 1900 and 2100.' },
          { status: 400, headers: CORS_HEADERS }
        );
      }
      query += ' AND visited_at_year = ?';
      bindings.push(year);
    }

    // Validate and bind continent parameter (case-insensitive)
    if (continentParam) {
      const normalizedContinent = VALID_CONTINENTS.find(
        c => c.toLowerCase() === continentParam.toLowerCase()
      );
      
      if (!normalizedContinent) {
        return Response.json(
          { 
            error: 'Invalid continent parameter.',
            validContinents: VALID_CONTINENTS
          },
          { status: 400, headers: CORS_HEADERS }
        );
      }
      query += ' AND continent = ?';
      bindings.push(normalizedContinent);
    }

    query += ' ORDER BY visited_at_year DESC';

    const stmt = env.DB.prepare(query);
    const destinations = bindings.length > 0 
      ? await stmt.bind(...bindings).all()
      : await stmt.all();

    // Fetch photos for each destination and construct full URLs
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
    const destinationsWithPhotos = await Promise.all(
      (destinations.results as DestinationRecord[]).map(async (dest) => {
        const photos = await env.DB.prepare(
          'SELECT * FROM photos WHERE destination_id = ? AND is_visible = 1 ORDER BY sort_order ASC'
        ).bind(dest.id).all();

        // Convert R2 keys to full URLs
        const photosWithUrls = (photos.results as PhotoRecord[]).map((photo) => ({
          ...photo,
          full_url: `/api/images/${photo.full_url}`,
          thumb_url: `/api/images/${photo.thumb_url}`,
          blur_url: photo.blur_url ? `/api/images/${photo.blur_url}` : null,
        }));

        return {
          ...dest,
          year: dest.visited_at_year, // Map visited_at_year to year for frontend
          photos: photosWithUrls,
        };
      })
    );

    return Response.json(
      { data: destinationsWithPhotos },
      { headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error('Error fetching destinations:', error);
    
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
