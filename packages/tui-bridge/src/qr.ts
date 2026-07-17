import QRCode from "qrcode";

export async function printQr(text: string): Promise<string> {
  return QRCode.toString(text, { type: "terminal", small: true });
}