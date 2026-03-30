// app/api/cover/route.ts
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Só funciona em desenvolvimento — em produção usaremos outro approach
export async function GET(request: NextRequest) {
    const filePath = request.nextUrl.searchParams.get('path');

    if (!filePath) {
        return new NextResponse('Path não informado', { status: 400 });
    }

    // Segurança: só permite arquivos da pasta do Calibre
    const CALIBRE_PATH = 'C:\\Livros\\Calibre Portable\\Calibre Library';
    const normalizedPath = path.normalize(filePath);

    if (!normalizedPath.startsWith(path.normalize(CALIBRE_PATH))) {
        return new NextResponse('Acesso negado', { status: 403 });
    }

    if (!fs.existsSync(normalizedPath)) {
        return new NextResponse('Arquivo não encontrado', { status: 404 });
    }

    const imageBuffer = fs.readFileSync(normalizedPath);
    return new NextResponse(imageBuffer, {
        headers: {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'public, max-age=31536000, immutable',
        },
    });
}