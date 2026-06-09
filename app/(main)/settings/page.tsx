'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { redirect } from 'next/navigation';

interface DriveFolder {
  id: string;
  name: string;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [importing, setImporting] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') redirect('/login');
  }, [status]);

  async function loadFolders() {
    const res = await fetch('/api/drive/folders');
    if (res.ok) {
      const data = await res.json();
      setFolders(data);
    }
  }

  async function loadFiles() {
    if (!selectedFolder) return;
    const res = await fetch(`/api/drive/list?folderId=${selectedFolder}`);
    if (res.ok) {
      const data = await res.json();
      setFiles(data.files || []);
    }
  }

  async function importFile(file: DriveFile) {
    setImporting(file.id);
    setMessage('');
    try {
      const res = await fetch('/api/drive/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: file.id,
          fileName: file.name,
          mimeType: file.mimeType,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`"${data.title}" importado com sucesso!`);
        setFiles((prev) => prev.filter((f) => f.id !== file.id));
      } else {
        setMessage(data.error || 'Erro ao importar');
      }
    } catch {
      setMessage('Erro de conexão');
    } finally {
      setImporting(null);
    }
  }

  if (status === 'loading') return <div className="p-8">Carregando...</div>;
  if (!session) return null;

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-8">
      <h1 className="text-2xl font-bold">Configurações</h1>

      <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Conta</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Conectado como <strong>{session.user?.email}</strong>
        </p>
      </section>

      <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Google Drive</h2>

        <button
          onClick={loadFolders}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 mb-4"
        >
          Carregar pastas
        </button>

        {folders.length > 0 && (
          <div className="space-y-2">
            <select
              value={selectedFolder}
              onChange={(e) => setSelectedFolder(e.target.value)}
              className="w-full p-2 border rounded dark:bg-gray-700"
            >
              <option value="">Selecione uma pasta</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>

            <button
              onClick={loadFiles}
              disabled={!selectedFolder}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
            >
              Listar livros
            </button>
          </div>
        )}

        {files.length > 0 && (
          <ul className="mt-4 space-y-2">
            {files.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"
              >
                <span className="truncate mr-2">{f.name}</span>
                <button
                  onClick={() => importFile(f)}
                  disabled={importing === f.id}
                  className="bg-indigo-600 text-white px-3 py-1 rounded text-sm hover:bg-indigo-700 disabled:opacity-50 shrink-0"
                >
                  {importing === f.id ? 'Importando...' : 'Importar'}
                </button>
              </li>
            ))}
          </ul>
        )}

        {message && (
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">{message}</p>
        )}
      </section>
    </div>
  );
}
