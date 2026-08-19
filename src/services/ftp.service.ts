export interface FtpUploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

export const ftpService = {
  async uploadArchive(_filePath: string, _taskId: string): Promise<FtpUploadResult> {
    // TODO: implement FTP upload
    return { success: false, error: "FTP not configured" };
  },

  async downloadFile(_remotePath: string): Promise<Buffer | null> {
    // TODO: implement FTP download
    return null;
  },

  async listFiles(_remotePath: string): Promise<string[]> {
    // TODO: implement FTP file listing
    return [];
  },
};
