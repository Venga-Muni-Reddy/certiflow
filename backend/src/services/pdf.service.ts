import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { config } from '../config/env.js';

export interface CertificateRenderParams {
  certificateNumber: string;
  candidateName: string;
  courseName: string;
  trainingCentreName: string;
  districtName: string;
  assessmentScore: number;
  completionDate: string;
}

export class PdfService {
  /**
   * Renders an official Pragati Skills Mission certificate into a PDF buffer
   */
  public async generateCertificatePdf(params: CertificateRenderParams): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({
          layout: 'landscape',
          size: 'A4',
          margin: 40
        });

        const buffers: Buffer[] = [];
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        const width = doc.page.width;
        const height = doc.page.height;

        // 1. Decorative Borders
        doc.rect(20, 20, width - 40, height - 40)
           .lineWidth(3)
           .strokeColor('#075E54')
           .stroke();

        doc.rect(26, 26, width - 52, height - 52)
           .lineWidth(1)
           .strokeColor('#D4AF37') // Gold accent
           .stroke();

        // 2. Header & Emblem
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#075E54')
           .text('PRAGATI SKILLS MISSION', 0, 55, { align: 'center' });

        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#64748B')
           .text('STATE DIRECTORATE OF SKILL DEVELOPMENT & ENTREPRENEURSHIP', 0, 75, { align: 'center' });

        doc.moveDown(1);
        doc.fontSize(22)
           .font('Helvetica-Bold')
           .fillColor('#0F172A')
           .text('CERTIFICATE OF VOCATIONAL COMPETENCE', 0, 110, { align: 'center' });

        doc.fontSize(11)
           .font('Helvetica')
           .fillColor('#475569')
           .text('This is to certify that', 0, 150, { align: 'center' });

        // 3. Candidate Name
        doc.fontSize(24)
           .font('Helvetica-Bold')
           .fillColor('#075E54')
           .text(params.candidateName.toUpperCase(), 0, 175, { align: 'center' });

        // 4. Achievement Description
        doc.fontSize(12)
           .font('Helvetica')
           .fillColor('#334155')
           .text(
             `has successfully completed the formal skilling course in`,
             0,
             215,
             { align: 'center' }
           );

        doc.fontSize(16)
           .font('Helvetica-Bold')
           .fillColor('#0F172A')
           .text(params.courseName, 0, 235, { align: 'center' });

        doc.fontSize(11)
           .font('Helvetica')
           .fillColor('#475569')
           .text(
             `at ${params.trainingCentreName} (${params.districtName}) with an assessment score of ${params.assessmentScore.toFixed(1)}%.`,
             0,
             265,
             { align: 'center' }
           );

        // 5. Verification QR Code
        const verifyUrl = `${config.publicAppUrl}/verify/${params.certificateNumber}`;
        const qrBuffer = await QRCode.toBuffer(verifyUrl, {
          width: 100,
          margin: 1,
          color: { dark: '#075E54', light: '#FFFFFF' }
        });

        doc.image(qrBuffer, 60, height - 150, { width: 90, height: 90 });
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#64748B')
           .text('Scan to Verify Authenticity', 55, height - 55, { width: 100, align: 'center' });

        // 6. Certificate Metadata (Center Bottom)
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#0F172A')
           .text(`Certificate No: ${params.certificateNumber}`, width / 2 - 100, height - 120, { align: 'center' });

        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#64748B')
           .text(`Issued On: ${params.completionDate}`, width / 2 - 100, height - 105, { align: 'center' });

        doc.text('Tamper-proof Cryptographic Verification via CertiFlow', width / 2 - 150, height - 90, { align: 'center', width: 300 });

        // 7. Signatory Seal (Right Bottom)
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor('#075E54')
           .text('Farah Directorate', width - 210, height - 110, { align: 'center', width: 150 });

        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#64748B')
           .text('State Competency Authority\nPragati Skills Mission', width - 210, height - 95, { align: 'center', width: 150 });

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}

export const pdfService = new PdfService();
