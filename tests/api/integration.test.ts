import { describe, it, expect } from 'vitest';

// Integration tests that run against a local wrangler dev server
// These test the actual Pages Functions endpoints

const API_BASE = process.env.TEST_API_URL || 'http://localhost:8788';

describe('API Integration Tests', () => {
  describe('Health Check', () => {
    it('GET /api/health returns 200 with status OK', async () => {
      const response = await fetch(`${API_BASE}/api/health`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toMatchObject({
        status: 'ok',
        timestamp: expect.any(String),
      });
    });

    it('health check includes valid ISO timestamp', async () => {
      const response = await fetch(`${API_BASE}/api/health`);
      const data = await response.json();

      const timestamp = new Date(data.timestamp);
      expect(timestamp.toString()).not.toBe('Invalid Date');
    });
  });

  describe('Destinations API', () => {
    it('GET /api/destinations returns array', async () => {
      const response = await fetch(`${API_BASE}/api/destinations`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('data');
      expect(Array.isArray(data.data)).toBe(true);
    });

    it('destination objects have required fields', async () => {
      const response = await fetch(`${API_BASE}/api/destinations`);
      const data = await response.json();

      if (data.data.length > 0) {
        const destination = data.data[0];
        expect(destination).toHaveProperty('id');
        expect(destination).toHaveProperty('name_en');
        expect(destination).toHaveProperty('name_cs');
        expect(destination).toHaveProperty('lat');
        expect(destination).toHaveProperty('lng');
        expect(destination).toHaveProperty('continent');
        expect(destination).toHaveProperty('visited_at_year');
      }
    });

    it('supports year filter', async () => {
      const response = await fetch(`${API_BASE}/api/destinations?year=2024`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('data');
      
      // If data exists, all should be from 2024
      interface Destination {
        id: string;
        visited_at_year: number;
        continent: string;
      }
      data.data.forEach((dest: Destination) => {
        expect(dest.visited_at_year).toBe(2024);
      });
    });

    it('supports continent filter', async () => {
      const response = await fetch(`${API_BASE}/api/destinations?continent=Europe`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('data');
      
      // If data exists, all should be from Europe
      interface Destination {
        continent: string;
      }
      data.data.forEach((dest: Destination) => {
        expect(dest.continent).toBe('Europe');
      });
    });

    it('returns 400 for invalid year', async () => {
      const response = await fetch(`${API_BASE}/api/destinations?year=invalid`);
      expect(response.status).toBe(400);
    });
  });

  describe('Destination Detail API', () => {
    it('GET /api/destinations/:id returns destination with photos', async () => {
      // First get list of destinations
      const listResponse = await fetch(`${API_BASE}/api/destinations`);
      const listData = await listResponse.json();

      if (listData.data.length > 0) {
        const firstDestination = listData.data[0];
        
        // Get detail
        const response = await fetch(`${API_BASE}/api/destinations/${firstDestination.id}`);
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.data).toHaveProperty('id');
        expect(data.data).toHaveProperty('photos');
        expect(Array.isArray(data.data.photos)).toBe(true);
      }
    });

    it('returns 404 for non-existent destination', async () => {
      const response = await fetch(`${API_BASE}/api/destinations/nonexistent-destination-12345`);
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });
  });

  describe('CORS Headers', () => {
    it('includes CORS headers', async () => {
      const response = await fetch(`${API_BASE}/api/health`);
      
      expect(response.headers.get('access-control-allow-origin')).toBeTruthy();
    });

    it('handles OPTIONS preflight', async () => {
      const response = await fetch(`${API_BASE}/api/health`, {
        method: 'OPTIONS',
      });

      expect([200, 204]).toContain(response.status);
      expect(response.headers.get('access-control-allow-methods')).toBeTruthy();
    });
  });
});

describe('Admin API Integration Tests', () => {
  // TEST_ADMIN_API_KEY is set in .github/workflows/test.yml and forwarded by scripts/test-server.sh
  // Fallback value allows running tests locally without setting the env var
  const TEST_API_KEY = process.env.TEST_ADMIN_API_KEY || 'test-key-for-local-dev-123';

  describe('Authentication', () => {
    it('rejects requests without auth', async () => {
      const response = await fetch(`${API_BASE}/admin/destinations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'test', name_en: 'Test' }),
      });

      expect(response.status).toBe(401);
    });

    it('rejects requests with invalid API key', async () => {
      const response = await fetch(`${API_BASE}/admin/destinations`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer wrong-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: 'test' }),
      });

      expect(response.status).toBe(401);
    });
  });

  describe('Input Validation', () => {
    it('validates required fields on POST /admin/destinations', async () => {
      const response = await fetch(`${API_BASE}/admin/destinations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TEST_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: 'test' }), // missing required fields
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('validates continent enum', async () => {
      const response = await fetch(`${API_BASE}/admin/destinations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TEST_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: 'test-validation',
          name_en: 'Test',
          name_cs: 'Test',
          description_en: 'Test',
          description_cs: 'Test',
          lat: 0,
          lng: 0,
          continent: 'InvalidContinent',
          visited_at_year: 2024,
        }),
      });

      expect(response.status).toBe(400);
    });
  });
});
