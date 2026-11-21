import fs from 'fs';
import path from 'path';
import { config } from '../config/env.js';

export class StorageService {
  private localDir: string;

  constructor() {
    this.localDir = path.resolve(process.cwd(), config.storageLocalDir);
    if (!fs.existsSync(this.localDir)) {
      fs.mkdirSync(this.localDir, { recursive: true });
    }
  }

  /**
   * Save PDF certificate to storage
   */
  public async saveCertificate(
    batchId: string,
    certificateNumber: string,
    buffer: Buffer
  ): Promise<string> {
    const batchDir = path.join(this.localDir, batchId);
    if (!fs.existsSync(batchDir)) {
      fs.mkdirSync(batchDir, { recursive: true });
    }

    const filePath = path.join(batchDir, `${certificateNumber}.pdf`);
    await fs.promises.writeFile(filePath, buffer);
    return `local://${batchId}/${certificateNumber}.pdf`;
  }

  /**
   * Read certificate PDF stream/buffer
   */
  public async getCertificateBuffer(s3KeyOrPath: string): Promise<Buffer | null> {
    // If stored as local://<batchId>/<certNumber>.pdf
    let relative = s3KeyOrPath.replace(/^local:\/\//, '');
    const fullPath = path.join(this.localDir, relative);

    if (fs.existsSync(fullPath)) {
      return await fs.promises.readFile(fullPath);
    }
    return null;
  }
}

export const storageService = new StorageService();
