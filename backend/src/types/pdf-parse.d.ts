declare module "pdf-parse" {
  export default function pdfParse(
    data: Buffer | Uint8Array,
    options?: any,
  ): Promise<{
    text?: string;
    numpages?: number;
    numrender?: number;
    info?: any;
    metadata?: any;
    version?: string;
  }>;
}

declare module "pdfjs-dist/legacy/build/pdf.mjs" {
  export const getDocument: any;
}


