
export interface ReceiptItem {
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface ReceiptData {
  merchantName: string;
  merchantAddress?: string;
  taxId?: string;
  receiptNumber?: string;
  date: string;
  currency: string;
  items: ReceiptItem[];
  netoGravado: number;
  iva21: number;
  iva105: number;
  otrosImpuestos: number;
  descuentoGeneral: number;
  tax: number;
  total: number;
  category: string;
}

export enum ProcessingStatus {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  SCANNING = 'SCANNING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export interface BatchItem {
  id: string;
  file: File;
  preview: string;
  status: ProcessingStatus;
  data?: ReceiptData;
  error?: string;
}
