export interface ExportProgress {
  frame: number;
  total: number;
}

export type ExportMethod = 'webcodecs' | 'mediarecorder';

export interface ExportResult {
  blob: Blob;
  method: ExportMethod;
  /** extensão do arquivo final ("mp4" ou "webm") */
  extension: string;
}
