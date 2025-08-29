import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

// Mock chalk and other ES modules that cause issues
jest.mock('chalk', () => ({
  default: {
    green: jest.fn((str) => str),
    red: jest.fn((str) => str),
    yellow: jest.fn((str) => str),
    blue: jest.fn((str) => str),
  }
}));

jest.mock('boxen', () => ({
  default: jest.fn((str) => str)
}));

jest.mock('ora', () => ({
  default: jest.fn(() => ({
    start: jest.fn(),
    succeed: jest.fn(),
    fail: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    stop: jest.fn(),
  }))
}));

import { loadConfig, saveConfig, Config } from '../src/commands/config';

jest.mock('fs-extra');
jest.mock('os', () => ({
  homedir: jest.fn(() => '/mock/home')
}));

const mockFs = fs as jest.Mocked<typeof fs>;
const mockOs = os as jest.Mocked<typeof os>;

describe('Config Service', () => {
  const mockConfigDir = '/mock/home/.clockify-auto-cli';
  const mockConfigFile = path.join(mockConfigDir, 'config.json');

  beforeEach(() => {
    jest.clearAllMocks();
    mockOs.homedir.mockReturnValue('/mock/home');
  });

  describe('loadConfig', () => {
    it('should return empty config if file does not exist', async () => {
      (mockFs.ensureDir as jest.Mock).mockResolvedValue(undefined);
      (mockFs.pathExists as jest.Mock).mockResolvedValue(false);

      const config = await loadConfig();

      expect(config).toEqual({});
      expect(mockFs.ensureDir).toHaveBeenCalledWith(mockConfigDir);
      expect(mockFs.pathExists).toHaveBeenCalledWith(mockConfigFile);
    });

    it('should load config from file if it exists', async () => {
      const expectedConfig: Config = {
        clockifyApiKey: 'test-key',
        workspaceId: 'workspace-123',
        projectId: 'project-456'
      };

      (mockFs.ensureDir as jest.Mock).mockResolvedValue(undefined);
      (mockFs.pathExists as jest.Mock).mockResolvedValue(true);
      mockFs.readJson.mockResolvedValue(expectedConfig);

      const config = await loadConfig();

      expect(config).toEqual(expectedConfig);
      expect(mockFs.readJson).toHaveBeenCalledWith(mockConfigFile);
    });

    it('should return empty config on error', async () => {
      (mockFs.ensureDir as jest.Mock).mockRejectedValue(new Error('Permission denied'));

      const config = await loadConfig();

      expect(config).toEqual({});
    });
  });

  describe('saveConfig', () => {
    it('should save config to file', async () => {
      const config: Config = {
        clockifyApiKey: 'test-key',
        workspaceId: 'workspace-123'
      };

      (mockFs.ensureDir as jest.Mock).mockResolvedValue(undefined);
      mockFs.writeJson.mockResolvedValue(undefined);

      await saveConfig(config);

      expect(mockFs.ensureDir).toHaveBeenCalledWith(mockConfigDir);
      expect(mockFs.writeJson).toHaveBeenCalledWith(mockConfigFile, config, { spaces: 2 });
    });

    it('should throw error if save fails', async () => {
      const config: Config = { clockifyApiKey: 'test-key' };

      (mockFs.ensureDir as jest.Mock).mockResolvedValue(undefined);
      mockFs.writeJson.mockRejectedValue(new Error('Write failed'));

      await expect(saveConfig(config)).rejects.toThrow('Write failed');
    });
  });
});