import { Injectable, BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';

@Injectable()
export class FileValidationService {
  private readonly ALLOWED_MIME_TYPES = {
    'application/pdf': { maxSize: 10 * 1024 * 1024 }, // 10MB
    'application/msword': { maxSize: 5 * 1024 * 1024 }, // 5MB
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { maxSize: 5 * 1024 * 1024 },
    'image/jpeg': { maxSize: 5 * 1024 * 1024 },
    'image/png': { maxSize: 5 * 1024 * 1024 },
    'image/gif': { maxSize: 5 * 1024 * 1024 },
    'text/plain': { maxSize: 1 * 1024 * 1024 }, // 1MB
  };

  private readonly BLOCKED_FILE_PATTERNS = [
    /\.exe$/i,
    /\.dll$/i,
    /\.bat$/i,
    /\.cmd$/i,
    /\.sh$/i,
    /\.app$/i,
  ];

  async validateFile(file: Express.Multer.File): Promise<void> {
    await this.validateMimeType(file);
    await this.validateFileSize(file);
    await this.validateFileName(file);
    await this.validateFileContent(file);
  }

  private async validateMimeType(file: Express.Multer.File): Promise<void> {
    if (!this.ALLOWED_MIME_TYPES[file.mimetype]) {
      throw new BadRequestException(`File type ${file.mimetype} is not allowed`);
    }
  }

  private async validateFileSize(file: Express.Multer.File): Promise<void> {
    const maxSize = this.ALLOWED_MIME_TYPES[file.mimetype].maxSize;
    if (file.size > maxSize) {
      throw new BadRequestException(`File size exceeds maximum allowed size of ${maxSize / 1024 / 1024}MB`);
    }
  }

  private async validateFileName(file: Express.Multer.File): Promise<void> {
    const isBlocked = this.BLOCKED_FILE_PATTERNS.some(pattern => 
      pattern.test(file.originalname)
    );
    
    if (isBlocked) {
      throw new BadRequestException('File type not allowed for security reasons');
    }
  }

  private async validateFileContent(file: Express.Multer.File): Promise<void> {
    // Calculate file hash for integrity check
    const hash = createHash('sha256');
    hash.update(file.buffer);
    const fileHash = hash.digest('hex');

    // Basic magic number check for common file types
    const header = file.buffer.slice(0, 4).toString('hex');
    const mimeType = file.mimetype;

    const isValid = await this.validateMagicNumbers(header, mimeType);
    if (!isValid) {
      throw new BadRequestException('File content does not match declared type');
    }
  }

  private async validateMagicNumbers(header: string, mimeType: string): Promise<boolean> {
    const magicNumbers = {
      'application/pdf': '25504446',
      'image/jpeg': ['ffd8ffe0', 'ffd8ffe1'],
      'image/png': '89504e47',
      'image/gif': '47494638'
    };

    if (!magicNumbers[mimeType]) {
      return true; // Skip validation for unknown types
    }

    const validHeaders = Array.isArray(magicNumbers[mimeType])
      ? magicNumbers[mimeType]
      : [magicNumbers[mimeType]];

    return validHeaders.some(validHeader => header.startsWith(validHeader));
  }
}
