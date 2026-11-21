import { describe, it, expect } from 'vitest';
import { excelService } from '../src/services/excel.service.js';

describe('Moment #1: Atomic Spreadsheet Ingestion Engine', () => {
  it('detects malformed Indian mobile number and rejects entire file without partial saves', () => {
    const invalidCsv = `full_name,phone_number,candidate_gov_id,assessment_score,completion_date
Rohan Kulkarni,99999,GOV-101,85.5,2026-11-15
Priya Sharma,+919876543210,GOV-102,90.0,2026-11-15`;

    const result = excelService.parseAndValidateSpreadsheet(Buffer.from(invalidCsv), 'test.csv');

    expect(result.valid).toBe(false);
    expect(result.rows.length).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);

    const phoneError = result.errors.find((e) => e.field === 'phoneNumber');
    expect(phoneError).toBeDefined();
    expect(phoneError?.rowNumber).toBe(1);
  });

  it('detects duplicate candidate IDs within the file and returns line-level error', () => {
    const duplicateCsv = `full_name,phone_number,candidate_gov_id,assessment_score,completion_date
Rohan Kulkarni,+919876543211,GOV-DUPLICATE,85.5,2026-11-15
Priya Sharma,+919876543212,GOV-DUPLICATE,90.0,2026-11-15`;

    const result = excelService.parseAndValidateSpreadsheet(Buffer.from(duplicateCsv), 'candidates.csv');

    expect(result.valid).toBe(false);
    expect(result.rows.length).toBe(0);

    const dupError = result.errors.find((e) => e.field === 'candidate_gov_id');
    expect(dupError).toBeDefined();
    expect(dupError?.rowNumber).toBe(2);
    expect(dupError?.message).toContain("first seen on row 1");
  });

  it('detects invalid assessment scores outside 0-100 range', () => {
    const invalidScoreCsv = `full_name,phone_number,candidate_gov_id,assessment_score,completion_date
Rohan Kulkarni,+919876543211,GOV-101,105.0,2026-11-15`;

    const result = excelService.parseAndValidateSpreadsheet(Buffer.from(invalidScoreCsv), 'scores.csv');

    expect(result.valid).toBe(false);
    const scoreError = result.errors.find((e) => e.field === 'assessmentScore');
    expect(scoreError).toBeDefined();
    expect(scoreError?.message).toContain('Score cannot exceed 100');
  });

  it('successfully validates completely valid candidate CSV', () => {
    const validCsv = `full_name,phone_number,candidate_gov_id,assessment_score,completion_date
Rohan Kulkarni,+919876543211,GOV-101,85.5,2026-11-15
Priya Sharma,+919876543212,GOV-102,92.0,2026-11-15
Aarav Reddy,+919876543213,GOV-103,78.0,2026-11-15`;

    const result = excelService.parseAndValidateSpreadsheet(Buffer.from(validCsv), 'valid.csv');

    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
    expect(result.rows.length).toBe(3);
    expect(result.rows[0]?.fullName).toBe('Rohan Kulkarni');
    expect(result.rows[0]?.assessmentScore).toBe(85.5);
  });
});
