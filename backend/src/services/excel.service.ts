import { parse as csvParse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { CandidateRowSchema, CandidateRowInput, SpreadsheetValidationErrorDTO } from '@certiflow/shared';

export interface ParseResult {
  valid: boolean;
  errors: SpreadsheetValidationErrorDTO[];
  rows: CandidateRowInput[];
}

export class ExcelService {
  /**
   * Ingests CSV or XLSX and performs 2-pass atomic validation (Moment #1)
   */
  public parseAndValidateSpreadsheet(fileBuffer: Buffer, fileName: string): ParseResult {
    let rawRecords: any[] = [];

    const isCsv = fileName.toLowerCase().endsWith('.csv');

    try {
      if (isCsv) {
        rawRecords = csvParse(fileBuffer, {
          columns: true,
          skip_empty_lines: true,
          trim: true
        });
      } else {
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          return {
            valid: false,
            errors: [{ rowNumber: 0, field: 'file', message: 'Spreadsheet contains no sheets.' }],
            rows: []
          };
        }
        const sheet = workbook.Sheets[sheetName]!;
        rawRecords = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      }
    } catch (err: any) {
      return {
        valid: false,
        errors: [{ rowNumber: 0, field: 'file', message: `Failed to parse spreadsheet file: ${err.message}` }],
        rows: []
      };
    }

    if (rawRecords.length === 0) {
      return {
        valid: false,
        errors: [{ rowNumber: 0, field: 'file', message: 'Spreadsheet is empty; at least one candidate row is required.' }],
        rows: []
      };
    }

    if (rawRecords.length > 500) {
      return {
        valid: false,
        errors: [{ rowNumber: 0, field: 'file', message: 'Spreadsheet exceeds the maximum limit of 500 candidates per batch.' }],
        rows: []
      };
    }

    const errors: SpreadsheetValidationErrorDTO[] = [];
    const validRows: CandidateRowInput[] = [];

    const seenGovIds = new Map<string, number>();
    const seenPhones = new Map<string, number>();

    // Pass 1: Schema validation per row
    rawRecords.forEach((record, index) => {
      const rowNumber = index + 1;

      // Normalize object keys (case-insensitive & snake_case support)
      const normalized: Record<string, any> = {};
      Object.keys(record).forEach((key) => {
        const k = key.trim().toLowerCase().replace(/\s+/g, '_');
        normalized[k] = record[key];
      });

      const fullName = String(normalized.full_name || normalized.name || '').trim();
      let phoneNumber = String(normalized.phone_number || normalized.phone || normalized.mobile || '').trim();
      // Auto-format 10 digit to standard +91 if needed
      if (/^[6-9]\d{9}$/.test(phoneNumber)) {
        phoneNumber = `+91${phoneNumber}`;
      }

      const candidateGovId = String(normalized.candidate_gov_id || normalized.gov_id || normalized.roll_id || normalized.id || '').trim();
      const rawScore = normalized.assessment_score || normalized.score;
      const assessmentScore = typeof rawScore === 'number' ? rawScore : parseFloat(String(rawScore || '0'));

      let completionDate = String(normalized.completion_date || normalized.date || '').trim();
      // Handle Excel date serial or ISO conversion
      if (/^\d{5}$/.test(completionDate)) {
        const dateObj = new Date((parseInt(completionDate, 10) - 25569) * 86400 * 1000);
        completionDate = dateObj.toISOString().split('T')[0]!;
      }

      const rowData = {
        fullName,
        phoneNumber,
        candidateGovId,
        assessmentScore,
        completionDate
      };

      const result = CandidateRowSchema.safeParse(rowData);
      if (!result.success) {
        result.error.errors.forEach((err) => {
          errors.push({
            rowNumber,
            field: err.path.join('.'),
            message: err.message
          });
        });
      } else {
        // Pass 2: Uniqueness within the sheet
        if (candidateGovId) {
          if (seenGovIds.has(candidateGovId)) {
            errors.push({
              rowNumber,
              field: 'candidate_gov_id',
              message: `Duplicate Candidate ID '${candidateGovId}' found (first seen on row ${seenGovIds.get(candidateGovId)}).`
            });
          } else {
            seenGovIds.set(candidateGovId, rowNumber);
          }
        }

        if (phoneNumber) {
          if (seenPhones.has(phoneNumber)) {
            errors.push({
              rowNumber,
              field: 'phone_number',
              message: `Duplicate Phone Number '${phoneNumber}' found (first seen on row ${seenPhones.get(phoneNumber)}).`
            });
          } else {
            seenPhones.set(phoneNumber, rowNumber);
          }
        }

        validRows.push(result.data);
      }
    });

    // If any error exists in either pass, fail the whole file atomically
    if (errors.length > 0) {
      return {
        valid: false,
        errors,
        rows: []
      };
    }

    return {
      valid: true,
      errors: [],
      rows: validRows
    };
  }
}

export const excelService = new ExcelService();
