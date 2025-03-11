export interface FileMetadata {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: Date;
  hash: string;
  securityScan?: {
    status: 'pending' | 'completed' | 'failed';
    scannedAt?: Date;
    threats?: string[];
  };
  metadata?: {
    dimensions?: {
      width: number;
      height: number;
    };
    duration?: number; // For audio/video files
    pageCount?: number; // For documents
    [key: string]: any;
  };
}
