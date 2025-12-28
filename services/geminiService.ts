
import { GoogleGenAI, Type } from "@google/genai";
import { ReceiptData } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Lista extendida de modelos para fallback
const MODELS_TO_TRY = [
  'gemini-2.0-flash-exp',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite-preview-02-05',
  'gemini-2.5-flash'
];

export const processReceiptImage = async (base64Image: string): Promise<ReceiptData> => {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY_MISSING");
  }

  const prompt = `Analiza esta imagen de ticket o factura y extrae todos los detalles con 100% de precisión técnica. 
  
  REGLAS DE EXTRACCIÓN:
  1. IDIOMA: Todo el contenido descriptivo debe estar en ESPAÑOL.
  2. CUIT / TAX ID: Identifica el número de identificación fiscal. Extráelo SOLO como números, sin guiones ni espacios.
  3. NÚMERO DE COMPROBANTE: Localiza el número de factura o ticket (ej: "00024-0001577"). Mantén el formato exacto.
  4. DESGLOSE ECONÓMICO:
     - Neto Gravado: Importe base antes de impuestos.
     - IVA 21%: Monto del impuesto al 21%.
     - IVA 10.5%: Monto del impuesto al 10.5%.
     - Otros Impuestos: Suma de percepciones o tasas que no sean IVA.
     - Descuento General: Cualquier bonificación aplicada al total.
     - Impuestos Totales: Suma de IVAs y Otros Impuestos.
     - Total: Monto final de la operación.
  5. LISTADO DE ITEMS: Detalle de cada producto con su cantidad, descripción, precio unitario y precio total.
  
  Si un campo no es visible o es 0, usa 0. Devuelve estrictamente el JSON según el esquema proporcionado.`;

  const imagePart = {
    inlineData: {
      mimeType: "image/jpeg",
      data: base64Image.split(',')[1] || base64Image
    }
  };

  let lastError: any;

  // Intentar con cada modelo de la lista
  for (const model of MODELS_TO_TRY) {
    try {
      console.log(`Intentando conectar con modelo: ${model}...`);

      const response = await ai.models.generateContent({
        model: model,
        contents: [
          {
            parts: [
              { text: prompt },
              imagePart
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              merchantName: { type: Type.STRING },
              merchantAddress: { type: Type.STRING },
              taxId: { type: Type.STRING },
              receiptNumber: { type: Type.STRING },
              date: { type: Type.STRING },
              currency: { type: Type.STRING },
              category: { type: Type.STRING },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    description: { type: Type.STRING },
                    quantity: { type: Type.NUMBER },
                    unitPrice: { type: Type.NUMBER },
                    totalPrice: { type: Type.NUMBER }
                  },
                  required: ["description", "quantity", "totalPrice"]
                }
              },
              netoGravado: { type: Type.NUMBER },
              iva21: { type: Type.NUMBER },
              iva105: { type: Type.NUMBER },
              otrosImpuestos: { type: Type.NUMBER },
              descuentoGeneral: { type: Type.NUMBER },
              tax: { type: Type.NUMBER },
              total: { type: Type.NUMBER }
            },
            required: ["merchantName", "date", "items", "total", "netoGravado", "descuentoGeneral"]
          }
        }
      });

      const text = response.text;
      if (text) {
        return JSON.parse(text) as ReceiptData;
      }

    } catch (error: any) {
      console.warn(`Fallo con modelo ${model}: ${error.message}`);
      lastError = error;

      // Si el error es de cuota (429), continuamos al siguiente modelo inmediatamente
      if (error.status === 429 || error.message?.includes('429') || error.message?.includes('Quota')) {
        continue;
      }
      // Para otros errores, quizás también valga la pena probar otro modelo, 
      // pero el 429 es el principal candidato para 'fallback'.
      continue;
    }
  }

  // Si llegamos aquí, todos los modelos fallaron
  throw lastError || new Error("Todos los modelos fallaron al procesar el ticket.");
};
