// app/api/extract-document/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    // Require authentication
    await getAuthenticatedUserId(req);
    
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { ok: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // Check file size (limit to 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      );
    }

    const fileName = file.name.toLowerCase();
    let extractedText = '';

    // Handle text files
    if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
      extractedText = await file.text();
    }
    // Handle PDF files
    else if (fileName.endsWith('.pdf')) {
      try {
        // For PDFs, we'll use a simple approach with pdfjs-dist or pdf-parse
        // For now, let's use a basic implementation that works with the OpenAI API
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Use dynamic import for pdf-parse
        const pdfParse = (await import('pdf-parse')).default;
        const pdfData = await pdfParse(buffer);
        extractedText = pdfData.text;
      } catch (err) {
        console.error('PDF parsing error:', err);
        return NextResponse.json(
          { ok: false, error: 'Failed to parse PDF. Please try a text file instead.' },
          { status: 400 }
        );
      }
    }
    // Handle Word documents
    else if (fileName.endsWith('.docx')) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Use dynamic import for mammoth
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ buffer });
        extractedText = result.value;
      } catch (err) {
        console.error('Word document parsing error:', err);
        return NextResponse.json(
          { ok: false, error: 'Failed to parse Word document. Please try a text file instead.' },
          { status: 400 }
        );
      }
    }
    // Handle older .doc files
    else if (fileName.endsWith('.doc')) {
      return NextResponse.json(
        { ok: false, error: 'Legacy .doc format not supported. Please convert to .docx, PDF, or text file.' },
        { status: 400 }
      );
    }
    else {
      return NextResponse.json(
        { ok: false, error: 'Unsupported file type. Please upload PDF, DOCX, TXT, or MD files.' },
        { status: 400 }
      );
    }

    // Limit text length (100,000 characters should be plenty)
    if (extractedText.length > 100000) {
      extractedText = extractedText.substring(0, 100000) + '\n\n[Document truncated due to length]';
    }

    if (!extractedText.trim()) {
      return NextResponse.json(
        { ok: false, error: 'Could not extract text from document' },
        { status: 400 }
      );
    }

    return NextResponse.json({ 
      ok: true, 
      text: extractedText,
      fileName: file.name,
      fileSize: file.size,
    });
  } catch (err: any) {
    console.error('Error in /api/extract-document:', err);
    const status = err?.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status }
    );
  }
}
