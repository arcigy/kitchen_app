declare module "pdfjs-dist/legacy/build/pdf" {
  export const GlobalWorkerOptions: { workerSrc: string };
  export const getDocument: (src: any) => { promise: Promise<any> };
}

declare module "pdfjs-dist/legacy/build/pdf.worker?url" {
  const url: string;
  export default url;
}

