import { describe, expect, it } from 'vitest';
import { labelValueMatch } from '../src/redact';

describe('OCR label: value rule', () => {
  it('masks the value after a PII label', () => {
    expect(labelValueMatch('Name: Diptendu Sharma')).toMatchObject({ type: 'NAME', value: 'Diptendu Sharma', start: 6 });
    expect(labelValueMatch('DOB: 12/03/1991')?.type).toBe('DOB');
    expect(labelValueMatch("Father's Name : R K Rao")?.type).toBe('NAME');
    expect(labelValueMatch('Aadhaar: 2345 6789 0124')?.type).toBe('AADHAAR');
  });
  it('leaves non-PII lines alone', () => {
    expect(labelValueMatch('Ref 407220213972')).toBeNull();
    expect(labelValueMatch('Order #34855136')).toBeNull();
    expect(labelValueMatch('Status: Approved')).toBeNull();
    expect(labelValueMatch('GOVERNMENT OF INDIA')).toBeNull();
  });
});
