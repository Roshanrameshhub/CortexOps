import { BaseAPI, APIError } from '../../src/datasources/BaseAPI';

// Mock node-fetch
jest.mock('node-fetch', () => jest.fn());

class TestAPI extends BaseAPI {
  public async testGet(path: string, params?: any) {
    return this.get(path, params);
  }

  public async testPost(path: string, body?: any) {
    return this.post(path, body);
  }
}

// Import fetch after mock
const fetch = require('node-fetch');

describe('BaseAPI', () => {
  let api: TestAPI;

  beforeEach(() => {
    api = new TestAPI({
      baseURL: 'http://localhost:3000',
      token: 'test-token',
    });

    fetch.mockClear();
  });

  describe('GET requests', () => {
    it('should make GET request with auth header', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => name === 'content-type' ? 'application/json' : null,
        },
        json: async () => ({ data: 'test' }),
      });

      await api.testGet('/test');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/test',
        expect.objectContaining({
          method: undefined,
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });

    it('should handle query parameters', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => name === 'content-type' ? 'application/json' : null,
        },
        json: async () => ({ data: 'test' }),
      });

      await api.testGet('/test', { param1: 'value1', param2: 42 });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('param1=value1'),
        expect.anything()
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('param2=42'),
        expect.anything()
      );
    });
  });

  describe('POST requests', () => {
    it('should make POST request with JSON body', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => name === 'content-type' ? 'application/json' : null,
        },
        json: async () => ({ data: 'created' }),
      });

      const body = { name: 'test' };
      await api.testPost('/test', body);

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/test',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(body),
        })
      );
    });
  });

  describe('Error handling', () => {
    it('should throw APIError on 404', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: {
          get: (name: string) => name === 'content-type' ? 'application/json' : null,
        },
        json: async () => ({
          message: 'Resource not found',
          code: 'NOT_FOUND',
        }),
      });

      await expect(api.testGet('/test')).rejects.toThrow(APIError);
      await expect(api.testGet('/test')).rejects.toMatchObject({
        statusCode: 404,
        errorCode: 'NOT_FOUND',
      });
    });

    it('should throw APIError on 500', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: {
          get: (name: string) => name === 'content-type' ? 'text/plain' : null,
        },
        text: async () => 'Server error',
      });

      await expect(api.testGet('/test')).rejects.toThrow(APIError);
    });
  });

  describe('Timeout', () => {
    it('should timeout after configured duration', async () => {
      const slowAPI = new TestAPI({
        baseURL: 'http://localhost:3000',
        timeout: 100,
      });

      fetch.mockImplementationOnce(() =>
        new Promise((resolve) => setTimeout(resolve, 200))
      );

      await expect(slowAPI.testGet('/test')).rejects.toThrow('Request timeout');
    });
  });
});
