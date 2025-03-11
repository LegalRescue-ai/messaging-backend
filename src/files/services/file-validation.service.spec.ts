import { Test, TestingModule } from '@nestjs/testing';
import { FileValidationService } from './file-validation.service';
import { BadRequestException } from '@nestjs/common';

describe('FileValidationService', () => {
  let service: FileValidationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FileValidationService],
    }).compile();

    service = module.get(FileValidationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateFile', () => {
    it('should validate a valid PDF file', async () => {
      const mockFile = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 1024 * 1024, // 1MB
        buffer: Buffer.from('%PDF-1.4', 'utf-8'),
      } as Express.Multer.File;

      await expect(service.validateFile(mockFile)).resolves.not.toThrow();
    });

    it('should validate a valid JPEG image', async () => {
      const mockFile = {
        originalname: 'test.jpg',
        mimetype: 'image/jpeg',
        size: 1024 * 1024, // 1MB
        buffer: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]),
      } as Express.Multer.File;

      await expect(service.validateFile(mockFile)).resolves.not.toThrow();
    });

    it('should reject files with invalid mime types', async () => {
      const mockFile = {
        originalname: 'test.exe',
        mimetype: 'application/x-msdownload',
        size: 1024,
        buffer: Buffer.from([]),
      } as Express.Multer.File;

      await expect(service.validateFile(mockFile)).rejects.toThrow(BadRequestException);
    });

    it('should reject files that exceed size limit', async () => {
      const mockFile = {
        originalname: 'large.pdf',
        mimetype: 'application/pdf',
        size: 20 * 1024 * 1024, // 20MB
        buffer: Buffer.from('%PDF-1.4', 'utf-8'),
      } as Express.Multer.File;

      await expect(service.validateFile(mockFile)).rejects.toThrow(BadRequestException);
    });

    it('should reject files with blocked extensions', async () => {
      const mockFile = {
        originalname: 'script.bat',
        mimetype: 'text/plain',
        size: 1024,
        buffer: Buffer.from([]),
      } as Express.Multer.File;

      await expect(service.validateFile(mockFile)).rejects.toThrow(BadRequestException);
    });

    it('should reject files with mismatched content type', async () => {
      const mockFile = {
        originalname: 'fake.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), // JPEG magic numbers
      } as Express.Multer.File;

      await expect(service.validateFile(mockFile)).rejects.toThrow(BadRequestException);
    });
  });
});
