/** Sensitive value categories. Token names use these verbatim: <AADHAAR_1>. */
export type PiiType =
  | 'AADHAAR' | 'PAN' | 'CARD' | 'IFSC' | 'UPI' | 'PHONE' | 'EMAIL' | 'GSTIN'
  | 'PASSPORT' | 'VEHICLE' | 'PINCODE' | 'IP' | 'DOB'
  | 'PASSWORD' | 'OTP' | 'CVV' | 'PIN' | 'ACCOUNT' | 'SECRET'
  | 'NAME' | 'ADDRESS' | 'ORG' | 'FACE';

export type DetectorSource = 'dom_rule' | 'pattern' | 'ner' | 'ocr' | 'face';

/** A span of sensitive text found inside a string. */
export interface TextMatch {
  type: PiiType;
  start: number;
  end: number;
  value: string;
  source: DetectorSource;
  confidence: number;
}

export interface BBox { x: number; y: number; w: number; h: number }

/** Field facts the DOM rules need. Mirrors what the observe stage records. */
export interface FieldInfo {
  tag: string;
  inputType?: string;
  autocomplete?: string;
  name?: string;
  id?: string;
  label?: string;
  placeholder?: string;
  insideSensitiveForm?: boolean;
  contentEditable?: boolean;
}

export interface SensitiveDetection {
  id: string;
  type: PiiType;
  sources: DetectorSource[];
  confidence: number;
  nodeId?: string;
  bbox?: BBox;
}
