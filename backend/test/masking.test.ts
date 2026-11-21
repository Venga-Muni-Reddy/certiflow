import { describe, it, expect } from 'vitest';
import { maskCandidateName } from '../src/services/certificate.service.js';

describe('Moment #4: Zero-Trust Public PII Masking', () => {
  it('correctly masks full candidate names for public lookup', () => {
    expect(maskCandidateName('Rohan Kulkarni')).toBe('R**** K****');
    expect(maskCandidateName('Aarav Reddy')).toBe('A**** R****');
    expect(maskCandidateName('Mohammad Ali Khan')).toBe('M**** A**** K****');
  });

  it('handles single-word or short names gracefully', () => {
    expect(maskCandidateName('Deepa')).toBe('D****');
    expect(maskCandidateName('Om')).toBe('O****');
  });

  it('handles empty strings safely', () => {
    expect(maskCandidateName('')).toBe('');
  });
});
