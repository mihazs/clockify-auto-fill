import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { loadConfig, saveConfig, Config } from '../src/commands/config';

jest.mock('fs-extra');
jest.mock('os');

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
      mockFs.ensureDir.mockResolvedValue(undefined);
      mockFs.pathExists.mockResolvedValue(false);

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

      mockFs.ensureDir.mockResolvedValue(undefined);
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readJson.mockResolvedValue(expectedConfig);

      const config = await loadConfig();

      expect(config).toEqual(expectedConfig);
      expect(mockFs.readJson).toHaveBeenCalledWith(mockConfigFile);
    });

    it('should return empty config on error', async () => {
      mockFs.ensureDir.mockRejectedValue(new Error('Permission denied'));

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

      mockFs.ensureDir.mockResolvedValue(undefined);
      mockFs.writeJson.mockResolvedValue(undefined);

      await saveConfig(config);

      expect(mockFs.ensureDir).toHaveBeenCalledWith(mockConfigDir);
      expect(mockFs.writeJson).toHaveBeenCalledWith(mockConfigFile, config, { spaces: 2 });
    });

    it('should throw error if save fails', async () => {
      const config: Config = { clockifyApiKey: 'test-key' };

      mockFs.ensureDir.mockResolvedValue(undefined);
      mockFs.writeJson.mockRejectedValue(new Error('Write failed'));

      await expect(saveConfig(config)).rejects.toThrow('Write failed');
    });
  });
});